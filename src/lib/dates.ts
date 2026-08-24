/**
 * Dates en français, et surtout : les jours (`YYYY-MM-DD`) sont manipulés comme
 * des jours. `new Date('2026-08-17')` est interprété en UTC par le moteur, ce
 * qui recule d'un jour en France l'été — d'où le passage par un parseur maison.
 */

const MS_PER_DAY = 86_400_000

/** `YYYY-MM-DD` → Date locale à minuit. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, date ?? 1)
}

/** Date → `YYYY-MM-DD` dans le fuseau local. */
export function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function today(): string {
  return toDay(new Date())
}

export function addDays(day: string, count: number): string {
  const date = parseDay(day)
  date.setDate(date.getDate() + count)
  return toDay(date)
}

export function endOfMonth(day: string): string {
  const date = parseDay(day)
  return toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

/**
 * Ajoute des mois en conservant le quantième quand c'est possible : le 31
 * janvier + 1 mois donne le 28/29 février, pas le 2 ou 3 mars comme le ferait
 * `setMonth` seul.
 */
export function addMonths(day: string, count: number): string {
  const date = parseDay(day)
  const wanted = date.getDate()
  const shifted = new Date(date.getFullYear(), date.getMonth() + count, 1)
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate()
  shifted.setDate(Math.min(wanted, lastDay))
  return toDay(shifted)
}

/** Nombre de jours entiers de `from` à `to` : négatif si `to` est passé. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / MS_PER_DAY)
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fullFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDay(day: string): string {
  return dayFormatter.format(parseDay(day))
}

export function formatFullDay(day: string): string {
  return fullFormatter.format(parseDay(day))
}

export function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later'

export function dueTone(dueOn: string, from = today()): DueTone {
  const days = daysBetween(from, dueOn)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  return 'later'
}

export function formatDue(dueOn: string, from = today()): string {
  const days = daysBetween(from, dueOn)
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  if (days < 0) return `en retard de ${-days} j`
  if (days <= 7) return `dans ${days} j`
  return formatDay(dueOn)
}

/** « 3 jours », « 2 semaines », « 1 mois » — pour le temps restant d'un objectif. */
export function formatDuration(days: number): string {
  if (days <= 0) return 'terminé'
  if (days === 1) return '1 jour'
  if (days < 14) return `${days} jours`
  if (days < 60) return `${Math.round(days / 7)} semaines`
  return `${Math.round(days / 30)} mois`
}
