import { addDays, endOfMonth, parseDay, today } from './dates'
import type { GoalPeriod } from './types'

/**
 * Fenêtres de dates des périodes d'objectifs.
 *
 * Semaine, mois et année suivent le calendrier. Les « 90 jours » sont des
 * cycles fixes ancrés au 1er octobre 2026 (décision du user) : avant
 * l'ancre, la fenêtre courante est le premier cycle à venir ; après, les
 * cycles s'enchaînent sans trou, 90 jours pile chacun.
 */
export const QUARTER_ANCHOR = '2026-10-01'

export function periodWindow(period: GoalPeriod, day = today()): { from: string; to: string } {
  switch (period) {
    case 'weekly': {
      // Semaine française : lundi → dimanche.
      const monday = addDays(day, -((parseDay(day).getDay() + 6) % 7))
      return { from: monday, to: addDays(monday, 6) }
    }
    case 'monthly':
      return { from: day.slice(0, 8) + '01', to: endOfMonth(day) }
    case 'quarter': {
      if (day < QUARTER_ANCHOR) return { from: QUARTER_ANCHOR, to: addDays(QUARTER_ANCHOR, 89) }
      const elapsed = Math.floor(
        (parseDay(day).getTime() - parseDay(QUARTER_ANCHOR).getTime()) / 86_400_000,
      )
      const from = addDays(QUARTER_ANCHOR, Math.floor(elapsed / 90) * 90)
      return { from, to: addDays(from, 89) }
    }
    case 'yearly':
      return { from: day.slice(0, 4) + '-01-01', to: day.slice(0, 4) + '-12-31' }
  }
}
