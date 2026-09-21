import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { DatePicker } from '../../components/DatePicker'
import {
  Button,
  ConfirmButton,
  Field,
  Modal,
  Select,
  TextInput,
  cx,
} from '../../components/ui'
import { addDays, formatFullDay, parseDay, toDay, today } from '../../lib/dates'
import { gcalCreate, gcalDelete, gcalList, gcalUpdate } from '../../lib/gcal'
import { goalProgress } from '../../lib/goals'
import type { GcalCalendar, GcalEvent } from '../../lib/gcal'
import { chipStyle } from '../../lib/palette'
import { isValidated, occurrencesBetween } from '../../lib/reminders'
import { useStore } from '../../lib/state'
import type { Board, Card, Goal, ID, Label, Reminder } from '../../lib/types'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
type Mode = 'day' | 'week' | 'month'

const MODE_KEY = 'perso-board:calendar-mode'

/** Hauteur d'une heure dans les grilles horaires, en pixels. */
const HOUR_PX = 44
/** Première heure montrée à l'ouverture : la nuit n'intéresse personne. */
const FIRST_VISIBLE_HOUR = 7

const dayTitleFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Vue des échéances : cartes datées, deadlines des objectifs, rappels et
 * événements Google. Trois présentations, à la Google Agenda — le **jour** sur
 * ses 24 heures, la **semaine** en sept colonnes horaires, et le **mois** en
 * grille. Les flèches avancent d'un pas de la taille de la vue ; « Aujourd'hui »
 * ramène au jour courant sans changer de vue.
 */
export function CalendarView({
  onOpenCard,
  hasWallpaper,
}: {
  onOpenCard: (id: ID) => void
  hasWallpaper: boolean
}) {
  const store = useStore()
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(MODE_KEY)
    // « agenda » a existé jusqu'au 21/09 : la semaine en prend la suite.
    if (saved === 'agenda' || saved === 'week') return 'week'
    return saved === 'day' ? 'day' : 'month'
  })
  /**
   * Jour de référence — et non plus le 1er du mois : la même valeur sert aux
   * trois vues (le jour lui-même, sa semaine, son mois).
   */
  const [anchor, setAnchor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  })

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

  /* ------------------------------------------------------- Google Agenda --
   * Les événements de la fenêtre affichée, relus à chaque navigation et après
   * chaque écriture. Pont non configuré → liste vide, le calendrier vit sans.
   */
  const [gcalEvents, setGcalEvents] = useState<GcalEvent[]>([])
  /** Agendas suivis : servent à colorier, et à choisir où écrire. */
  const [calendars, setCalendars] = useState<GcalCalendar[]>([])
  const [gcalError, setGcalError] = useState(false)
  const [gcalVersion, setGcalVersion] = useState(0)
  const [editing, setEditing] = useState<GcalEvent | 'new' | null>(null)

  /** Les jours affichés, dans l'ordre : un seul, sept, ou rien (le mois). */
  const shownDays = useMemo(() => {
    const base = toDay(anchor)
    if (mode === 'day') return [base]
    if (mode === 'week') {
      // Semaine à la française : on remonte au lundi.
      const weekday = anchor.getDay()
      const monday = addDays(base, weekday === 0 ? -6 : 1 - weekday)
      return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
    }
    return []
  }, [mode, anchor])

  const range = useMemo(() => {
    if (shownDays.length > 0) {
      return {
        from: addDays(shownDays[0], -1),
        to: addDays(shownDays[shownDays.length - 1], 1),
      }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    // La grille montre jusqu'à 6 jours des mois voisins.
    return { from: addDays(toDay(first), -7), to: addDays(toDay(last), 7) }
  }, [shownDays, anchor])

  useEffect(() => {
    let stale = false
    gcalList(range.from, range.to)
      .then((result) => {
        if (stale) return
        setGcalEvents(result.events)
        setCalendars(result.calendars)
        setGcalError(false)
      })
      .catch(() => {
        if (!stale) setGcalError(true)
      })
    return () => {
      stale = true
    }
  }, [range, gcalVersion])

  const gcalByDay = useMemo(() => {
    const map = new Map<string, GcalEvent[]>()
    for (const event of gcalEvents) {
      if (!event.day) continue
      const list = map.get(event.day) ?? []
      list.push(event)
      map.set(event.day, list)
    }
    return map
  }, [gcalEvents])

  const cardsByDay = useMemo(() => {
    const map = new Map<string, Card[]>()
    for (const card of store.cards) {
      if (!card.dueOn || card.archivedAt !== null) continue
      const list = map.get(card.dueOn) ?? []
      list.push(card)
      map.set(card.dueOn, list)
    }
    return map
  }, [store.cards])

  const goalsByDay = useMemo(() => {
    const map = new Map<string, Goal[]>()
    for (const goal of store.goals) {
      if (goal.status !== 'active' || !goal.dueOn) continue
      const list = map.get(goal.dueOn) ?? []
      list.push(goal)
      map.set(goal.dueOn, list)
    }
    return map
  }, [store.goals])

  /**
   * Objectifs dont la cible est atteinte : leur puce se barre, comme celle
   * d'un rappel validé. C'est déduit des cartes rattachées, jamais stocké —
   * cocher la carte qui porte l'objectif barre donc la puce aussitôt.
   */
  const reachedGoals = useMemo(() => {
    const live = store.cards.filter((card) => card.archivedAt === null)
    return new Set(
      store.goals.filter((goal) => goalProgress(goal, live).ratio >= 1).map((goal) => goal.id),
    )
  }, [store.goals, store.cards])

  const boardsById = useMemo(
    () => new Map(store.boards.map((board) => [board.id, board] as const)),
    [store.boards],
  )
  const labelsById = useMemo(
    () => new Map(store.labels.map((label) => [label.id, label] as const)),
    [store.labels],
  )

  /**
   * Rappels indexés par jour, sur une fenêtre large : l'échéance elle-même et,
   * le cas échéant, le pré-avis « X jours avant ». Recalculé à la volée — les
   * occurrences ne sont jamais stockées.
   */
  const remindersByDay = useMemo(() => {
    const map = new Map<string, ReminderHit[]>()
    const from = addDays(today(), -400)
    const to = addDays(today(), 800)
    for (const reminder of store.reminders) {
      for (const on of occurrencesBetween(reminder, from, to)) {
        const list = map.get(on) ?? []
        list.push({ reminder, lead: false, target: on })
        map.set(on, list)
        if (reminder.leadDays > 0) {
          const notice = addDays(on, -reminder.leadDays)
          const early = map.get(notice) ?? []
          early.push({ reminder, lead: true, target: on })
          map.set(notice, early)
        }
      }
    }
    return map
  }, [store.reminders])

  const todayDay = today()

  /** Un pas de navigation : un jour, une semaine, ou un mois. */
  const step = (direction: number) => {
    if (mode === 'month') {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1))
      return
    }
    setAnchor(new Date(parseDay(addDays(toDay(anchor), direction * (mode === 'week' ? 7 : 1)))))
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6">
      <div
        className={cx(
          'mx-auto flex max-w-6xl flex-col gap-3',
          // Panneau OPAQUE aux couleurs du thème — même rendu qu'en plein écran,
          // posé sur la photo. Le verre sombre a été essayé et refusé.
          hasWallpaper && 'rounded-2xl border border-line bg-bg p-4 shadow-lg',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold capitalize">
            {mode === 'day'
              ? dayTitleFormatter.format(anchor)
              : mode === 'week'
                ? `${formatFullDay(shownDays[0])} — ${formatFullDay(shownDays[6])}`
                : monthFormatter.format(anchor)}
          </h2>

          <Button size="sm" onClick={() => setEditing('new')}>
            ＋ Événement Google
          </Button>

          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['day', 'Jour'],
                ['week', 'Semaine'],
                ['month', 'Mois'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => step(-1)} aria-label="Période précédente">
            ‹
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const now = new Date()
              setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
            }}
          >
            Aujourd'hui
          </Button>
          <Button size="sm" onClick={() => step(1)} aria-label="Période suivante">
            ›
          </Button>
        </div>

        {mode === 'month' ? (
          <MonthGrid
            anchor={anchor}
            todayDay={todayDay}
            cardsByDay={cardsByDay}
            goalsByDay={goalsByDay}
            reachedGoals={reachedGoals}
            remindersByDay={remindersByDay}
            gcalByDay={gcalByDay}
            labelsById={labelsById}
            boardsById={boardsById}
            onOpenCard={onOpenCard}
            onOpenEvent={setEditing}
          />
        ) : (
          <TimeGrid
            days={shownDays}
            todayDay={todayDay}
            cardsByDay={cardsByDay}
            goalsByDay={goalsByDay}
            reachedGoals={reachedGoals}
            remindersByDay={remindersByDay}
            gcalByDay={gcalByDay}
            labelsById={labelsById}
            boardsById={boardsById}
            onOpenCard={onOpenCard}
            onOpenEvent={setEditing}
          />
        )}

        <p className="text-xs text-muted">
          Tâches datées, échéances d'objectifs, 🔔 rappels (pré-avis en pointillés) et Ⓖ événements
          Google. Clique une tâche ou un événement pour l'ouvrir.
          {calendars.length > 1
            ? ` — ${calendars.length} agendas Google suivis : ${calendars.map((item) => item.summary).join(', ')}.`
            : ''}
          {gcalError ? ' — Google Agenda injoignable (voir Réglages).' : ''}
        </p>

        {editing !== null ? (
          <GcalEventModal
            event={editing === 'new' ? null : editing}
            calendars={calendars}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              setGcalVersion((version) => version + 1)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

type ReminderHit = {
  reminder: Reminder
  /** Vrai quand c'est le pré-avis ; `target` porte alors la vraie échéance. */
  lead: boolean
  target: string
}

type ItemsProps = {
  todayDay: string
  cardsByDay: Map<string, Card[]>
  goalsByDay: Map<string, Goal[]>
  /** Identifiants des objectifs atteints : leur puce se barre. */
  reachedGoals: Set<ID>
  remindersByDay: Map<string, ReminderHit[]>
  gcalByDay: Map<string, GcalEvent[]>
  labelsById: Map<ID, Label>
  boardsById: Map<ID, Board>
  onOpenCard: (id: ID) => void
  onOpenEvent: (event: GcalEvent) => void
}

/** Puce d'événement Google : cliquer ouvre la fiche de modification. */
function GcalChip({ event, onOpen }: { event: GcalEvent; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${event.calendarName} — ${event.title}${event.time ? ` à ${event.time}` : ''}`}
      className="truncate rounded border border-accent/50 px-1 py-0.5 text-left text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
      // Couleur de l'agenda d'origine : avec plusieurs agendas, c'est le seul
      // moyen de savoir d'où vient un événement sans le survoler.
      style={
        event.color
          ? {
              borderColor: event.color,
              backgroundColor: `color-mix(in oklab, ${event.color} 16%, transparent)`,
              color: 'var(--text)',
            }
          : undefined
      }
    >
      Ⓖ {event.time ? `${event.time} ` : ''}
      {event.title}
    </button>
  )
}

/**
 * Puce de rappel : couleur de son étiquette, pointillés pour un pré-avis,
 * barrée quand l'occurrence a été validée.
 */
function ReminderChip({ hit, labelsById }: { hit: ReminderHit; labelsById: Map<ID, Label> }) {
  const label = hit.reminder.labelIds.map((id) => labelsById.get(id)).find(Boolean)
  const note = hit.reminder.note ? ` — ${hit.reminder.note}` : ''
  const done = !hit.lead && isValidated(hit.reminder, hit.target)
  const title = hit.lead
    ? `Pré-avis — échéance le ${hit.target} à ${hit.reminder.at}${note}`
    : `${hit.reminder.at}${note}${done ? ' — validé' : ''}`
  return (
    <span
      title={title}
      className={cx(
        'truncate rounded px-1 py-0.5 text-[11px] font-medium',
        hit.lead ? 'border border-dashed opacity-75' : 'border',
        done && 'text-muted line-through opacity-60',
      )}
      style={label ? chipStyle(label.color) : { borderColor: 'var(--border)' }}
    >
      {done ? '✓' : '🔔'} {hit.lead ? '' : `${hit.reminder.at} `}
      {hit.reminder.title}
    </span>
  )
}

function GoalChip({ goal, done }: { goal: Goal; done: boolean }) {
  return (
    <span
      title={`Échéance de l'objectif « ${goal.title || 'sans titre'} »${done ? ' — atteint' : ''}`}
      className={cx(
        'truncate rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[11px] font-medium',
        done && 'text-muted line-through opacity-60',
      )}
    >
      {done ? '✓' : '🎯'} {goal.title || 'Objectif sans titre'}
    </span>
  )
}

function CardChip({
  card,
  day,
  todayDay,
  boardsById,
  onOpen,
}: {
  card: Card
  day: string
  todayDay: string
  boardsById: Map<ID, Board>
  onOpen: () => void
}) {
  const done = card.doneAt !== null
  const overdue = !done && day < todayDay
  return (
    <button
      type="button"
      onClick={onOpen}
      title={card.title}
      className={cx(
        'truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors',
        done && 'bg-ok/10 text-muted line-through',
        overdue && 'bg-danger/10 text-danger',
        !done && !overdue && 'bg-surface-2 hover:bg-accent/15',
      )}
    >
      {boardsById.size > 1 ? (
        <span className="mr-0.5">{boardsById.get(card.boardId)?.emoji}</span>
      ) : null}
      {card.title}
    </button>
  )
}

/* ----------------------------------------------------------- Grille du mois */

function MonthGrid({
  anchor,
  todayDay,
  cardsByDay,
  goalsByDay,
  reachedGoals,
  remindersByDay,
  gcalByDay,
  labelsById,
  boardsById,
  onOpenCard,
  onOpenEvent,
}: ItemsProps & { anchor: Date }) {
  const cells = useMemo(() => {
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
    // Semaine française : lundi en tête (getDay : dimanche = 0).
    const offset = (new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay() + 6) % 7
    const rows = Math.ceil((offset + daysInMonth) / 7)
    return Array.from({ length: rows * 7 }, (_, i) =>
      toDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1 - offset + i)),
    )
  }, [anchor])

  const currentMonth = anchor.getMonth()

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2/60">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1.5 text-center text-xs font-semibold text-muted">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const date = Number(day.slice(8, 10))
          const inMonth = Number(day.slice(5, 7)) - 1 === currentMonth
          const isToday = day === todayDay
          return (
            <div
              key={day}
              className={cx(
                'flex min-h-24 flex-col gap-1 border-t border-r border-line p-1.5 [&:nth-child(-n+7)]:border-t-0 [&:nth-child(7n)]:border-r-0',
                !inMonth && 'bg-surface-2/40',
              )}
            >
              <span
                className={cx(
                  'self-end text-xs tabular-nums',
                  isToday
                    ? 'grid size-5 place-items-center rounded-full bg-accent font-semibold text-accent-ink'
                    : inMonth
                      ? 'text-muted'
                      : 'text-muted/50',
                )}
              >
                {date}
              </span>
              {(gcalByDay.get(day) ?? []).map((event) => (
                <GcalChip key={event.id} event={event} onOpen={() => onOpenEvent(event)} />
              ))}
              {(remindersByDay.get(day) ?? []).map((hit) => (
                <ReminderChip
                  key={`${hit.reminder.id}-${hit.target}-${hit.lead}`}
                  hit={hit}
                  labelsById={labelsById}
                />
              ))}
              {(goalsByDay.get(day) ?? []).map((goal) => (
                <GoalChip key={goal.id} goal={goal} done={reachedGoals.has(goal.id)} />
              ))}
              {(cardsByDay.get(day) ?? []).map((card) => (
                <CardChip
                  key={card.id}
                  card={card}
                  day={day}
                  todayDay={todayDay}
                  boardsById={boardsById}
                  onOpen={() => onOpenCard(card.id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------ Grilles horaires */

/** « HH:MM » en minutes depuis minuit ; null si illisible. */
function minutesOf(time: string | null): number | null {
  if (!time || time.length < 4) return null
  const value = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  return Number.isFinite(value) ? value : null
}

/** Une chose posée à une heure précise, dans la colonne d'un jour. */
type Slot = {
  key: string
  label: string
  title: string
  /** Minutes depuis minuit. */
  start: number
  /** Durée réelle en minutes (l'affichage applique son propre plancher). */
  minutes: number
  tone: 'gcal' | 'reminder' | 'card'
  done: boolean
  overdue: boolean
  /** Couleur d'étiquette de rappel, quand il y en a une. */
  color?: string
  /** Couleur de l'agenda Google d'origine, déjà en hexadécimal. */
  gcalColor?: string | null
  onOpen?: () => void
}

/**
 * Place les créneaux qui se chevauchent côte à côte, comme Google Agenda :
 * chacun prend la première « voie » libre, et la largeur se partage entre les
 * voies utilisées par son groupe de chevauchement.
 */
function withLanes(slots: Slot[]): Array<Slot & { lane: number; lanes: number }> {
  const sorted = [...slots].sort((a, b) => a.start - b.start || a.minutes - b.minutes)
  const out: Array<Slot & { lane: number; lanes: number }> = []
  let group: Array<Slot & { lane: number; lanes: number }> = []
  /** Fin de chaque voie du groupe courant. */
  let ends: number[] = []

  const closeGroup = () => {
    for (const item of group) item.lanes = ends.length
    out.push(...group)
    group = []
    ends = []
  }

  for (const slot of sorted) {
    const span = Math.max(slot.minutes, 20)
    // Plus aucun chevauchement avec le groupe : on le referme.
    if (group.length > 0 && ends.every((end) => end <= slot.start)) closeGroup()
    let lane = ends.findIndex((end) => end <= slot.start)
    if (lane === -1) {
      lane = ends.length
      ends.push(slot.start + span)
    } else {
      ends[lane] = slot.start + span
    }
    group.push({ ...slot, lane, lanes: ends.length })
  }
  closeGroup()
  return out
}

/**
 * Grille horaire sur 24 heures : une colonne en vue Jour, sept en vue Semaine.
 * Ce qui n'a pas d'heure (objectifs, cartes sans heure, événements « journée
 * entière », pré-avis de rappel) vit dans le bandeau du haut — le corps de la
 * grille ne montre que ce qui a vraiment une heure.
 */
function TimeGrid({
  days,
  todayDay,
  cardsByDay,
  goalsByDay,
  reachedGoals,
  remindersByDay,
  gcalByDay,
  labelsById,
  boardsById,
  onOpenCard,
  onOpenEvent,
}: ItemsProps & { days: string[] }) {
  const scroller = useRef<HTMLDivElement>(null)

  // On ouvre sur le matin : minuit en haut d'écran ne sert à rien.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_PX
  }, [days.length])

  /** Pour chaque jour : ce qui a une heure, et ce qui n'en a pas. */
  const columns = useMemo(
    () =>
      days.map((day) => {
        const timed: Slot[] = []
        const allDay: Array<{ key: string; node: 'goal' | 'card' | 'gcal' | 'lead' }> = []

        for (const event of gcalByDay.get(day) ?? []) {
          const start = minutesOf(event.time)
          if (start === null) {
            allDay.push({ key: `g-${event.id}`, node: 'gcal' })
            continue
          }
          const end = minutesOf(event.endTime)
          timed.push({
            key: `g-${event.id}`,
            label: event.time ?? '',
            title: event.title,
            start,
            minutes: end !== null && end > start ? end - start : 60,
            tone: 'gcal',
            done: false,
            overdue: false,
            gcalColor: event.color,
            onOpen: () => onOpenEvent(event),
          })
        }

        for (const hit of remindersByDay.get(day) ?? []) {
          // Un pré-avis n'est pas un rendez-vous : il monte dans le bandeau.
          if (hit.lead) {
            allDay.push({ key: `r-${hit.reminder.id}-lead`, node: 'lead' })
            continue
          }
          const start = minutesOf(hit.reminder.at)
          if (start === null) continue
          const label = hit.reminder.labelIds.map((id) => labelsById.get(id)).find(Boolean)
          timed.push({
            key: `r-${hit.reminder.id}-${hit.target}`,
            label: hit.reminder.at,
            title: hit.reminder.title || 'Rappel',
            start,
            minutes: 30,
            tone: 'reminder',
            done: isValidated(hit.reminder, hit.target),
            overdue: false,
            color: label ? label.color : undefined,
          })
        }

        for (const card of cardsByDay.get(day) ?? []) {
          const start = minutesOf(card.dueTime)
          if (start === null) {
            allDay.push({ key: `c-${card.id}`, node: 'card' })
            continue
          }
          timed.push({
            key: `c-${card.id}`,
            label: card.dueTime ?? '',
            title: card.title,
            start,
            minutes: 30,
            tone: 'card',
            done: card.doneAt !== null,
            overdue: card.doneAt === null && day < todayDay,
            onOpen: () => onOpenCard(card.id),
          })
        }

        for (const goal of goalsByDay.get(day) ?? []) {
          allDay.push({ key: `o-${goal.id}`, node: 'goal' })
        }

        return { day, timed: withLanes(timed), allDay }
      }),
    [
      days,
      cardsByDay,
      goalsByDay,
      remindersByDay,
      gcalByDay,
      labelsById,
      todayDay,
      onOpenCard,
      onOpenEvent,
    ],
  )

  const hasAllDay = columns.some((column) => column.allDay.length > 0)
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {/* En-tête des jours, aligné sur la gouttière des heures. */}
      <div className="flex border-b border-line">
        <div className="w-12 shrink-0 border-r border-line" />
        {columns.map((column) => {
          const date = parseDay(column.day)
          return (
            <div
              key={column.day}
              className={cx(
                'min-w-0 flex-1 border-r border-line px-1 py-1.5 text-center last:border-r-0',
                column.day === todayDay && 'bg-accent/10',
              )}
            >
              <div className="text-[11px] text-muted">{WEEKDAYS[(date.getDay() + 6) % 7]}</div>
              <div
                className={cx(
                  'text-sm font-semibold tabular-nums',
                  column.day === todayDay && 'text-accent',
                )}
              >
                {date.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {hasAllDay ? (
        <div className="flex border-b border-line">
          <div className="grid w-12 shrink-0 place-items-center border-r border-line text-[10px] leading-tight text-muted">
            sans
            <br />
            heure
          </div>
          {columns.map((column) => {
            const dayGoals = goalsByDay.get(column.day) ?? []
            const dayCards = (cardsByDay.get(column.day) ?? []).filter((card) => !card.dueTime)
            const dayEvents = (gcalByDay.get(column.day) ?? []).filter((event) => !event.time)
            const leads = (remindersByDay.get(column.day) ?? []).filter((hit) => hit.lead)
            return (
              <div
                key={column.day}
                className={cx(
                  'flex min-w-0 flex-1 flex-col gap-1 border-r border-line p-1 last:border-r-0',
                  column.day === todayDay && 'bg-accent/5',
                )}
              >
                {dayEvents.map((event) => (
                  <GcalChip key={event.id} event={event} onOpen={() => onOpenEvent(event)} />
                ))}
                {leads.map((hit) => (
                  <ReminderChip
                    key={`${hit.reminder.id}-lead`}
                    hit={hit}
                    labelsById={labelsById}
                  />
                ))}
                {dayGoals.map((goal) => (
                  <GoalChip key={goal.id} goal={goal} done={reachedGoals.has(goal.id)} />
                ))}
                {dayCards.map((card) => (
                  <CardChip
                    key={card.id}
                    card={card}
                    day={column.day}
                    todayDay={todayDay}
                    boardsById={boardsById}
                    onOpen={() => onOpenCard(card.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Corps défilant : 24 heures, quelle que soit la vue. */}
      <div ref={scroller} className="max-h-[62vh] overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_PX }}>
          {/* Gouttière des heures. */}
          <div className="w-12 shrink-0 border-r border-line">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="relative border-b border-line/60"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-1.5 right-1 bg-surface px-0.5 text-[10px] text-muted tabular-nums">
                  {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>

          {columns.map((column) => (
            <div
              key={column.day}
              className={cx(
                'relative min-w-0 flex-1 border-r border-line last:border-r-0',
                column.day === todayDay && 'bg-accent/5',
              )}
            >
              {/* Lignes d'heures, purement décoratives. */}
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  aria-hidden
                  className="border-b border-line/60"
                  style={{ height: HOUR_PX }}
                />
              ))}

              {/* Trait de l'heure courante, sur la colonne du jour seulement. */}
              {column.day === todayDay ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
                  style={{ top: (nowMinutes / 60) * HOUR_PX }}
                />
              ) : null}

              {column.timed.map((slot) => {
                const height = Math.max((Math.max(slot.minutes, 20) / 60) * HOUR_PX, 16)
                const width = 100 / slot.lanes
                const style: CSSProperties = {
                  top: (slot.start / 60) * HOUR_PX,
                  height,
                  left: `calc(${slot.lane * width}% + 2px)`,
                  width: `calc(${width}% - 4px)`,
                }
                if (slot.color) {
                  const chip = chipStyle(slot.color)
                  style.backgroundColor = chip.backgroundColor
                  style.borderColor = chip.borderColor
                  style.color = chip.color
                } else if (slot.gcalColor) {
                  style.borderColor = slot.gcalColor
                  style.backgroundColor = `color-mix(in oklab, ${slot.gcalColor} 18%, transparent)`
                  style.color = 'var(--text)'
                }
                return (
                  <button
                    key={slot.key}
                    type="button"
                    disabled={!slot.onOpen}
                    onClick={slot.onOpen}
                    title={`${slot.label} — ${slot.title}`}
                    className={cx(
                      'absolute flex flex-col items-stretch justify-start overflow-hidden rounded border px-1 py-0.5 text-left text-[10px] leading-tight',
                      slot.onOpen && 'cursor-pointer hover:brightness-95',
                      !slot.color &&
                        !slot.gcalColor &&
                        slot.tone === 'gcal' &&
                        'border-accent/50 bg-accent/15 text-ink',
                      !slot.color &&
                        slot.tone === 'reminder' &&
                        'border-warn/50 bg-warn/15 text-ink',
                      !slot.color &&
                        slot.tone === 'card' &&
                        (slot.overdue
                          ? 'border-danger/50 bg-danger/15 text-danger'
                          : 'border-line bg-surface-2 text-ink'),
                      slot.done && 'text-muted line-through opacity-60',
                    )}
                    style={style}
                  >
                    {/* Bloc court : une seule ligne tronquee, l'heure devant.
                        Bloc long : l'heure au-dessus, le titre en dessous. */}
                    {height >= HOUR_PX * 0.75 ? (
                      <>
                        <span className="block font-semibold tabular-nums">{slot.label}</span>
                        <span className="block overflow-hidden">{slot.title}</span>
                      </>
                    ) : (
                      <span className="block truncate">
                        <span className="font-semibold tabular-nums">{slot.label}</span>{' '}
                        {slot.title}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------- Fiche événement Google */

const DURATIONS = [
  [30, '30 min'],
  [60, '1 h'],
  [90, '1 h 30'],
  [120, '2 h'],
  [180, '3 h'],
  [240, '4 h'],
  [480, '8 h'],
] as const

/** Durée en minutes entre deux « HH:MM » du même jour ; null si incalculable. */
function spanMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const minutes =
    Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) -
    (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)))
  return minutes > 0 ? minutes : null
}

/**
 * Création / modification / suppression d'un événement, écrit DIRECTEMENT dans
 * Google Agenda via le pont serveur. Modèle volontairement simple : titre,
 * jour, heure (ou journée entière), durée.
 */
function GcalEventModal({
  event,
  calendars,
  onClose,
  onSaved,
}: {
  event: GcalEvent | null
  calendars: GcalCalendar[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [day, setDay] = useState(event?.day ?? today())
  const [time, setTime] = useState<string | null>(event ? event.time : '09:00')
  const [duration, setDuration] = useState(() => {
    const span = spanMinutes(event?.time ?? null, event?.endTime ?? null)
    return span && DURATIONS.some(([minutes]) => minutes === span) ? span : 60
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Agenda d'accueil. Un evenement existant garde le sien : Google ne sait pas
   * deplacer un evenement d'un agenda a l'autre par une simple modification.
   */
  const [calendarId, setCalendarId] = useState(
    () => event?.calendarId ?? calendars.find((item) => item.isDefault)?.id ?? '',
  )

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    const draft = {
      title: title.trim() || '(sans titre)',
      day,
      time,
      durationMin: duration,
      calendarId,
    }
    try {
      if (event) await gcalUpdate(event.id, draft)
      else await gcalCreate(draft)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!event || saving) return
    setSaving(true)
    setError(null)
    try {
      await gcalDelete(event.id, event.calendarId)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? 'Événement Google' : 'Nouvel événement Google'}
      footer={
        <>
          {error ? <span className="mr-auto text-xs text-danger">{error}</span> : null}
          {event ? (
            <ConfirmButton confirmLabel="Supprimer de Google ?" onConfirm={() => void remove()}>
              Supprimer
            </ConfirmButton>
          ) : null}
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {calendars.length > 1 ? (
          <Field
            label="Agenda"
            hint={
              event
                ? 'Un evenement ne se deplace pas d’un agenda a l’autre.'
                : undefined
            }
          >
            <Select
              value={calendarId}
              disabled={event !== null}
              onChange={(input) => setCalendarId(input.target.value)}
            >
              {calendars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.summary}
                  {item.isDefault ? ' (par defaut)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Titre">
          <TextInput
            autoFocus
            value={title}
            placeholder="Ex. Rendez-vous banque"
            onChange={(input) => setTitle(input.target.value)}
            onKeyDown={(input) => {
              if (input.key === 'Enter') void save()
            }}
          />
        </Field>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-1 block text-[11px] text-muted">Jour</span>
            <DatePicker
              day={day}
              onSelect={(picked) => setDay(picked)}
              trigger={(toggle) => (
                <Button size="sm" onClick={toggle}>
                  📅 {formatFullDay(day)}
                </Button>
              )}
            />
          </div>

          <label>
            <span className="mb-1 block text-[11px] text-muted">Heure</span>
            <Select
              value={time ?? 'all-day'}
              className="w-36"
              onChange={(input) =>
                setTime(input.target.value === 'all-day' ? null : input.target.value)
              }
            >
              <option value="all-day">Journée entière</option>
              {Array.from({ length: 24 * 2 }, (_, i) => {
                const value = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              })}
            </Select>
          </label>

          {time !== null ? (
            <label>
              <span className="mb-1 block text-[11px] text-muted">Durée</span>
              <Select
                value={duration}
                className="w-28"
                onChange={(input) => setDuration(Number(input.target.value))}
              >
                {DURATIONS.map(([minutes, label]) => (
                  <option key={minutes} value={minutes}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>

        <p className="text-xs text-muted">
          Écrit directement dans ton Google Agenda — visible partout où il est ouvert.
        </p>
      </div>
    </Modal>
  )
}
