/**
 * Pont vers Digital Food Ops, côté serveur (fonction Vercel).
 *
 * L'outil de l'agence tourne sur un VPS et n'a pas de session Supabase : il
 * n'est pas un navigateur, personne ne s'y connecte avec un mot de passe de
 * board. Il lui faut donc une autre porte que `gcal.ts`, qui exige le jeton
 * d'un utilisateur connecté.
 *
 * Cette porte est volontairement étroite. Le VPS ne détient qu'un secret
 * partagé (`x-ops-secret`) qui ne sait rien faire d'autre que lire les
 * destinations, poser une carte et relire l'état de cartes données. La clé
 * service-role, elle, ne quitte jamais Vercel : si le VPS était compromis,
 * l'attaquant pourrait créer des cartes — pas lire les objectifs, les rappels
 * ni les pièces jointes.
 *
 * `user_id` est fixé par `OPS_USER_ID` plutôt que déduit d'une session : sans
 * session il n'y a pas d'`auth.uid()`, et la valeur par défaut de la colonne
 * poserait NULL. L'application est mono-utilisateur, cette constante est donc
 * exacte par construction.
 *
 * Variables d'environnement attendues (Vercel → Settings → Environment
 * Variables) : OPS_SECRET, OPS_USER_ID, SUPABASE_SERVICE_ROLE_KEY, plus
 * VITE_SUPABASE_URL déjà présente pour le front.
 */
import { timingSafeEqual } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}
type Res = {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

/** Un item de checklist tel que l'outil nous l'envoie. */
type PointEntrant = { cle: string; texte: string; fait: boolean }

type CarteEntrante = {
  cardId?: string | null
  listId?: string
  titre?: string
  description?: string
  dueOn?: string | null
  fait?: boolean
  checklist?: PointEntrant[]
  checklistTitre?: string
}

const url = () => String(process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const cle = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
const proprietaire = () => String(process.env.OPS_USER_ID || '')

/**
 * Comparaison à temps constant.
 *
 * Un `===` sur une chaîne s'arrête au premier caractère qui diffère : le temps
 * de réponse raconte alors combien de caractères sont justes, et un secret se
 * devine lettre par lettre. Les longueurs sont comparées d'abord parce que
 * `timingSafeEqual` jette sur des tampons de tailles différentes.
 */
function memeSecret(recu: string, attendu: string): boolean {
  if (!attendu || !recu) return false
  const a = Buffer.from(recu)
  const b = Buffer.from(attendu)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Un appel à PostgREST avec la clé service-role. */
async function pg(chemin: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(`${url()}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: cle(),
      Authorization: `Bearer ${cle()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`supabase ${r.status} : ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : null
}

const enc = encodeURIComponent

/** Les tableaux et leurs listes, pour que l'outil propose une destination. */
async function destinations() {
  const u = enc(proprietaire())
  const boards = (await pg(
    `boards?user_id=eq.${u}&archived_at=is.null&select=id,name,emoji,position&order=position`
  )) as Array<{ id: string; name: string; emoji: string }>
  const lists = (await pg(
    `lists?user_id=eq.${u}&archived_at=is.null&select=id,board_id,name,position&order=position`
  )) as Array<{ id: string; board_id: string; name: string }>

  return boards.map((b) => ({
    id: b.id,
    nom: `${b.emoji ? `${b.emoji} ` : ''}${b.name}`.trim(),
    listes: lists.filter((l) => l.board_id === b.id).map((l) => ({ id: l.id, nom: l.name })),
  }))
}

/**
 * Poser une carte : la créer, ou mettre à jour celle que l'outil connaît déjà.
 *
 * L'identifiant d'un item de checklist est la clé du point côté outil, pas un
 * uuid : c'est ce qui permet au retour de savoir quelle case a été cochée sans
 * tenir une seconde table de correspondance.
 */
async function poser(c: CarteEntrante) {
  const u = proprietaire()
  const items = (c.checklist || []).map((p) => ({
    id: p.cle,
    text: p.texte,
    done: Boolean(p.fait),
    dueOn: null,
    dueTime: null,
  }))
  const checklists = items.length
    ? [{ id: 'ops', title: c.checklistTitre || 'À faire', items }]
    : []

  const champs: Record<string, unknown> = {
    title: String(c.titre || '').slice(0, 300),
    description: String(c.description || ''),
    due_on: c.dueOn || null,
    checklists,
    done_at: c.fait ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  if (c.cardId) {
    // On ne touche ni à la liste ni à la position : si le user a déplacé la
    // carte, c'est un choix, et l'outil n'a pas à la ramener à sa place.
    const maj = (await pg(
      `cards?id=eq.${enc(c.cardId)}&user_id=eq.${enc(u)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(champs) }
    )) as Array<{ id: string }>
    if (maj && maj.length) return { cardId: maj[0].id, cree: false }
    // La carte a été supprimée côté board : on la recrée plutôt que d'échouer.
  }

  if (!c.listId) throw new Error('listId manquant')
  const liste = (await pg(
    `lists?id=eq.${enc(c.listId)}&user_id=eq.${enc(u)}&select=board_id`
  )) as Array<{ board_id: string }>
  if (!liste.length) throw new Error('liste inconnue')

  const dernieres = (await pg(
    `cards?list_id=eq.${enc(c.listId)}&select=position&order=position.desc&limit=1`
  )) as Array<{ position: number }>
  const position = (dernieres[0]?.position ?? 0) + 1

  const cree = (await pg('cards', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{
      id: crypto.randomUUID(),
      user_id: u,
      board_id: liste[0].board_id,
      list_id: c.listId,
      position,
      ...champs,
    }]),
  })) as Array<{ id: string }>

  return { cardId: cree[0].id, cree: true }
}

/**
 * Relire l'état des cartes que l'outil a posées.
 *
 * C'est le sens retour : l'outil n'est pas notifié quand on coche une case
 * ici, il vient le demander. Une carte disparue se signale (`absente`) pour
 * que l'outil oublie le lien plutôt que de la ressusciter à chaque passe.
 */
async function etats(ids: string[]) {
  if (!ids.length) return []
  const liste = ids.map((i) => `"${i}"`).join(',')
  const cartes = (await pg(
    `cards?id=in.(${enc(liste)})&user_id=eq.${enc(proprietaire())}`
      + '&select=id,done_at,archived_at,checklists'
  )) as Array<{
    id: string
    done_at: string | null
    archived_at: string | null
    checklists: Array<{ id: string; items: Array<{ id: string; done: boolean }> }>
  }>

  const vues = new Map(cartes.map((c) => [c.id, c]))
  return ids.map((id) => {
    const c = vues.get(id)
    if (!c) return { cardId: id, absente: true }
    const ops = (c.checklists || []).find((l) => l.id === 'ops')
    return {
      cardId: id,
      absente: false,
      archivee: Boolean(c.archived_at),
      fait: Boolean(c.done_at),
      points: (ops?.items || []).map((i) => ({ cle: i.id, fait: Boolean(i.done) })),
    }
  })
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')

  const recu = req.headers['x-ops-secret']
  if (!memeSecret(Array.isArray(recu) ? recu[0] : String(recu || ''),
                  String(process.env.OPS_SECRET || ''))) {
    return res.status(401).json({ error: 'secret_invalide' })
  }
  if (!url() || !cle() || !proprietaire()) {
    return res.status(500).json({ error: 'configuration_incomplete' })
  }

  const quoi = String((req.query?.quoi as string) || '')

  try {
    if (req.method === 'GET' && quoi === 'destinations') {
      return res.status(200).json({ tableaux: await destinations() })
    }
    if (req.method === 'POST' && quoi === 'etats') {
      const b = (req.body || {}) as { cardIds?: string[] }
      return res.status(200).json({ cartes: await etats(b.cardIds || []) })
    }
    if (req.method === 'POST') {
      return res.status(200).json(await poser((req.body || {}) as CarteEntrante))
    }
    return res.status(405).json({ error: 'methode_non_permise' })
  } catch (e) {
    return res.status(502).json({ error: 'board_injoignable', detail: (e as Error).message })
  }
}
