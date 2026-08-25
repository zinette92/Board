/**
 * ============================================================================
 *  LA FRONTIÈRE AVEC LE BACKEND. Tout le reste de l'application l'ignore.
 * ============================================================================
 *
 * Depuis le passage en production (20/08/2026), la persistance est Supabase.
 * Ce fichier est le seul à connaître Postgres et Storage : partout ailleurs on
 * ne manipule que les types de `types.ts`, en camelCase.
 *
 * Deux traductions se font ici, et nulle part ailleurs :
 * - **snake_case ↔ camelCase** : convention Postgres d'un côté, convention
 *   TypeScript de l'autre. Les mappeurs sont typés dans les deux sens, donc un
 *   champ oublié est une erreur de compilation, pas un bug silencieux.
 * - **fichiers ↔ URL signées** : les pièces jointes et fonds d'écran vivent
 *   dans des buckets privés ; l'interface ne reçoit qu'une URL temporaire.
 */

import { SIGNED_URL_TTL, supabase } from './supabase'
import { newId, nowIso } from './id'
import type {
  Attachment,
  Board,
  Card,
  CardSchedule,
  Checklist,
  Goal,
  GoalCategory,
  GoalMilestone,
  GoalStatus,
  ID,
  Label,
  LabelColor,
  List,
  Reminder,
  Repeat,
  Snapshot,
} from './types'

/** Une réponse Supabase en erreur doit remonter : le garde-fou de `state.tsx` l'affiche. */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

/* ========================================================================== */
/*  Lignes Postgres                                                            */
/* ========================================================================== */

type BoardRow = {
  id: string
  name: string
  emoji: string
  position: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

type ListRow = {
  id: string
  board_id: string
  name: string
  position: number
  is_done: boolean
  is_template: boolean
  wip_limit: number
  color: string | null
  collapsed: boolean
  created_at: string
  updated_at: string
  archived_at: string | null
}

type LabelRow = {
  id: string
  name: string
  color: string
  created_at: string
}

type GoalRow = {
  id: string
  title: string
  specific: string
  metric: string
  target: number
  unit: string
  manual_progress: number
  achievable: string
  relevant: string
  starts_on: string
  due_on: string
  milestones: GoalMilestone[]
  category: GoalCategory
  status: GoalStatus
  position: number
  created_at: string
  updated_at: string
}

type CardRow = {
  id: string
  board_id: string
  list_id: string
  title: string
  description: string
  position: number
  goal_id: string | null
  contribution: number
  label_ids: string[]
  due_on: string | null
  due_time: string | null
  done_at: string | null
  checklists: Checklist[]
  attachment_count: number
  schedule: CardSchedule | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

type ReminderRow = {
  id: string
  title: string
  note: string
  label_ids: string[]
  starts_on: string
  at: string
  repeat: Repeat | null
  lead_days: number
  active: boolean
  done_on: string[]
  notified_on: string | null
  created_at: string
  updated_at: string
}

type AttachmentRow = {
  id: string
  card_id: string
  name: string
  mime: string
  size: number
  path: string
  created_at: string
}

/* ========================================================================== */
/*  Traduction                                                                 */
/* ========================================================================== */

const board = {
  from: (r: BoardRow): Board => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  }),
  to: (b: Board): BoardRow => ({
    id: b.id,
    name: b.name,
    emoji: b.emoji,
    position: b.position,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    archived_at: b.archivedAt,
  }),
}

const list = {
  from: (r: ListRow): List => ({
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    position: r.position,
    isDone: r.is_done,
    isTemplate: r.is_template ?? false,
    wipLimit: r.wip_limit,
    color: r.color as LabelColor | null,
    collapsed: r.collapsed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  }),
  to: (l: List): ListRow => ({
    id: l.id,
    board_id: l.boardId,
    name: l.name,
    position: l.position,
    is_done: l.isDone,
    is_template: l.isTemplate,
    wip_limit: l.wipLimit,
    color: l.color,
    collapsed: l.collapsed,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
    archived_at: l.archivedAt,
  }),
}

const label = {
  from: (r: LabelRow): Label => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: r.created_at,
  }),
  to: (l: Label): LabelRow => ({
    id: l.id,
    name: l.name,
    color: l.color,
    created_at: l.createdAt,
  }),
}

const goal = {
  from: (r: GoalRow): Goal => ({
    id: r.id,
    title: r.title,
    specific: r.specific,
    metric: r.metric,
    target: r.target,
    unit: r.unit,
    manualProgress: r.manual_progress,
    achievable: r.achievable,
    relevant: r.relevant,
    startsOn: r.starts_on,
    dueOn: r.due_on,
    milestones: r.milestones ?? [],
    category: r.category,
    status: r.status,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  to: (g: Goal): GoalRow => ({
    id: g.id,
    title: g.title,
    specific: g.specific,
    metric: g.metric,
    target: g.target,
    unit: g.unit,
    manual_progress: g.manualProgress,
    achievable: g.achievable,
    relevant: g.relevant,
    starts_on: g.startsOn,
    due_on: g.dueOn,
    milestones: g.milestones,
    category: g.category,
    status: g.status,
    position: g.position,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  }),
}

const card = {
  from: (r: CardRow): Card => ({
    id: r.id,
    boardId: r.board_id,
    listId: r.list_id,
    title: r.title,
    description: r.description,
    position: r.position,
    goalId: r.goal_id,
    contribution: r.contribution,
    labelIds: r.label_ids ?? [],
    dueOn: r.due_on,
    dueTime: r.due_time,
    doneAt: r.done_at,
    checklists: r.checklists ?? [],
    attachmentCount: r.attachment_count,
    schedule: r.schedule ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  }),
  to: (c: Card): CardRow => ({
    id: c.id,
    board_id: c.boardId,
    list_id: c.listId,
    title: c.title,
    description: c.description,
    position: c.position,
    goal_id: c.goalId,
    contribution: c.contribution,
    label_ids: c.labelIds,
    due_on: c.dueOn,
    due_time: c.dueTime,
    done_at: c.doneAt,
    checklists: c.checklists,
    attachment_count: c.attachmentCount,
    schedule: c.schedule,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    archived_at: c.archivedAt,
  }),
}

const reminder = {
  from: (r: ReminderRow): Reminder => ({
    id: r.id,
    title: r.title,
    note: r.note,
    labelIds: r.label_ids ?? [],
    startsOn: r.starts_on,
    at: r.at,
    repeat: r.repeat,
    leadDays: r.lead_days,
    active: r.active,
    doneOn: r.done_on ?? [],
    notifiedOn: r.notified_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  to: (x: Reminder): ReminderRow => ({
    id: x.id,
    title: x.title,
    note: x.note,
    label_ids: x.labelIds,
    starts_on: x.startsOn,
    at: x.at,
    repeat: x.repeat,
    lead_days: x.leadDays,
    active: x.active,
    done_on: x.doneOn,
    notified_on: x.notifiedOn,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
  }),
}

/* ========================================================================== */
/*  Collections                                                                */
/* ========================================================================== */

type Mapper<T, R> = { from: (row: R) => T; to: (value: T) => R }

/** Fabrique le CRUD d'une entité, pour éviter six copies du même code. */
function collection<T extends { id: ID }, R>(table: string, map: Mapper<T, R>) {
  return {
    all: async (): Promise<T[]> => {
      const rows = unwrap(await supabase.from(table).select('*'))
      return (rows as R[]).map(map.from)
    },
    get: async (id: ID): Promise<T | undefined> => {
      const rows = unwrap(await supabase.from(table).select('*').eq('id', id).limit(1))
      const row = (rows as R[])[0]
      return row ? map.from(row) : undefined
    },
    // Le typage générique de supabase-js ne sait pas résoudre `R` ici : la
    // forme réelle est garantie par le mappeur juste au-dessus.
    put: async (value: T): Promise<void> => {
      unwrap(await supabase.from(table).upsert(map.to(value) as never))
    },
    putMany: async (values: T[]): Promise<void> => {
      if (values.length === 0) return
      unwrap(await supabase.from(table).upsert(values.map(map.to) as never))
    },
    remove: async (id: ID): Promise<void> => {
      unwrap(await supabase.from(table).delete().eq('id', id))
    },
    removeMany: async (ids: ID[]): Promise<void> => {
      if (ids.length === 0) return
      unwrap(await supabase.from(table).delete().in('id', ids))
    },
  }
}

export const boards = collection<Board, BoardRow>('boards', board)
export const lists = collection<List, ListRow>('lists', list)
export const labels = collection<Label, LabelRow>('labels', label)
export const goals = collection<Goal, GoalRow>('goals', goal)
export const cards = collection<Card, CardRow>('cards', card)
export const reminders = collection<Reminder, ReminderRow>('reminders', reminder)

/* ========================================================================== */
/*  Fichiers                                                                   */
/* ========================================================================== */

const ATTACHMENTS_BUCKET = 'attachments'
const WALLPAPERS_BUCKET = 'wallpapers'

/** Identifiant de l'utilisateur connecté : sert de préfixe de dossier Storage. */
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Session expirée — reconnecte-toi.')
  return data.user.id
}

async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

/**
 * Les octets restent dans le bucket ; la table ne porte que les métadonnées.
 * L'interface reçoit une URL signée, valable quelques heures — un rechargement
 * de page en régénère une si elle expire.
 */
export const attachments = {
  ofCard: async (cardId: ID): Promise<Attachment[]> => {
    const rows = unwrap(
      await supabase.from('attachments').select('*').eq('card_id', cardId),
    ) as AttachmentRow[]
    if (rows.length === 0) return []
    // Une seule requête de signature pour tout le lot.
    const { data: signed } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrls(
        rows.map((row) => row.path),
        SIGNED_URL_TTL,
      )
    const urlByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]))
    return rows.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      path: row.path,
      url: urlByPath.get(row.path) ?? '',
      createdAt: row.created_at,
    }))
  },

  add: async (cardId: ID, file: File): Promise<Attachment> => {
    const id = newId()
    const path = `${await currentUserId()}/${id}`
    const upload = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (upload.error) throw new Error(upload.error.message)

    const row: AttachmentRow = {
      id,
      card_id: cardId,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      path,
      created_at: nowIso(),
    }
    try {
      unwrap(await supabase.from('attachments').insert(row))
    } catch (cause) {
      // Sans ce nettoyage, un échec d'insertion laisserait un fichier orphelin
      // dans le bucket, invisible et impossible à retrouver depuis l'app.
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path])
      throw cause
    }

    return {
      id,
      cardId,
      name: row.name,
      mime: row.mime,
      size: row.size,
      path,
      url: (await signedUrl(ATTACHMENTS_BUCKET, path)) ?? '',
      createdAt: row.created_at,
    }
  },

  remove: async (id: ID): Promise<void> => {
    await attachments.removeMany([id])
  },

  /** Supprime d'abord les fichiers, puis les lignes : l'inverse perdrait les chemins. */
  removeMany: async (ids: ID[]): Promise<void> => {
    if (ids.length === 0) return
    const rows = unwrap(
      await supabase.from('attachments').select('id, path').in('id', ids),
    ) as Pick<AttachmentRow, 'id' | 'path'>[]
    if (rows.length > 0) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove(rows.map((row) => row.path))
    }
    unwrap(await supabase.from('attachments').delete().in('id', ids))
  },
}

/**
 * Fond d'écran : un fichier par tableau, sans table associée — le chemin
 * (`{user_id}/{board_id}`) porte à lui seul toute l'information.
 */
export const wallpapers = {
  get: async (boardId: ID): Promise<string | null> => {
    const path = `${await currentUserId()}/${boardId}`
    const { data } = await supabase.storage
      .from(WALLPAPERS_BUCKET)
      .list(await currentUserId(), { search: boardId })
    if (!data || data.length === 0) return null
    return signedUrl(WALLPAPERS_BUCKET, path)
  },

  put: async (boardId: ID, blob: Blob): Promise<string | null> => {
    const path = `${await currentUserId()}/${boardId}`
    const upload = await supabase.storage
      .from(WALLPAPERS_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
    if (upload.error) throw new Error(upload.error.message)
    return signedUrl(WALLPAPERS_BUCKET, path)
  },

  remove: async (boardId: ID): Promise<void> => {
    const path = `${await currentUserId()}/${boardId}`
    await supabase.storage.from(WALLPAPERS_BUCKET).remove([path])
  },
}

/* ========================================================================== */
/*  Chargement, réglages, remise à zéro                                        */
/* ========================================================================== */

/** Charge tout ce dont l'interface a besoin. Un usage perso tient largement en mémoire. */
export async function loadSnapshot(): Promise<Snapshot> {
  const [boardRows, listRows, cardRows, labelRows, goalRows, reminderRows] = await Promise.all([
    boards.all(),
    lists.all(),
    cards.all(),
    labels.all(),
    goals.all(),
    reminders.all(),
  ])
  return {
    boards: boardRows,
    lists: listRows,
    cards: cardRows,
    labels: labelRows,
    goals: goalRows,
    reminders: reminderRows,
  }
}

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const rows = unwrap(await supabase.from('meta').select('value').eq('key', key).limit(1)) as {
    value: T
  }[]
  return rows[0]?.value
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  unwrap(await supabase.from('meta').upsert({ key, value }, { onConflict: 'user_id,key' }))
}

/**
 * Remet le compte à zéro. L'ordre suit les dépendances : les cartes avant les
 * listes, les listes avant les tableaux — même si les cascades s'en
 * chargeraient, être explicite évite de dépendre d'un détail du schéma.
 */
export async function wipe(): Promise<void> {
  const userId = await currentUserId()

  const allAttachments = unwrap(await supabase.from('attachments').select('path')) as {
    path: string
  }[]
  if (allAttachments.length > 0) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(allAttachments.map((row) => row.path))
  }
  const { data: paperFiles } = await supabase.storage.from(WALLPAPERS_BUCKET).list(userId)
  if (paperFiles && paperFiles.length > 0) {
    await supabase.storage
      .from(WALLPAPERS_BUCKET)
      .remove(paperFiles.map((file) => `${userId}/${file.name}`))
  }

  for (const table of ['attachments', 'cards', 'lists', 'boards', 'goals', 'labels', 'reminders']) {
    unwrap(await supabase.from(table).delete().eq('user_id', userId))
  }
  unwrap(await supabase.from('meta').delete().eq('user_id', userId))
}
