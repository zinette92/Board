/**
 * Pont vers Google Agenda, côté serveur (fonction Vercel).
 *
 * Le navigateur ne peut pas parler à Google directement : la clé du compte de
 * service est un secret, et elle n'a rien à faire dans un bundle. Cette
 * fonction est le seul endroit qui la voit. Les agendas du user sont partagés
 * avec l'adresse du compte de service (« Apporter des modifications ») — aucun
 * écran OAuth, aucune vérification Google : c'est le modèle déjà utilisé pour
 * le miroir Sheets de goals-tracker.
 *
 * PLUSIEURS AGENDAS. La liste n'est pas stockée par l'application : c'est la
 * `calendarList` du compte de service qui en tient lieu. Un agenda partagé
 * n'y entre pas tout seul — il faut l'y inscrire (`addCalendar`), et c'est
 * précisément ce qui en fait une liste choisie plutôt qu'un fourre-tout. Aucune
 * table, aucune migration, et le réglage suit sur tous les appareils puisqu'il
 * vit chez Google.
 *
 * Chaque appel exige une session Supabase valide : la clé anon ne suffit pas,
 * il faut le jeton d'un user connecté — l'application est mono-utilisateur et
 * l'inscription est fermée, donc seul son propriétaire passe.
 *
 * Variables d'environnement attendues (Vercel → Settings → Environment
 * Variables) : GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY (les \n littéraux sont
 * acceptés), GOOGLE_CALENDAR_ID (l'agenda par défaut, où vont les créations),
 * plus VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY déjà présentes pour le front.
 */
import { createSign } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
type Res = {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

const CAL_API = 'https://www.googleapis.com/calendar/v3'

/* ------------------------------------------------- jeton Google (RS256) ---- */

let cached: { token: string; expiresAt: number } | null = null

async function googleToken(saEmail: string, privateKey: string): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const b64url = (input: Buffer | string) =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: saEmail,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(privateKey.replace(/\\n/g, '\n'))
  const assertion = `${header}.${claims}.${b64url(signature)}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    throw new Error(`Google refuse la clé du compte de service (${response.status})`)
  }
  const data = (await response.json()) as { access_token: string; expires_in: number }
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

/* --------------------------------------------------- session Supabase ------ */

async function sessionIsValid(authorization: string | undefined): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !authorization) return false
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: authorization },
  })
  return response.ok
}

/* ------------------------------------------------------------- handler ----- */

type Calendar = { id: string; summary: string; color: string | null; isDefault: boolean }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')

  const saEmail = process.env.GOOGLE_SA_EMAIL
  const saKey = process.env.GOOGLE_SA_PRIVATE_KEY
  const defaultId = process.env.GOOGLE_CALENDAR_ID
  const missing = [
    !saEmail && 'GOOGLE_SA_EMAIL',
    !saKey && 'GOOGLE_SA_PRIVATE_KEY',
    !defaultId && 'GOOGLE_CALENDAR_ID',
  ].filter(Boolean) as string[]

  const auth = req.headers.authorization
  if (!(await sessionIsValid(Array.isArray(auth) ? auth[0] : auth))) {
    res.status(401).json({ ok: false, error: 'Session Supabase absente ou expirée.' })
    return
  }

  const body =
    typeof req.body === 'string' ? (JSON.parse(req.body || '{}') as never) : ((req.body ?? {}) as never)
  const { action, ...input } = body as { action?: string } & Record<string, unknown>

  // `status` répond même sans configuration : c'est lui qui la diagnostique.
  if (missing.length > 0) {
    res.status(200).json({ ok: false, state: 'unconfigured', missing, saEmail: saEmail ?? null })
    return
  }

  /** Appel brut, pour les points d'entrée qui ne visent pas un agenda précis. */
  const api = async (path: string, init?: RequestInit) => {
    const token = await googleToken(saEmail!, saKey!)
    return fetch(`${CAL_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  }

  /** Appel sur un agenda donné. */
  const gcal = (calendarId: string, path: string, init?: RequestInit) =>
    api(`/calendars/${encodeURIComponent(calendarId)}${path}`, init)

  /**
   * Les agendas suivis, l'agenda par défaut en tête. S'il n'est pas encore
   * inscrit, on l'inscrit ici : c'est ce qui fait que la configuration
   * minimale (une seule variable d'environnement) marche sans rien réglér.
   */
  const subscribed = async (): Promise<Calendar[]> => {
    const response = await api('/users/me/calendarList')
    const items = response.ok
      ? (((await response.json()) as {
          items?: Array<{
            id: string
            summary?: string
            backgroundColor?: string
            accessRole?: string
          }>
        }).items ?? [])
      : []

    const out: Calendar[] = items
      // L'agenda propre du compte de service est vide et n'intéresse personne.
      .filter((item) => item.id !== saEmail)
      .map((item) => ({
        id: item.id,
        summary: item.summary ?? item.id,
        color: item.backgroundColor ?? null,
        isDefault: item.id === defaultId,
      }))

    if (!out.some((item) => item.isDefault)) {
      // Inscription silencieuse de l'agenda par défaut, puis on le place en tête.
      const added = await api('/users/me/calendarList', {
        method: 'POST',
        body: JSON.stringify({ id: defaultId }),
      })
      if (added.ok) {
        const entry = (await added.json()) as { summary?: string; backgroundColor?: string }
        out.unshift({
          id: defaultId!,
          summary: entry.summary ?? defaultId!,
          color: entry.backgroundColor ?? null,
          isDefault: true,
        })
      }
    }

    return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  }

  try {
    switch (action) {
      case 'status': {
        const calendars = await subscribed()
        if (calendars.length === 0) {
          /*
           * Aucun agenda atteint. Sans en dire plus, le user n'a aucun moyen de
           * savoir s'il s'est trompé d'identifiant ou si le partage n'a pas
           * pris. On lui rend donc les pièces du puzzle : l'identifiant visé et
           * le code de Google.
           */
          const probe = await gcal(defaultId!, '')
          res.status(200).json({
            ok: false,
            state: 'not-shared',
            saEmail,
            calendarId: defaultId,
            httpStatus: probe.status,
            visible: [],
          })
          return
        }
        res.status(200).json({
          ok: true,
          state: 'ok',
          summary: calendars[0].summary,
          calendars,
          // Sert a partager un agenda de plus : c'est cette adresse qu'on ajoute.
          saEmail,
        })
        return
      }

      /* ------------------------------------------- gestion de la liste ---- */

      case 'addCalendar': {
        const { calendarId } = input as { calendarId: string }
        const wanted = (calendarId ?? '').trim()
        if (!wanted) throw new Error('Identifiant d’agenda vide.')
        // Vérifié AVANT inscription : un identifiant fautif donnerait sinon une
        // ligne morte dans la liste.
        const probe = await gcal(wanted, '')
        if (probe.status === 404) {
          throw new Error(
            `Google ne trouve pas « ${wanted} » pour ce compte de service. Vérifie l’identifiant, et que l’agenda est bien partagé avec ${saEmail}.`,
          )
        }
        if (!probe.ok) throw new Error(`Google répond ${probe.status} pour cet agenda.`)
        const added = await api('/users/me/calendarList', {
          method: 'POST',
          body: JSON.stringify({ id: wanted }),
        })
        // 409 : déjà inscrit — le résultat voulu est atteint.
        if (!added.ok && added.status !== 409) {
          throw new Error(`Inscription refusée par Google (${added.status}).`)
        }
        res.status(200).json({ ok: true, calendars: await subscribed() })
        return
      }

      case 'removeCalendar': {
        const { calendarId } = input as { calendarId: string }
        if (calendarId === defaultId) {
          throw new Error(
            'Cet agenda est celui par défaut (GOOGLE_CALENDAR_ID) : il ne peut pas être retiré ici.',
          )
        }
        const response = await api(`/users/me/calendarList/${encodeURIComponent(calendarId)}`, {
          method: 'DELETE',
        })
        if (!response.ok && response.status !== 404 && response.status !== 410) {
          throw new Error(`Google répond ${response.status}`)
        }
        res.status(200).json({ ok: true, calendars: await subscribed() })
        return
      }

      /* ---------------------------------------------------- lecture ------- */

      case 'list': {
        const { from, to } = input as { from: string; to: string }
        const calendars = await subscribed()
        const params = new URLSearchParams({
          /*
           * Marges couvrant tous les fuseaux. Le SENS des décalages compte :
           * `00:00+14:00` est l'instant le plus TÔT où `from` commence quelque
           * part sur Terre, `23:59-12:00` le plus TARD où `to` s'achève.
           * Inversés, ils donnaient une fenêtre qui se terminait AVANT de
           * commencer : sans effet sur un mois entier (les 7 jours de marge
           * absorbaient l'erreur), mais une journée seule ne renvoyait
           * jamais rien. Le client filtre ensuite sur le jour voulu.
           */
          timeMin: `${from}T00:00:00+14:00`,
          timeMax: `${to}T23:59:59-12:00`,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
          timeZone: 'Europe/Paris',
        })

        // En parallèle : un agenda lent ne doit pas retarder les autres. Un
        // agenda en échec est simplement ignoré — mieux vaut un calendrier
        // partiel qu'un écran vide.
        const perCalendar = await Promise.all(
          calendars.map(async (calendar) => {
            const response = await gcal(calendar.id, `/events?${params}`)
            if (!response.ok) return []
            const data = (await response.json()) as {
              items?: Array<{
                id: string
                summary?: string
                start?: { date?: string; dateTime?: string }
                end?: { date?: string; dateTime?: string }
              }>
            }
            return (data.items ?? []).map((item) => ({
              id: item.id,
              title: item.summary ?? '(sans titre)',
              // `timeZone=Europe/Paris` ci-dessus : les dateTime arrivent déjà
              // en heure de Paris, un découpage textuel suffit.
              day: item.start?.date ?? item.start?.dateTime?.slice(0, 10) ?? '',
              time: item.start?.dateTime?.slice(11, 16) ?? null,
              endTime: item.end?.dateTime?.slice(11, 16) ?? null,
              calendarId: calendar.id,
              calendarName: calendar.summary,
              color: calendar.color,
            }))
          }),
        )

        res.status(200).json({ ok: true, events: perCalendar.flat(), calendars })
        return
      }

      /* ---------------------------------------------------- écriture ------ */

      case 'create':
      case 'update': {
        const { id, title, day, time, durationMin, calendarId } = input as {
          id?: string
          title: string
          day: string
          time: string | null
          durationMin: number
          calendarId?: string
        }
        const target = (calendarId ?? '').trim() || defaultId!
        const event =
          time === null
            ? {
                summary: title,
                // Convention Google : `end.date` est EXCLUSIF pour un jour entier.
                start: { date: day, dateTime: null },
                end: { date: nextDay(day), dateTime: null },
              }
            : {
                summary: title,
                start: { date: null, dateTime: `${day}T${time}:00`, timeZone: 'Europe/Paris' },
                end: {
                  date: null,
                  dateTime: `${day}T${addMinutes(time, durationMin)}:00`,
                  timeZone: 'Europe/Paris',
                },
              }
        const response = await gcal(target, action === 'create' ? '/events' : `/events/${id}`, {
          method: action === 'create' ? 'POST' : 'PATCH',
          body: JSON.stringify(event),
        })
        if (!response.ok) throw new Error(`Google répond ${response.status}`)
        res.status(200).json({ ok: true })
        return
      }

      case 'delete': {
        const { id, calendarId } = input as { id: string; calendarId?: string }
        const target = (calendarId ?? '').trim() || defaultId!
        const response = await gcal(target, `/events/${id}`, { method: 'DELETE' })
        // 410 : déjà supprimé côté Google — même résultat, pas une erreur.
        if (!response.ok && response.status !== 410) throw new Error(`Google répond ${response.status}`)
        res.status(200).json({ ok: true })
        return
      }

      default:
        res.status(400).json({ ok: false, error: `Action inconnue : ${action}` })
    }
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Jour suivant en calcul UTC : aucune heure d'été à traverser à midi. */
function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/** « HH:MM » + n minutes, plafonné à 23:59 pour rester le même jour. */
function addMinutes(time: string, minutes: number): string {
  const total = Math.min(
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes,
    23 * 60 + 59,
  )
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
