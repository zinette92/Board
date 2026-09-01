import { addDays, endOfMonth, parseDay, toDay, today } from './dates'
import type { GoalPeriod } from './types'

const RANGE_FULL = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const RANGE_SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/** « du 1 au 30 septembre 2026 », étendu quand le mois ou l'année changent. */
export function formatRange(from: string, to: string): string {
  const start = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `du ${start.getDate()} au ${RANGE_FULL.format(end)}`
  }
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `du ${RANGE_SHORT.format(start)} au ${RANGE_FULL.format(end)}`
  }
  return `du ${RANGE_FULL.format(start)} au ${RANGE_FULL.format(end)}`
}

/** Numéro ISO de la semaine d'un jour, et le total de semaines de son année ISO. */
function isoWeekOf(day: string): { week: number; total: number } {
  const at = (input: string) => {
    const date = new Date(input + 'T12:00:00Z')
    // Le jeudi de la semaine porte l'année ISO.
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3)
    const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
    jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3)
    return {
      year: date.getUTCFullYear(),
      week: 1 + Math.round((date.getTime() - jan4.getTime()) / 604_800_000),
    }
  }
  const current = at(day)
  // Le 28 décembre appartient toujours à la dernière semaine ISO de l'année.
  return { week: current.week, total: at(`${current.year}-12-28`).week }
}

/**
 * Position de la fenêtre dans son année : 36/53, 9/12, 3/4. L'année n'a pas
 * de position (1/1) : null.
 */
export function periodPosition(period: GoalPeriod, from: string): string | null {
  switch (period) {
    case 'weekly': {
      const { week, total } = isoWeekOf(from)
      return `${week}/${total}`
    }
    case 'monthly':
      return `${Number(from.slice(5, 7))}/12`
    case 'quarter':
      return `${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1}/4`
    case 'yearly':
      return null
  }
}

/**
 * Fenêtres de dates des périodes d'objectifs — toutes calendaires, trimestres
 * CIVILS compris (1 janv → 31 mars, … 1 oct → 31 déc) : décision finale du
 * user, après deux essais de cycles de 90 jours ancrés.
 */

export function periodWindow(period: GoalPeriod, day = today()): { from: string; to: string } {
  return periodWindowAt(period, 0, day)
}

/**
 * Fenêtre décalée de `offset` périodes (négatif = passé). C'est ce qui rend
 * l'historique navigable : chaque semaine, mois, cycle ou année garde ses
 * objectifs, retrouvés en feuilletant — rien n'est copié ni archivé à part.
 */
/**
 * `day` décalé d'une période exactement — pour reporter une échéance précise.
 * Le mensuel garde le quantième (31 → dernier jour du mois suivant), l'annuel
 * gère le 29 février.
 */
export function shiftOnePeriod(period: GoalPeriod, day: string): string {
  const date = parseDay(day)
  switch (period) {
    case 'weekly':
      return addDays(day, 7)
    case 'monthly': {
      const lastOfNext = new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()
      return toDay(
        new Date(date.getFullYear(), date.getMonth() + 1, Math.min(date.getDate(), lastOfNext)),
      )
    }
    case 'quarter': {
      // +3 mois en gardant le quantième, clampé en fin de mois court.
      const lastOfTarget = new Date(date.getFullYear(), date.getMonth() + 4, 0).getDate()
      return toDay(
        new Date(date.getFullYear(), date.getMonth() + 3, Math.min(date.getDate(), lastOfTarget)),
      )
    }
    case 'yearly': {
      const leap = date.getMonth() === 1 && date.getDate() === 29
      return toDay(new Date(date.getFullYear() + 1, date.getMonth(), leap ? 28 : date.getDate()))
    }
  }
}

export function periodWindowAt(
  period: GoalPeriod,
  offset: number,
  day = today(),
): { from: string; to: string } {
  switch (period) {
    case 'weekly': {
      // Semaine française : lundi → dimanche.
      const monday = addDays(day, -((parseDay(day).getDay() + 6) % 7) + offset * 7)
      return { from: monday, to: addDays(monday, 6) }
    }
    case 'monthly': {
      const date = parseDay(day)
      const first = toDay(new Date(date.getFullYear(), date.getMonth() + offset, 1))
      return { from: first, to: endOfMonth(first) }
    }
    case 'quarter': {
      const date = parseDay(day)
      const startMonth = Math.floor(date.getMonth() / 3) * 3 + offset * 3
      const from = new Date(date.getFullYear(), startMonth, 1)
      return {
        from: toDay(from),
        to: toDay(new Date(from.getFullYear(), from.getMonth() + 3, 0)),
      }
    }
    case 'yearly': {
      const year = Number(day.slice(0, 4)) + offset
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
  }
}
