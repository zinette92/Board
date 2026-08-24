/**
 * Rappels : des échéances qui vivent dans le calendrier, et **nulle part
 * ailleurs**. Ils ne créent pas de carte et n'apparaissent pas sur le tableau
 * — décision du user : le tableau est pour le travail en cours, les rappels
 * sont des rendez-vous avec soi-même.
 *
 * Les occurrences ne sont jamais stockées : elles se déduisent de la règle à
 * l'affichage, pour la fenêtre de dates demandée. Rien à rattraper, rien à
 * désynchroniser.
 */

import { addDays, addMonths, daysBetween, parseDay, today as todayDay } from './dates'
import type { Reminder, Repeat, RecurrenceUnit } from './types'

/** Semaine à la française : lundi d'abord, `value` suit `Date.getDay()`. */
export const WEEKDAYS = [
  { value: 1, short: 'L', label: 'lundi' },
  { value: 2, short: 'M', label: 'mardi' },
  { value: 3, short: 'M', label: 'mercredi' },
  { value: 4, short: 'J', label: 'jeudi' },
  { value: 5, short: 'V', label: 'vendredi' },
  { value: 6, short: 'S', label: 'samedi' },
  { value: 0, short: 'D', label: 'dimanche' },
] as const

const UNIT_LABELS: Record<RecurrenceUnit, [singular: string, plural: string]> = {
  day: ['jour', 'jours'],
  week: ['semaine', 'semaines'],
  month: ['mois', 'mois'],
  year: ['an', 'ans'],
}

/** Formulations figées : « chaque an » ou « chaque semaine » sonneraient faux. */
const EVERY: Record<RecurrenceUnit, string> = {
  day: 'tous les jours',
  week: 'toutes les semaines',
  month: 'tous les mois',
  year: 'tous les ans',
}

export function advance(day: string, interval: number, unit: RecurrenceUnit): string {
  const step = Math.max(1, Math.trunc(interval))
  switch (unit) {
    case 'day':
      return addDays(day, step)
    case 'week':
      return addDays(day, step * 7)
    case 'month':
      return addMonths(day, step)
    case 'year':
      return addMonths(day, step * 12)
  }
}

/** « une seule fois », « tous les jours », « les lundi et jeudi », « tous les 3 mois ». */
export function describeRepeat(repeat: Repeat | null): string {
  if (repeat === null) return 'une seule fois'
  if (repeat.kind === 'weekdays') {
    const names = WEEKDAYS.filter((day) => repeat.days.includes(day.value)).map((day) => day.label)
    if (names.length === 0) return 'aucun jour choisi'
    if (names.length === 7) return 'tous les jours'
    if (names.length === 1) return `tous les ${names[0]}s`
    return `les ${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
  }
  if (repeat.interval === 1) return EVERY[repeat.unit]
  const [, plural] = UNIT_LABELS[repeat.unit]
  return `${repeat.unit === 'week' ? 'toutes les' : 'tous les'} ${repeat.interval} ${plural}`
}

/**
 * Toutes les occurrences dans `[from, to]`, bornes comprises. Les dates sont
 * comparées comme des chaînes `YYYY-MM-DD`, ce qui est exact et bien plus
 * rapide que de reconstruire des `Date`.
 */
export function occurrencesBetween(reminder: Reminder, from: string, to: string): string[] {
  const out: string[] = []
  if (!reminder.active || from > to) return out
  const start = reminder.startsOn

  if (reminder.repeat === null) {
    if (start >= from && start <= to) out.push(start)
    return out
  }

  if (reminder.repeat.kind === 'weekdays') {
    const days = new Set(reminder.repeat.days)
    if (days.size === 0) return out
    let cursor = from > start ? from : start
    // Garde-fou : au pire une fenêtre d'un an de balayage jour par jour.
    for (let guard = 0; guard < 400 && cursor <= to; guard += 1) {
      if (days.has(parseDay(cursor).getDay())) out.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return out
  }

  let cursor = start
  for (let guard = 0; guard < 2000 && cursor <= to; guard += 1) {
    if (cursor >= from) out.push(cursor)
    cursor = advance(cursor, reminder.repeat.interval, reminder.repeat.unit)
  }
  return out
}

/** Première occurrence à partir de `from` (incluse), ou null s'il n'y en a plus. */
export function nextOccurrence(reminder: Reminder, from = todayDay()): string | null {
  if (!reminder.active) return null
  const start = reminder.startsOn

  if (reminder.repeat === null) return start >= from ? start : null

  if (reminder.repeat.kind === 'weekdays') {
    const days = new Set(reminder.repeat.days)
    if (days.size === 0) return null
    let cursor = from > start ? from : start
    for (let guard = 0; guard < 400; guard += 1) {
      if (days.has(parseDay(cursor).getDay())) return cursor
      cursor = addDays(cursor, 1)
    }
    return null
  }

  let cursor = start
  for (let guard = 0; guard < 2000; guard += 1) {
    if (cursor >= from) return cursor
    cursor = advance(cursor, reminder.repeat.interval, reminder.repeat.unit)
  }
  return null
}

/** Le rappel est-il passé sans retour possible (unique et déjà échu) ? */
export function isFinished(reminder: Reminder, today = todayDay()): boolean {
  return reminder.repeat === null && reminder.startsOn < today
}

export function isValidated(reminder: Reminder, on: string): boolean {
  return reminder.doneOn.includes(on)
}

export type Pending = {
  reminder: Reminder
  /** Jour de l'échéance concernée. */
  on: string
}

/**
 * Occurrences échues — **celle du jour comprise** — qui attendent une
 * validation, de la plus ancienne à la plus récente.
 *
 * Chaque occurrence est indépendante : ne pas valider celle de lundi
 * n'empêche pas celle de mardi d'arriver, et les deux restent dans la liste
 * jusqu'à ce qu'on les valide une par une.
 */
export function pendingOccurrences(
  reminders: Reminder[],
  today = todayDay(),
  lookback = 60,
): Pending[] {
  const from = addDays(today, -lookback)
  const out: Pending[] = []
  for (const reminder of reminders) {
    if (!reminder.active) continue
    for (const on of occurrencesBetween(reminder, from, today)) {
      if (isValidated(reminder, on)) continue
      out.push({ reminder, on })
    }
  }
  return out.sort(
    (a, b) => a.on.localeCompare(b.on) || a.reminder.at.localeCompare(b.reminder.at),
  )
}

export type LeadNotice = {
  reminder: Reminder
  /** Échéance annoncée (dans `leadDays` jours). */
  on: string
}

/** Pré-avis à afficher un jour donné : information, rien à valider. */
export function leadNoticesOn(reminders: Reminder[], day: string): LeadNotice[] {
  const out: LeadNotice[] = []
  for (const reminder of reminders) {
    if (!reminder.active || reminder.leadDays <= 0) continue
    const target = addDays(day, reminder.leadDays)
    if (occurrencesBetween(reminder, target, target).length > 0 && !isValidated(reminder, target)) {
      out.push({ reminder, on: target })
    }
  }
  return out.sort((a, b) => a.reminder.at.localeCompare(b.reminder.at))
}

export function formatWhen(day: string, at: string, today = todayDay()): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return `aujourd'hui à ${at}`
  if (diff === 1) return `demain à ${at}`
  if (diff === -1) return `hier à ${at}`
  return `${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(parseDay(day))} à ${at}`
}
