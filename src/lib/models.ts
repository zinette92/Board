/**
 * Automatisations : « chaque X, dupliquer la carte Y dans la liste Z ».
 *
 * Y est une carte **modèle** — elle vit dans une liste marquée comme telle et
 * ne bouge jamais ; c'est une copie qui part. À ne pas confondre avec les
 * rappels ([[lib/reminders.ts]]), qui ne vivent que dans le calendrier et ne
 * créent aucune carte. Ici c'est l'inverse : rien au calendrier, tout sur le
 * tableau.
 *
 * Le rythme réutilise le type `Repeat` des rappels — mêmes formulations à
 * l'écran — et y ajoute le mensuel par quantième, que les rappels n'ont pas :
 * « tous les mois » en intervalle glisse quand le mois est trop court, là où
 * « le 31 » doit tomber sur le dernier jour.
 */

import { addDays, parseDay, toDay, today as todayDay } from './dates'
import { advance, describeRepeat } from './reminders'
import type { Card, CardSchedule, List, MonthDay, ScheduleRepeat } from './types'

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
    cursor = advanceFrom(cursor, schedule.repeat)
  }
  return cursor
}

/* ------------------------------------------------------------ Jours du mois */

/** Dernier jour du mois de `day` — le 0 du mois suivant, en somme. */
function endOfMonth(day: string): string {
  const date = parseDay(day)
  return toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

/**
 * Premier jour du mois suivant. Passer par le 1er plutôt que d'ajouter un mois
 * évite le rabotage : 31 janvier + 1 mois donnerait le 28 février, et « le 31 »
 * resterait ensuite coincé sur le 28.
 */
function startOfNextMonth(day: string): string {
  const date = parseDay(day)
  return toDay(new Date(date.getFullYear(), date.getMonth() + 1, 1))
}

/** Le jour visé, dans le mois de `day`. */
function monthDayIn(day: string, target: MonthDay): string {
  const end = endOfMonth(day)
  if (target === 'last') return end
  if (target === 'last-business') {
    // Samedi ou dimanche : on remonte au vendredi.
    let cursor = end
    for (let guard = 0; guard < 3; guard += 1) {
      const weekday = parseDay(cursor).getDay()
      if (weekday !== 0 && weekday !== 6) break
      cursor = addDays(cursor, -1)
    }
    return cursor
  }
  // Un quantième absent du mois (le 31 en février) se replie sur le dernier
  // jour : l'envoi a lieu, plutôt que d'être sauté.
  const wanted = Math.min(Math.max(1, Math.trunc(target)), Number(end.slice(8)))
  return `${end.slice(0, 8)}${String(wanted).padStart(2, '0')}`
}

/* --------------------------------------------------------------- Prochaine */

/** Date suivante, strictement après `day`. */
function advanceFrom(day: string, repeat: ScheduleRepeat): string {
  if (repeat.kind === 'interval') return advance(day, repeat.interval, repeat.unit)
  if (repeat.kind === 'monthday') return monthDayIn(startOfNextMonth(day), repeat.day)
  // Jours de semaine : on avance d'un jour jusqu'à retomber sur un jour coché.
  const days = new Set(repeat.days)
  if (days.size === 0) return day
  let cursor = day
  for (let guard = 0; guard < 8; guard += 1) {
    cursor = addDays(cursor, 1)
    if (days.has(parseDay(cursor).getDay())) return cursor
  }
  return cursor
}

/**
 * Première date **à partir de** `from` qui respecte la règle. Sert à recaler
 * la date d'envoi quand le rythme change : cocher « lundi » un vendredi doit
 * viser le lundi suivant, sans que le user ait à toucher au calendrier.
 *
 * Un intervalle n'a pas de jour propre (« tous les 3 jours » à partir de
 * quand ?) : sa date reste celle qui était choisie.
 */
export function alignNext(repeat: ScheduleRepeat | null, from: string): string {
  if (repeat === null || repeat.kind === 'interval') return from
  if (repeat.kind === 'monthday') {
    const here = monthDayIn(from, repeat.day)
    return here >= from ? here : monthDayIn(startOfNextMonth(from), repeat.day)
  }
  const days = new Set(repeat.days)
  if (days.size === 0) return from
  let cursor = from
  for (let guard = 0; guard < 7; guard += 1) {
    if (days.has(parseDay(cursor).getDay())) return cursor
    cursor = addDays(cursor, 1)
  }
  return from
}

/* ------------------------------------------------------------ Formulations */

/** « tous les lundis », « le 3 de chaque mois », « le dernier jour ouvré du mois ». */
export function describeScheduleRepeat(repeat: ScheduleRepeat | null): string {
  if (repeat === null) return 'une seule fois'
  if (repeat.kind !== 'monthday') return describeRepeat(repeat)
  if (repeat.day === 'last') return 'le dernier jour du mois'
  if (repeat.day === 'last-business') return 'le dernier jour ouvré du mois'
  return `le ${repeat.day === 1 ? '1er' : repeat.day} de chaque mois`
}

/** « le 3 mars, dans À faire » / « tous les lundis, dans Cette semaine ». */
export function describeSchedule(schedule: CardSchedule): string {
  return `${describeScheduleRepeat(schedule.repeat)}, vers « ${schedule.listName} »`
}

export function makeSchedule(listName: string, nextOn: string): CardSchedule {
  return {
    listName,
    nextOn,
    repeat: null,
    active: true,
    lastRunOn: null,
  }
}
