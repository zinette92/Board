/**
 * Le pont entre les étiquettes du tableau et les agendas Google.
 *
 * Règle du tableau : une carte porte une étiquette, et l'agenda Google qui
 * porte le même nom lui répond. D'où deux conséquences, toutes deux ici :
 * un dépôt dans le rail vise le bon agenda ([[features/calendar/DayRail]]),
 * et un événement s'affiche à la couleur de SON étiquette.
 *
 * Cette seconde règle n'est pas cosmétique. La couleur que Google renvoie est
 * celle de l'abonnement du **compte de service**, que Google a tirée au sort —
 * elle n'a aucune raison de ressembler à celle que le user voit dans son
 * propre Google Agenda. L'étiquette, elle, est la sienne : c'est donc elle qui
 * fait foi, et une couleur unique traverse le tableau et l'agenda.
 */

import { labelColorToHex } from './palette'
import type { Label } from './types'

/** « Brain Rise », « BRAIN RISE » et « brain-rise » désignent la même chose. */
export function sameCalendarName(a: string, b: string): boolean {
  const key = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
  return key(a) === key(b) && key(a) !== ''
}

/** L'étiquette qui porte le nom de cet agenda, s'il y en a une. */
export function labelOfCalendar(name: string, labels: Label[]): Label | undefined {
  return labels.find((label) => sameCalendarName(label.name, name))
}

/**
 * Repeint les événements aux couleurs des étiquettes. Un agenda sans étiquette
 * du même nom garde la couleur renvoyée par Google.
 */
export function withLabelColors<T extends { calendarName: string; color: string | null }>(
  events: T[],
  labels: Label[],
): T[] {
  return events.map((event) => {
    const label = labelOfCalendar(event.calendarName, labels)
    return label ? { ...event, color: labelColorToHex(label.color) } : event
  })
}
