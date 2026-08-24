/**
 * Modèles du board. Rien d'autre que des données : aucune logique, aucun import.
 *
 * Toutes les dates « instant » sont des ISO complètes (`createdAt`, `doneAt`),
 * toutes les dates « jour » sont des `YYYY-MM-DD` (`dueOn`, `startsOn`) — la
 * distinction évite les décalages de fuseau sur une échéance qui, pour un
 * humain, est un jour et pas un instant.
 */

export type ID = string

export type Board = {
  id: ID
  name: string
  emoji: string
  position: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type List = {
  id: ID
  boardId: ID
  name: string
  position: number
  /**
   * Hérité des débuts (listes « terminales ») — ignoré depuis le 18/08/2026 :
   * l'état terminé vit sur la carte (`doneAt`, coché à la main comme sur
   * Trello), et toutes les listes sont équivalentes. Conservé parce que des
   * lignes stockées le portent encore.
   */
  isDone: boolean
  /** Limite de travail en cours ; 0 = aucune limite. */
  wipLimit: number
  /** Teinte de fond de la colonne, dans la même palette que les étiquettes. */
  color: LabelColor | null
  /** Réduite en barre verticale, à la Trello. */
  collapsed: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export const LABEL_COLORS = [
  'slate',
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export type Label = {
  id: ID
  name: string
  /**
   * Couleur libre depuis le 18/08 (pipette type Figma) : un hex `#rrggbb` —
   * ou l'un des 8 noms historiques (`red`, `blue`…) sur les lignes anciennes,
   * que `resolveLabelColor` sait encore traduire.
   */
  color: string
  createdAt: string
}

export type ChecklistItem = {
  id: ID
  text: string
  done: boolean
  /** Échéance propre à l'étape, `YYYY-MM-DD` ou null. */
  dueOn: string | null
  /** Heure de l'échéance de l'étape, `HH:MM` ou null. */
  dueTime: string | null
}

/** Une carte peut porter plusieurs checklists, chacune avec son titre — comme sur Trello. */
export type Checklist = {
  id: ID
  title: string
  items: ChecklistItem[]
}

export type Card = {
  id: ID
  boardId: ID
  listId: ID
  title: string
  /** Markdown. */
  description: string
  position: number
  /** Objectif SMART servi par cette tâche, s'il y en a un. */
  goalId: ID | null
  /**
   * Ce que la carte apporte à la mesure de l'objectif quand elle est terminée,
   * dans l'unité de l'objectif. 1 par défaut : « une tâche = une unité ».
   */
  contribution: number
  labelIds: ID[]
  /** `YYYY-MM-DD` ou null. */
  dueOn: string | null
  /** Heure de l'échéance, `HH:MM` ou null — n'existe qu'avec `dueOn`. */
  dueTime: string | null
  /** Coché à la main (rond de la carte), jamais déduit de la liste. */
  doneAt: string | null
  checklists: Checklist[]
  /** Nombre de pièces jointes ; les fichiers eux-mêmes vivent dans leur propre store. */
  attachmentCount: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

/**
 * Les octets vivent dans le bucket Storage `attachments` ; ce type n'en porte
 * que les métadonnées, plus une URL signée temporaire pour l'affichage.
 */
export type Attachment = {
  id: ID
  cardId: ID
  name: string
  mime: string
  size: number
  /** Chemin dans le bucket : `{user_id}/{id}`. */
  path: string
  /** URL signée, valable quelques heures. */
  url: string
  createdAt: string
}

export const GOAL_CATEGORIES = ['health', 'business', 'personal'] as const
export type GoalCategory = (typeof GOAL_CATEGORIES)[number]

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  health: 'Santé',
  business: 'Business',
  personal: 'Personnel',
}

export type GoalStatus = 'active' | 'paused' | 'archived'

/**
 * Palier : un jalon chiffré et daté sur la route de l'objectif — « au 1er
 * octobre, être à 900 ». C'est la trajectoire attendue, et c'est elle qui sert
 * à dire si l'on est en avance ou en retard (plutôt que le temps écoulé).
 */
export type GoalMilestone = {
  id: ID
  /** Libellé libre, facultatif : la date et la cible se suffisent souvent. */
  label: string
  /** Valeur à atteindre à cette date, dans l'unité de l'objectif. */
  target: number
  /** `YYYY-MM-DD`. */
  dueOn: string
}

/**
 * Objectif SMART. Les cinq critères sont des champs distincts et non un texte
 * libre : c'est ce qui permet de dire à l'écran ce qui manque à un objectif
 * pour être réellement SMART, au lieu de faire confiance à la bonne volonté.
 */
export type Goal = {
  id: ID
  /** S — Spécifique. */
  title: string
  specific: string
  /** M — Mesurable. */
  metric: string
  target: number
  unit: string
  /** Ce qui est déjà acquis hors de l'outil, pour ne pas repartir de zéro. */
  manualProgress: number
  /** A — Atteignable : les moyens concrets qu'on se donne. */
  achievable: string
  /** R — Pertinent : pourquoi cet objectif compte. */
  relevant: string
  /** T — Temporel. `YYYY-MM-DD`. */
  startsOn: string
  dueOn: string
  /** Paliers intermédiaires, triés par date. */
  milestones: GoalMilestone[]
  category: GoalCategory
  status: GoalStatus
  position: number
  createdAt: string
  updatedAt: string
}

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number]

/**
 * Rythme d'un rappel. Deux formes seulement :
 * - `interval` couvre « tous les jours », « toutes les 2 semaines », « tous les
 *   3 mois », « chaque année » ;
 * - `weekdays` couvre « les lundi et jeudi ».
 * `null` (hors de ce type) signifie « une seule fois ».
 */
export type Repeat =
  | { kind: 'interval'; interval: number; unit: RecurrenceUnit }
  | { kind: 'weekdays'; days: number[] }

/**
 * Rappel : une échéance datée et heurée, qui n'apparaît que dans le
 * **calendrier** — jamais sur le tableau, et sans créer de carte.
 */
export type Reminder = {
  id: ID
  title: string
  /** Précision libre : contexte, lien, numéro de dossier… */
  note: string
  labelIds: ID[]
  /** Première occurrence (ou la seule), `YYYY-MM-DD`. */
  startsOn: string
  /** Heure du rappel, `HH:MM`. */
  at: string
  /** `null` = rappel unique. */
  repeat: Repeat | null
  /** Pré-avis : prévenir aussi X jours avant l'échéance. 0 = pas de pré-avis. */
  leadDays: number
  active: boolean
  /**
   * Occurrences validées, `YYYY-MM-DD`. Une liste et **pas** un repère de
   * progression : chaque échéance se valide séparément, donc oublier lundi ne
   * le fait pas disparaître quand mardi arrive. Élaguée au-delà d'un an.
   */
  doneOn: string[]
  /** Dernier jour où une notification a été émise, pour ne pas la répéter. */
  notifiedOn: string | null
  createdAt: string
  updatedAt: string
}

/** Tout ce que l'app tient en mémoire. Le jeu de données d'un usage perso y rentre sans peine. */
export type Snapshot = {
  boards: Board[]
  lists: List[]
  cards: Card[]
  labels: Label[]
  goals: Goal[]
  reminders: Reminder[]
}
