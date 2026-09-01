import { addDays, endOfMonth, parseDay, toDay, today } from './dates'
import type { GoalPeriod } from './types'

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
