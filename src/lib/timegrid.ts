/**
 * Le peu d'arithmétique que partagent les grilles horaires : la vue Jour et
 * Semaine du calendrier, et le rail de droite. Rien d'autre ne mérite d'être
 * mis en commun — le rendu, lui, diffère assez pour rester chez chacun.
 */

/** Hauteur d'une heure, en pixels. Les deux grilles s'en servent telle quelle. */
export const HOUR_PX = 44

/** Pas de calage d'un glissement : le quart d'heure, comme Google. */
export const SNAP_MIN = 15

/** « HH:MM » en minutes depuis minuit ; null si illisible. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time || time.length < 4) return null
  const value = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  return Number.isFinite(value) ? value : null
}

/** Minutes depuis minuit en « HH:MM ». */
export function hhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(Math.round(minutes), 24 * 60 - 1))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** Cale une valeur sur le quart d'heure le plus proche. */
export function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

type Placed = { start: number; minutes: number }

/**
 * Place côte à côte ce qui se chevauche, comme Google Agenda : chacun prend la
 * première « voie » libre, et la largeur se partage entre les voies utilisées
 * par son groupe de chevauchement.
 */
export function withLanes<T extends Placed>(slots: T[]): Array<T & { lane: number; lanes: number }> {
  const sorted = [...slots].sort((a, b) => a.start - b.start || a.minutes - b.minutes)
  const out: Array<T & { lane: number; lanes: number }> = []
  let group: Array<T & { lane: number; lanes: number }> = []
  /** Fin de chaque voie du groupe courant. */
  let ends: number[] = []

  const closeGroup = () => {
    for (const item of group) item.lanes = ends.length
    out.push(...group)
    group = []
    ends = []
  }

  for (const slot of sorted) {
    const span = Math.max(slot.minutes, 20)
    // Plus aucun chevauchement avec le groupe : on le referme.
    if (group.length > 0 && ends.every((end) => end <= slot.start)) closeGroup()
    let lane = ends.findIndex((end) => end <= slot.start)
    if (lane === -1) {
      lane = ends.length
      ends.push(slot.start + span)
    } else {
      ends[lane] = slot.start + span
    }
    group.push({ ...slot, lane, lanes: ends.length })
  }
  closeGroup()
  return out
}
