import { useEffect, useMemo, useRef, useState } from 'react'

import { Button, Pill, cx } from '../../components/ui'
import { addDays, toDay, today } from '../../lib/dates'
import { chipStyle } from '../../lib/palette'
import { isValidated, occurrencesBetween } from '../../lib/reminders'
import { useStore } from '../../lib/state'
import type { Board, Card, Goal, ID, Label, Reminder } from '../../lib/types'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const agendaDayFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

type Mode = 'month' | 'agenda'

const MODE_KEY = 'perso-board:calendar-mode'

/**
 * Vue des échéances : cartes datées + deadlines des objectifs actifs.
 * Deux présentations — la grille du mois, et l'agenda vertical continu qui se
 * parcourt en scrollant (seuls les jours occupés y figurent, aujourd'hui sert
 * de point d'ancrage).
 */
export function CalendarView({ onOpenCard }: { onOpenCard: (id: ID) => void }) {
  const store = useStore()
  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem(MODE_KEY) === 'agenda' ? 'agenda' : 'month',
  )
  const [anchor, setAnchor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold capitalize">
            {mode === 'month' ? monthFormatter.format(anchor) : 'Agenda'}
          </h2>

          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['month', 'Mois'],
                ['agenda', 'Agenda'],
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

          {mode === 'month' ? (
            <>
              <Button
                size="sm"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
                aria-label="Mois précédent"
              >
                ‹
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const now = new Date()
                  setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))
                }}
              >
                Aujourd'hui
              </Button>
              <Button
                size="sm"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
                aria-label="Mois suivant"
              >
                ›
              </Button>
            </>
          ) : null}
        </div>

        {mode === 'month' ? (
          <MonthGrid
            anchor={anchor}
            todayDay={todayDay}
            cardsByDay={cardsByDay}
            goalsByDay={goalsByDay}
            remindersByDay={remindersByDay}
            labelsById={labelsById}
            boardsById={boardsById}
            onOpenCard={onOpenCard}
          />
        ) : (
          <AgendaList
            todayDay={todayDay}
            cardsByDay={cardsByDay}
            goalsByDay={goalsByDay}
            remindersByDay={remindersByDay}
            labelsById={labelsById}
            boardsById={boardsById}
            onOpenCard={onOpenCard}
          />
        )}

        <p className="text-xs text-muted">
          Tâches datées, échéances d'objectifs et 🔔 rappels (pré-avis en pointillés). Clique une
          tâche pour l'ouvrir.
        </p>
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
  remindersByDay: Map<string, ReminderHit[]>
  labelsById: Map<ID, Label>
  boardsById: Map<ID, Board>
  onOpenCard: (id: ID) => void
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

function GoalChip({ goal }: { goal: Goal }) {
  return (
    <span
      title={`Échéance de l'objectif « ${goal.title || 'sans titre'} »`}
      className="truncate rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[11px] font-medium"
    >
      🎯 {goal.title || 'Objectif sans titre'}
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
  remindersByDay,
  labelsById,
  boardsById,
  onOpenCard,
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
              {(remindersByDay.get(day) ?? []).map((hit) => (
                <ReminderChip
                  key={`${hit.reminder.id}-${hit.target}-${hit.lead}`}
                  hit={hit}
                  labelsById={labelsById}
                />
              ))}
              {(goalsByDay.get(day) ?? []).map((goal) => (
                <GoalChip key={goal.id} goal={goal} />
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

/* --------------------------------------------------------- Agenda vertical */

function AgendaList({
  todayDay,
  cardsByDay,
  goalsByDay,
  remindersByDay,
  labelsById,
  boardsById,
  onOpenCard,
}: ItemsProps) {
  const todayRef = useRef<HTMLDivElement>(null)

  // Seuls les jours occupés figurent dans l'agenda ; aujourd'hui y est
  // toujours, occupé ou non — c'est le point d'ancrage du scroll.
  //
  // Fenêtre bornée : un rappel bihebdomadaire produit des centaines
  // d'occurrences sur la plage calculée, ce qui rendrait l'agenda interminable.
  // Un mois en arrière et quatre mois devant couvrent l'usage réel.
  const days = useMemo(() => {
    const from = addDays(todayDay, -30)
    const to = addDays(todayDay, 120)
    const set = new Set(
      [...cardsByDay.keys(), ...goalsByDay.keys(), ...remindersByDay.keys()].filter(
        (day) => day >= from && day <= to,
      ),
    )
    set.add(todayDay)
    return [...set].sort()
  }, [cardsByDay, goalsByDay, remindersByDay, todayDay])

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  let previousMonth = ''

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface px-3 py-2">
      {days.map((day) => {
        const isToday = day === todayDay
        const month = day.slice(0, 7)
        const showMonth = month !== previousMonth
        previousMonth = month
        const dayGoals = goalsByDay.get(day) ?? []
        const dayCards = cardsByDay.get(day) ?? []
        const dayReminders = remindersByDay.get(day) ?? []
        return (
          <div key={day} ref={isToday ? todayRef : undefined}>
            {showMonth ? (
              <div className="mt-3 mb-1 text-xs font-semibold tracking-wide text-muted uppercase first:mt-1">
                {monthFormatter.format(new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1))}
              </div>
            ) : null}
            <div className="flex gap-3">
              <div
                className={cx(
                  'w-24 shrink-0 pt-1 text-right text-xs',
                  isToday ? 'font-semibold text-accent' : 'text-muted',
                )}
              >
                {agendaDayFormatter.format(
                  new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))),
                )}
                {isToday ? (
                  <Pill tone="accent" className="mt-1 ml-auto block w-fit">
                    aujourd'hui
                  </Pill>
                ) : null}
              </div>
              <div
                className={cx(
                  'flex min-w-0 flex-1 flex-col gap-1 border-l-2 pb-4 pl-3',
                  isToday ? 'border-accent' : 'border-line',
                )}
              >
                {dayReminders.map((hit) => (
                  <ReminderChip
                    key={`${hit.reminder.id}-${hit.target}-${hit.lead}`}
                    hit={hit}
                    labelsById={labelsById}
                  />
                ))}
                {dayGoals.map((goal) => (
                  <GoalChip key={goal.id} goal={goal} />
                ))}
                {dayCards.map((card) => (
                  <CardChip
                    key={card.id}
                    card={card}
                    day={day}
                    todayDay={todayDay}
                    boardsById={boardsById}
                    onOpen={() => onOpenCard(card.id)}
                  />
                ))}
                {dayGoals.length === 0 && dayCards.length === 0 && dayReminders.length === 0 ? (
                  <span className="pt-1 text-xs text-muted">Rien de prévu.</span>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
