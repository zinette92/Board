import { addDays, endOfMonth, parseDay, toDay, today } from './dates'
import type { GoalPeriod } from './types'

/**
 * Fenêtres de dates des périodes d'objectifs.
 *
 * Semaine, mois et année suivent le calendrier. Les « 90 jours » sont des
 * cycles fixes ancrés au 1er janvier 2026 (décision du user, corrigée du
 * 1er octobre) : ils s'enchaînent sans trou, 90 jours pile chacun — quatre
 * par an, à un chouïa de dérive près.
 */
export const QUARTER_ANCHOR = '2026-01-01'

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
    case 'quarter':
      return addDays(day, 90)
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
      const elapsed = Math.floor(
        (parseDay(day).getTime() - parseDay(QUARTER_ANCHOR).getTime()) / 86_400_000,
      )
      // Avant l'ancre, le cycle « courant » est le premier à venir (index 0) ;
      // la grille des cycles reste la même pour tout le monde.
      const index = (day < QUARTER_ANCHOR ? 0 : Math.floor(elapsed / 90)) + offset
      const from = addDays(QUARTER_ANCHOR, index * 90)
      return { from, to: addDays(from, 89) }
    }
    case 'yearly': {
      const year = Number(day.slice(0, 4)) + offset
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
  }
}
