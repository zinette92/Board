/**
 * Le cœur de ce qui distingue cet outil d'un Trello : l'avancement d'un
 * objectif n'est pas un curseur qu'on pousse à la main, il est **dérivé** des
 * tâches terminées qui lui sont rattachées.
 *
 *     avancement = ajustement manuel + Σ contribution des cartes terminées
 *
 * Conséquence voulue : c'est idempotent. Sortir une carte de la liste
 * « Terminé » retire sa contribution, la remettre la rajoute, et rien ne peut
 * dériver. L'ajustement manuel ne sert qu'à ce qui se fait hors de l'outil.
 */

import { daysBetween, today as todayDay } from './dates'
import type { Card, Goal, GoalMilestone, ID } from './types'

export type SmartKey = 'S' | 'M' | 'A' | 'R' | 'T'

export type SmartCriterion = {
  key: SmartKey
  name: string
  /** Ce qui manque, formulé pour être affiché tel quel. */
  hint: string
  filled: boolean
}

/** Un objectif n'est SMART que si les cinq critères sont réellement renseignés. */
export function smartCriteria(goal: Goal): SmartCriterion[] {
  return [
    {
      key: 'S',
      name: 'Spécifique',
      hint: 'Décris précisément ce que tu veux obtenir.',
      filled: goal.title.trim().length > 0 && goal.specific.trim().length > 0,
    },
    {
      key: 'M',
      name: 'Mesurable',
      hint: 'Indique ce que tu comptes, et la cible à atteindre.',
      filled: goal.metric.trim().length > 0 && goal.target > 0,
    },
    {
      key: 'A',
      name: 'Atteignable',
      hint: 'Note les moyens concrets qui rendent cet objectif réaliste.',
      filled: goal.achievable.trim().length > 0,
    },
    {
      key: 'R',
      name: 'Pertinent',
      hint: 'Explique pourquoi cet objectif compte pour toi.',
      filled: goal.relevant.trim().length > 0,
    },
    {
      key: 'T',
      name: 'Temporel',
      hint: 'Fixe une date de début et une échéance.',
      filled:
        goal.startsOn.trim().length > 0 &&
        goal.dueOn.trim().length > 0 &&
        daysBetween(goal.startsOn, goal.dueOn) >= 0,
    },
  ]
}

export function smartScore(goal: Goal): number {
  return smartCriteria(goal).filter((criterion) => criterion.filled).length
}

export type Pace = 'done' | 'overdue' | 'not-started' | 'ahead' | 'on-track' | 'behind'

export type MilestoneStatus = 'reached' | 'missed' | 'upcoming'

export type MilestoneView = {
  milestone: GoalMilestone
  status: MilestoneStatus
  /** Négatif si la date est passée. */
  daysLeft: number
  /** Ce qu'il manque pour atteindre ce palier. */
  remaining: number
}

/** Paliers triés par date, avec leur état vis-à-vis de la valeur actuelle. */
export function milestoneViews(
  goal: Goal,
  current: number,
  today = todayDay(),
): MilestoneView[] {
  return [...goal.milestones]
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((milestone) => {
      const daysLeft = daysBetween(today, milestone.dueOn)
      const reached = current >= milestone.target
      return {
        milestone,
        status: reached ? 'reached' : daysLeft < 0 ? 'missed' : 'upcoming',
        daysLeft,
        remaining: Math.max(0, milestone.target - current),
      }
    })
}

export const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  reached: 'atteint',
  missed: 'manqué',
  upcoming: 'à venir',
}

export const MILESTONE_TONES: Record<MilestoneStatus, Tone> = {
  reached: 'ok',
  missed: 'danger',
  upcoming: 'muted',
}

export type GoalProgress = {
  /** Apporté par les cartes terminées. */
  fromCards: number
  manual: number
  current: number
  target: number
  /** Peut dépasser 1 quand l'objectif est battu. */
  ratio: number
  remaining: number
  /** Cartes rattachées, terminées ou non. */
  linked: number
  linkedDone: number
  daysTotal: number
  daysElapsed: number
  daysLeft: number
  /** Part du temps imparti déjà écoulée, 0 à 1. */
  timeRatio: number
  pace: Pace
  /** Ce qu'il reste à produire chaque semaine pour tenir l'échéance. */
  perWeekNeeded: number
  /** Paliers, triés et qualifiés. */
  milestones: MilestoneView[]
  /** Valeur attendue aujourd'hui d'après le dernier palier échu — null s'il n'y en a pas. */
  expected: number | null
  /** Prochain palier non encore échu. */
  nextMilestone: MilestoneView | null
}

/** Marge de tolérance avant de déclarer une avance ou un retard. */
const PACE_TOLERANCE = 0.08

export function isCardCounted(card: Card, goalId: ID): boolean {
  return card.goalId === goalId && card.doneAt !== null && card.archivedAt === null
}

export function goalProgress(goal: Goal, cards: Card[], today = todayDay()): GoalProgress {
  const linkedCards = cards.filter((card) => card.goalId === goal.id && card.archivedAt === null)
  const doneCards = linkedCards.filter((card) => card.doneAt !== null)
  const fromCards = doneCards.reduce((sum, card) => sum + card.contribution, 0)

  const current = goal.manualProgress + fromCards
  const target = goal.target
  const ratio = target > 0 ? current / target : current > 0 ? 1 : 0
  const remaining = Math.max(0, target - current)

  const daysTotal = Math.max(1, daysBetween(goal.startsOn, goal.dueOn))
  const daysLeft = daysBetween(today, goal.dueOn)
  const daysElapsed = Math.min(daysTotal, Math.max(0, daysBetween(goal.startsOn, today)))
  const timeRatio = daysElapsed / daysTotal

  const milestones = milestoneViews(goal, current, today)
  // Le dernier palier dont la date est passée dit où l'on devrait en être.
  const due = milestones.filter((view) => view.daysLeft <= 0)
  const expected = due.length > 0 ? due[due.length - 1].milestone.target : null
  const nextMilestone = milestones.find((view) => view.daysLeft > 0) ?? null

  let pace: Pace
  if (ratio >= 1) pace = 'done'
  else if (daysLeft < 0) pace = 'overdue'
  else if (daysBetween(today, goal.startsOn) > 0) pace = 'not-started'
  else if (expected !== null) {
    // Quand des paliers existent, ils font foi : « au 1er oct je devais être à
    // 900 » est un jugement bien plus juste que la part de temps écoulée.
    const margin = target > 0 ? target * 0.02 : 0
    if (current >= expected + margin) pace = 'ahead'
    else if (current >= expected - margin) pace = 'on-track'
    else pace = 'behind'
  } else if (ratio >= timeRatio + PACE_TOLERANCE) pace = 'ahead'
  else if (ratio >= timeRatio - PACE_TOLERANCE) pace = 'on-track'
  else pace = 'behind'

  const weeksLeft = daysLeft > 0 ? daysLeft / 7 : 0
  const perWeekNeeded = weeksLeft > 0 ? remaining / weeksLeft : remaining

  return {
    fromCards,
    manual: goal.manualProgress,
    current,
    target,
    ratio,
    remaining,
    linked: linkedCards.length,
    linkedDone: doneCards.length,
    daysTotal,
    daysElapsed,
    daysLeft,
    timeRatio,
    pace,
    perWeekNeeded,
    milestones,
    expected,
    nextMilestone,
  }
}

export const PACE_LABELS: Record<Pace, string> = {
  done: 'Atteint',
  overdue: 'Échéance dépassée',
  'not-started': 'Pas encore commencé',
  ahead: "En avance",
  'on-track': 'Dans les temps',
  behind: 'En retard',
}

export type Tone = 'ok' | 'warn' | 'danger' | 'muted'

export const PACE_TONES: Record<Pace, Tone> = {
  done: 'ok',
  overdue: 'danger',
  'not-started': 'muted',
  ahead: 'ok',
  'on-track': 'ok',
  behind: 'warn',
}

/** Arrondi lisible : « 12 », « 12,5 » — et pas « 12.499999999 ». */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

export function formatWithUnit(value: number, unit: string): string {
  const amount = formatAmount(value)
  return unit.trim() ? `${amount} ${unit.trim()}` : amount
}
