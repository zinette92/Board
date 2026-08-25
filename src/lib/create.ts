/** Fabriques : un seul endroit décide des valeurs par défaut d'une entité neuve. */

import { endOfMonth, today } from './dates'
import { newId, nowIso } from './id'
import { POSITION_STEP } from './ordering'
import type {
  Board,
  Card,
  Checklist,
  ChecklistItem,
  Goal,
  GoalCategory,
  GoalMilestone,
  ID,
  Label,
  LabelColor,
  List,
  Reminder,
} from './types'

export function makeBoard(name: string, emoji = '🗂️', position = POSITION_STEP): Board {
  const at = nowIso()
  return {
    id: newId(),
    name: name.trim() || 'Nouveau tableau',
    emoji,
    position,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  }
}

export function makeList(
  boardId: ID,
  name: string,
  position: number,
  options: {
    isDone?: boolean
    wipLimit?: number
    color?: LabelColor | null
    isTemplate?: boolean
  } = {},
): List {
  const at = nowIso()
  return {
    id: newId(),
    boardId,
    name: name.trim() || 'Nouvelle liste',
    position,
    isDone: options.isDone ?? false,
    isTemplate: options.isTemplate ?? false,
    wipLimit: options.wipLimit ?? 0,
    color: options.color ?? null,
    collapsed: false,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  }
}

export function makeCard(boardId: ID, listId: ID, title: string, position: number): Card {
  const at = nowIso()
  return {
    id: newId(),
    boardId,
    listId,
    title: title.trim() || 'Nouvelle tâche',
    description: '',
    position,
    goalId: null,
    contribution: 1,
    labelIds: [],
    dueOn: null,
    dueTime: null,
    doneAt: null,
    waiting: false,
    checklists: [],
    attachmentCount: 0,
    schedule: null,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  }
}

export function makeLabel(name: string, color: string): Label {
  return { id: newId(), name: name.trim(), color, createdAt: nowIso() }
}

/**
 * Un objectif naît volontairement incomplet : les cinq critères SMART sont
 * vides et l'interface montre lesquels manquent. Seules les dates ont un défaut
 * utile — du jour à la fin du mois courant.
 */
export function makeGoal(
  category: GoalCategory = 'personal',
  position = POSITION_STEP,
  overrides: Partial<Goal> = {},
): Goal {
  const at = nowIso()
  const start = today()
  return {
    id: newId(),
    title: '',
    specific: '',
    metric: '',
    target: 0,
    unit: '',
    manualProgress: 0,
    achievable: '',
    relevant: '',
    startsOn: start,
    dueOn: endOfMonth(start),
    milestones: [],
    category,
    status: 'active',
    position,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

export function makeMilestone(target: number, dueOn: string, label = ''): GoalMilestone {
  return { id: newId(), label, target, dueOn }
}

export function makeReminder(title = ''): Reminder {
  const at = nowIso()
  return {
    id: newId(),
    title,
    note: '',
    labelIds: [],
    startsOn: today(),
    at: '09:00',
    // Rappel unique par défaut : le cas le plus courant.
    repeat: null,
    leadDays: 0,
    active: true,
    doneOn: [],
    notifiedOn: null,
    createdAt: at,
    updatedAt: at,
  }
}

export function makeChecklistItem(text: string): ChecklistItem {
  return { id: newId(), text: text.trim(), done: false, dueOn: null, dueTime: null }
}

export function makeChecklist(title = 'Checklist'): Checklist {
  return { id: newId(), title, items: [] }
}
