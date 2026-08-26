import { supabase } from './supabase'

/**
 * Client du pont Google Agenda (`api/gcal.ts`).
 *
 * Tout passe par la fonction Vercel : le navigateur n'a ni la clé du compte de
 * service ni le droit d'appeler Google directement. Chaque requête embarque le
 * jeton de la session Supabase — c'est lui qui ouvre la porte.
 */

export type GcalEvent = {
  id: string
  title: string
  /** `YYYY-MM-DD`. */
  day: string
  /** `HH:MM`, ou null pour un événement « journée entière ». */
  time: string | null
  endTime: string | null
}

export type GcalStatus =
  | { state: 'ok'; summary: string }
  | { state: 'not-shared'; saEmail: string }
  | { state: 'unconfigured'; missing: string[]; saEmail: string | null }
  | { state: 'error'; message: string }

export type GcalDraft = {
  title: string
  day: string
  time: string | null
  durationMin: number
}

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expirée — reconnecte-toi.')

  const response = await fetch('/api/gcal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok && body.ok !== false) {
    throw new Error(typeof body.error === 'string' ? body.error : `Le pont répond ${response.status}`)
  }
  return body
}

export async function gcalStatus(): Promise<GcalStatus> {
  try {
    const body = await call({ action: 'status' })
    if (body.state === 'ok') return { state: 'ok', summary: String(body.summary) }
    if (body.state === 'not-shared') return { state: 'not-shared', saEmail: String(body.saEmail) }
    if (body.state === 'unconfigured') {
      return {
        state: 'unconfigured',
        missing: (body.missing as string[]) ?? [],
        saEmail: (body.saEmail as string | null) ?? null,
      }
    }
    return { state: 'error', message: String(body.error ?? 'Réponse inattendue.') }
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Événements entre deux jours inclus ; [] si le pont n'est pas configuré. */
export async function gcalList(from: string, to: string): Promise<GcalEvent[]> {
  const body = await call({ action: 'list', from, to })
  if (body.ok !== true) return []
  return (body.events as GcalEvent[]) ?? []
}

export async function gcalCreate(draft: GcalDraft): Promise<void> {
  const body = await call({ action: 'create', ...draft })
  if (body.ok !== true) throw new Error(String(body.error ?? 'Création refusée.'))
}

export async function gcalUpdate(id: string, draft: GcalDraft): Promise<void> {
  const body = await call({ action: 'update', id, ...draft })
  if (body.ok !== true) throw new Error(String(body.error ?? 'Modification refusée.'))
}

export async function gcalDelete(id: string): Promise<void> {
  const body = await call({ action: 'delete', id })
  if (body.ok !== true) throw new Error(String(body.error ?? 'Suppression refusée.'))
}
