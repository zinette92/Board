/**
 * Cartes modèles : des gabarits qu'on duplique, et dont une **copie** part
 * toute seule dans une autre liste à la date voulue.
 *
 * À ne pas confondre avec les rappels ([[lib/reminders.ts]]), qui ne vivent
 * que dans le calendrier et ne créent aucune carte. Ici c'est l'inverse : rien
 * n'apparaît au calendrier, tout se matérialise sur le tableau.
 *
 * Le rythme réutilise volontairement le type `Repeat` des rappels : mêmes
 * formulations à l'écran, et une seule notion de récurrence à maintenir.
 */

import { today as todayDay } from './dates'
import { advance, describeRepeat } from './reminders'
import type { Card, CardSchedule, List } from './types'

export { describeRepeat }

/** Une carte est un modèle si elle vit dans une liste marquée comme telle. */
export function isModel(card: Card, lists: List[]): boolean {
  return lists.some((list) => list.id === card.listId && list.isTemplate)
}

/**
 * Envois échus, celui du jour compris.
 *
 * Rattrapage identique à celui des rappels : après une longue absence on ne
 * produit **qu'une seule** copie et l'on saute à la prochaine date future —
 * une revue hebdomadaire oubliée pendant deux mois doit rappeler une fois,
 * pas huit.
 */
export function isDue(schedule: CardSchedule, today = todayDay()): boolean {
  return schedule.active && schedule.nextOn <= today
}

/** Date d'envoi suivante, ou `null` quand l'envoi était unique. */
export function afterRun(schedule: CardSchedule, today = todayDay()): string | null {
  if (schedule.repeat === null) return null
  let cursor = schedule.nextOn
  // Garde-fou : un envoi quotidien laissé trois ans boucle sinon inutilement.
  for (let guard = 0; guard < 2000 && cursor <= today; guard += 1) {
    cursor = advanceFrom(cursor, schedule)
  }
  return cursor
}

function advanceFrom(day: string, schedule: CardSchedule): string {
  const repeat = schedule.repeat
  if (repeat === null) return day
  if (repeat.kind === 'interval') return advance(day, repeat.interval, repeat.unit)
  // Jours de semaine : on avance d'un jour jusqu'à retomber sur un jour coché.
  const days = new Set(repeat.days)
  if (days.size === 0) return day
  let cursor = day
  for (let guard = 0; guard < 8; guard += 1) {
    cursor = advance(cursor, 1, 'day')
    const weekday = new Date(
      Number(cursor.slice(0, 4)),
      Number(cursor.slice(5, 7)) - 1,
      Number(cursor.slice(8, 10)),
    ).getDay()
    if (days.has(weekday)) return cursor
  }
  return cursor
}

/** « le 3 mars, dans À faire » / « tous les lundis, dans Cette semaine ». */
export function describeSchedule(schedule: CardSchedule): string {
  const rythme = schedule.repeat === null ? 'une seule fois' : describeRepeat(schedule.repeat)
  return `${rythme}, vers « ${schedule.listName} »`
}

export function makeSchedule(listName: string, nextOn: string): CardSchedule {
  return {
    listName,
    nextOn,
    repeat: null,
    setDueDate: true,
    active: true,
    lastRunOn: null,
  }
}
