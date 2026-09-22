import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import { Button, IconButton, Select, cx } from '../../components/ui'
import { addDays, formatFullDay, parseDay, today } from '../../lib/dates'
import { gcalCreate, gcalDelete, gcalList, gcalUpdate } from '../../lib/gcal'
import type { GcalCalendar, GcalEvent } from '../../lib/gcal'
import { HOUR_PX, hhmm, minutesOf, snap, withLanes } from '../../lib/timegrid'

/**
 * Charge utile d'un glissement « à planifier ». Le type MIME est lisible dès le
 * survol (`dataTransfer.types`), là où le contenu ne l'est qu'au dépôt : c'est
 * lui qui permet au rail de n'accepter que ce qui le concerne.
 */
export const PLAN_MIME = 'application/x-perso-board-plan'

export type PlanPayload = { title: string }

/** Prépare un glissement vers le rail, depuis n'importe quel élément. */
export function setPlanPayload(dataTransfer: DataTransfer, payload: PlanPayload): void {
  dataTransfer.setData(PLAN_MIME, JSON.stringify(payload))
  // `copy` : la source reste où elle est, on en tire un créneau.
  dataTransfer.effectAllowed = 'copyMove'
}

/** Durée d'un créneau tout juste posé. */
const DEFAULT_MIN = 30

type Drag = { id: string; mode: 'move' | 'resize'; start: number; minutes: number }

/**
 * Rail de droite : l'agenda d'un jour, posé à côté du travail.
 *
 * On y dépose une carte ou une tâche de checklist pour lui donner une heure —
 * un événement Google naît à l'endroit lâché. Les blocs se déplacent et
 * s'étirent à la souris, au quart d'heure. C'est le seul endroit de
 * l'application qui écrit dans Google sans passer par une fiche.
 */
export function DayRail({ onClose }: { onClose: () => void }) {
  const [day, setDay] = useState(() => today())
  const [events, setEvents] = useState<GcalEvent[]>([])
  const [calendars, setCalendars] = useState<GcalCalendar[]>([])
  /** Agenda d'accueil des dépôts. */
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Heure survolée pendant un glissement, pour montrer où ça tombera. */
  const [ghost, setGhost] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  /** Clic droit sur un bloc : supprimer, ou reporter a un autre jour. */
  const [menu, setMenu] = useState<{ event: GcalEvent; x: number; y: number } | null>(null)

  const grid = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  /** Dernier état du glissement, lisible depuis les écouteurs globaux. */
  const dragRef = useRef<Drag | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await gcalList(day, day)
      // La fenêtre demandée déborde sur les jours voisins (marges de fuseau) :
      // on ne garde que le jour affiché.
      setEvents(result.events.filter((event) => event.day === day))
      setCalendars(result.calendars)
      setTarget((current) =>
        result.calendars.some((item) => item.id === current)
          ? current
          : (result.calendars.find((item) => item.isDefault)?.id ?? result.calendars[0]?.id ?? ''),
      )
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [day])

  useEffect(() => {
    void reload()
  }, [reload])

  // Le rail occupe la droite : les modales se décalent pour ne pas passer
  // dessous (voir `--rail-space`, lu par la modale).
  useEffect(() => {
    document.documentElement.style.setProperty('--rail-space', '22rem')
    return () => {
      document.documentElement.style.removeProperty('--rail-space')
    }
  }, [])

  // On ouvre sur le matin plutôt qu'à minuit.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX
  }, [])

  /** Minutes depuis minuit correspondant à une position verticale de souris. */
  const minutesAt = (clientY: number): number => {
    const box = grid.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.max(0, Math.min(snap(((clientY - box.top) / HOUR_PX) * 60), 24 * 60 - SNAP_FLOOR))
  }

  const timed = useMemo(
    () =>
      withLanes(
        events
          .map((event) => {
            const start = minutesOf(event.time)
            if (start === null) return null
            const end = minutesOf(event.endTime)
            return {
              event,
              start,
              minutes: end !== null && end > start ? end - start : 60,
            }
          })
          .filter((slot): slot is { event: GcalEvent; start: number; minutes: number } => slot !== null),
      ),
    [events],
  )

  const allDay = events.filter((event) => !event.time)

  /* ------------------------------------------------- déplacer / étirer ---- */

  const startDrag = (
    pointer: ReactPointerEvent<HTMLElement>,
    event: GcalEvent,
    mode: 'move' | 'resize',
  ) => {
    const start = minutesOf(event.time)
    if (start === null) return
    // Bouton principal seulement : un clic droit ouvre le menu, il n'amorce pas
    // un glissement.
    if (pointer.button !== 0) return
    pointer.preventDefault()
    pointer.stopPropagation()
    const end = minutesOf(event.endTime)
    const minutes = end !== null && end > start ? end - start : 60
    const originY = pointer.clientY

    const apply = (next: Drag) => {
      dragRef.current = next
      setDrag(next)
    }
    apply({ id: event.id, mode, start, minutes })

    const onMove = (move: PointerEvent) => {
      const delta = snap(((move.clientY - originY) / HOUR_PX) * 60)
      if (mode === 'move') {
        apply({
          id: event.id,
          mode,
          start: Math.max(0, Math.min(start + delta, 24 * 60 - minutes)),
          minutes,
        })
      } else {
        apply({
          id: event.id,
          mode,
          start,
          minutes: Math.max(SNAP_FLOOR, Math.min(minutes + delta, 24 * 60 - start)),
        })
      }
    }

    const onUp = () => {
      globalThis.removeEventListener('pointermove', onMove)
      globalThis.removeEventListener('pointerup', onUp)
      const final = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!final) return
      // Rien n'a bougé : pas d'écriture inutile vers Google.
      if (final.start === start && final.minutes === minutes) return
      void commit(event, final.start, final.minutes)
    }

    globalThis.addEventListener('pointermove', onMove)
    globalThis.addEventListener('pointerup', onUp)
  }

  const commit = async (event: GcalEvent, start: number, minutes: number) => {
    setBusy(true)
    setError(null)
    try {
      await gcalUpdate(event.id, {
        title: event.title,
        day,
        time: hhmm(start),
        durationMin: minutes,
        calendarId: event.calendarId,
      })
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  /** Supprime le creneau dans Google. */
  const remove = async (event: GcalEvent) => {
    setMenu(null)
    setBusy(true)
    setError(null)
    try {
      await gcalDelete(event.id, event.calendarId)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  /** Reporte le creneau a un autre jour, meme heure et meme duree. */
  const postpone = async (event: GcalEvent, to: string) => {
    setMenu(null)
    const start = minutesOf(event.time)
    if (start === null) return
    const end = minutesOf(event.endTime)
    setBusy(true)
    setError(null)
    try {
      await gcalUpdate(event.id, {
        title: event.title,
        day: to,
        time: event.time!,
        durationMin: end !== null && end > start ? end - start : 60,
        calendarId: event.calendarId,
      })
      // On suit le creneau : sans cela il disparaitrait sans explication.
      setDay(to)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
      return
    }
    setBusy(false)
  }

  /* --------------------------------------------------------- dépôt ------- */

  const onDrop = async (clientY: number, raw: string) => {
    let payload: PlanPayload
    try {
      payload = JSON.parse(raw) as PlanPayload
    } catch {
      return
    }
    const start = minutesAt(clientY)
    setBusy(true)
    setError(null)
    try {
      await gcalCreate({
        title: payload.title.trim() || '(sans titre)',
        day,
        time: hhmm(start),
        durationMin: DEFAULT_MIN,
        calendarId: target,
      })
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const isToday = day === today()
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  return (
    <aside className="fixed top-0 right-0 bottom-0 z-[60] flex w-[21rem] flex-col border-l border-line bg-surface shadow-2xl">
      <header className="flex flex-col gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="mr-auto text-sm font-semibold capitalize">
            {isToday ? "Aujourd'hui" : formatFullDay(day)}
          </span>
          <IconButton label="Jour précédent" onClick={() => setDay(addDays(day, -1))}>
            ‹
          </IconButton>
          <IconButton label="Jour suivant" onClick={() => setDay(addDays(day, 1))}>
            ›
          </IconButton>
          <IconButton label="Fermer l'agenda" onClick={onClose}>
            ✕
          </IconButton>
        </div>

        {calendars.length > 0 ? (
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted">Déposer dans</span>
            <Select
              value={target}
              className="min-w-0 flex-1"
              aria-label="Agenda d'accueil"
              onChange={(event) => setTarget(event.target.value)}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <p className="text-[11px] text-muted">
          Glisse une carte ou une tâche ici pour lui donner une heure. Un bloc se déplace à la
          souris, et s'étire par son bord bas.
        </p>
        {!isToday ? (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setDay(today())}>
            Revenir à aujourd'hui
          </Button>
        ) : null}
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </header>

      {allDay.length > 0 ? (
        <div className="flex flex-col gap-1 border-b border-line px-2 py-1.5">
          {allDay.map((event) => (
            <span
              key={event.id}
              title={`${event.calendarName} — ${event.title}`}
              className="truncate rounded border px-1.5 py-0.5 text-[11px]"
              style={
                event.color
                  ? {
                      borderColor: event.color,
                      backgroundColor: `color-mix(in oklab, ${event.color} 16%, transparent)`,
                    }
                  : undefined
              }
            >
              {event.title}
            </span>
          ))}
        </div>
      ) : null}

      <div ref={scroller} className={cx('min-h-0 flex-1 overflow-y-auto', busy && 'opacity-60')}>
        <div
          ref={grid}
          className="relative"
          style={{ height: 24 * HOUR_PX }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(PLAN_MIME)) return
            // Sans ce preventDefault, le navigateur refuse le dépôt.
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            setGhost(minutesAt(event.clientY))
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setGhost(null)
          }}
          onDrop={(event) => {
            const raw = event.dataTransfer.getData(PLAN_MIME)
            if (!raw) return
            event.preventDefault()
            setGhost(null)
            void onDrop(event.clientY, raw)
          }}
        >
          {/* Lignes d'heures et libellés. */}
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              aria-hidden
              className="absolute inset-x-0 border-t border-line/60"
              style={{ top: hour * HOUR_PX }}
            >
              <span className="absolute -top-2 left-1 bg-surface px-0.5 text-[10px] text-muted tabular-nums">
                {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </span>
            </div>
          ))}

          {isToday ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
              style={{ top: (nowMinutes / 60) * HOUR_PX }}
            />
          ) : null}

          {/* Aperçu du dépôt : on voit l'heure avant de lâcher. */}
          {ghost !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute right-1 left-11 z-20 rounded border-2 border-dashed border-accent bg-accent/10 px-1 text-[10px] font-semibold text-accent"
              style={{ top: (ghost / 60) * HOUR_PX, height: (DEFAULT_MIN / 60) * HOUR_PX }}
            >
              {hhmm(ghost)}
            </div>
          ) : null}

          {timed.map((slot) => {
            const live = drag?.id === slot.event.id ? drag : null
            const start = live ? live.start : slot.start
            const minutes = live ? live.minutes : slot.minutes
            const width = 100 / slot.lanes
            const style: CSSProperties = {
              top: (start / 60) * HOUR_PX,
              height: Math.max((minutes / 60) * HOUR_PX, 16),
              left: `calc(2.75rem + (100% - 3rem) * ${slot.lane / slot.lanes})`,
              width: `calc((100% - 3rem) * ${width / 100} - 2px)`,
            }
            if (slot.event.color) {
              style.borderColor = slot.event.color
              style.backgroundColor = `color-mix(in oklab, ${slot.event.color} 18%, transparent)`
            }
            return (
              <div
                key={slot.event.id}
                title={`${slot.event.calendarName} — ${slot.event.title}`}
                onPointerDown={(pointer) => startDrag(pointer, slot.event, 'move')}
                onContextMenu={(pointer) => {
                  pointer.preventDefault()
                  setMenu({ event: slot.event, x: pointer.clientX, y: pointer.clientY })
                }}
                className={cx(
                  'absolute flex cursor-grab flex-col justify-start overflow-hidden rounded border px-1 py-0.5 text-left text-[10px] leading-tight select-none',
                  !slot.event.color && 'border-accent/50 bg-accent/15',
                  live && 'z-30 cursor-grabbing shadow-lg ring-2 ring-accent',
                )}
                style={style}
              >
                {/* Un quart d'heure ne tient pas sur deux lignes : l'heure et le
                    titre s'alignent alors sur la meme, cale sur le trait. */}
                {style.height !== undefined && Number(style.height) >= 34 ? (
                  <>
                    <span className="font-semibold tabular-nums">
                      {hhmm(start)}
                      {live ? ` – ${hhmm(start + minutes)}` : ''}
                    </span>
                    <span className="overflow-hidden">{slot.event.title}</span>
                  </>
                ) : (
                  <span className="truncate">
                    <span className="font-semibold tabular-nums">
                      {hhmm(start)}
                      {live ? ` – ${hhmm(start + minutes)}` : ''}
                    </span>{' '}
                    {slot.event.title}
                  </span>
                )}
                {/* Poignée d'étirement : toute la largeur du bord bas. */}
                <span
                  aria-hidden
                  onPointerDown={(pointer) => startDrag(pointer, slot.event, 'resize')}
                  className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                />
              </div>
            )
          })}
        </div>
      </div>

      {menu ? (
        <BlockMenu
          event={menu.event}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={() => void remove(menu.event)}
          onPostpone={(to) => void postpone(menu.event, to)}
        />
      ) : null}
    </aside>
  )
}

/** Durée plancher d'un créneau étiré : un quart d'heure. */
const SNAP_FLOOR = 15

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

/**
 * Menu du clic droit sur un créneau : le supprimer, ou le reporter.
 *
 * Reporter ouvre une semaine à même le menu — choisir un jour dans une liste
 * déroulante obligerait à compter les dates de tête, là où une semaine se lit
 * d'un coup d'œil. La hauteur du menu change donc du simple au double : sa
 * position est mesurée après rendu, jamais supposée.
 */
function BlockMenu({
  event,
  x,
  y,
  onClose,
  onDelete,
  onPostpone,
}: {
  event: GcalEvent
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
  onPostpone: (day: string) => void
}) {
  const [postponing, setPostponing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** Semaine montrée, en nombre de semaines depuis celle du créneau. */
  const [weekOffset, setWeekOffset] = useState(0)

  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties>({ left: x, top: y, visibility: 'hidden' })

  useLayoutEffect(() => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    setPlace({
      left: Math.max(8, Math.min(x, globalThis.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, globalThis.innerHeight - rect.height - 8)),
    })
  }, [x, y, postponing])

  useEffect(() => {
    const onKey = (key: KeyboardEvent) => {
      if (key.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Semaine à la française : on remonte au lundi.
  const weekday = parseDay(event.day).getDay()
  const monday = addDays(event.day, (weekday === 0 ? -6 : 1 - weekday) + weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index))

  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        onMouseDown={onClose}
        onContextMenu={(pointer) => {
          pointer.preventDefault()
          onClose()
        }}
      />
      <div
        ref={box}
        className="fixed z-[71] flex w-60 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl"
        style={place}
      >
        <span className="truncate px-1 pb-1 text-[11px] text-muted">{event.title}</span>

        {postponing ? (
          <>
            <div className="flex items-center gap-1 px-1">
              <IconButton label="Semaine précédente" onClick={() => setWeekOffset(weekOffset - 1)}>
                ‹
              </IconButton>
              <span className="flex-1 text-center text-[11px] text-muted">
                {weekOffset === 0 ? 'Cette semaine' : `${formatFullDay(monday)}`}
              </span>
              <IconButton label="Semaine suivante" onClick={() => setWeekOffset(weekOffset + 1)}>
                ›
              </IconButton>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((candidate) => {
                const date = parseDay(candidate)
                const current = candidate === event.day
                return (
                  <button
                    key={candidate}
                    type="button"
                    title={formatFullDay(candidate)}
                    disabled={current}
                    onClick={() => onPostpone(candidate)}
                    className={cx(
                      'flex flex-col items-center rounded-md py-1 text-[10px] transition-colors',
                      current
                        ? 'bg-accent/15 text-accent'
                        : 'text-muted hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <span>{WEEKDAYS[(date.getDay() + 6) % 7]}</span>
                    <span className="text-xs font-semibold tabular-nums">{date.getDate()}</span>
                  </button>
                )
              })}
            </div>
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => setPostponing(false)}>
              ‹ Retour
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => setPostponing(true)}
            >
              ↷ Reporter…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cx('justify-start', confirmDelete && 'text-danger')}
              onClick={() => {
                if (confirmDelete) onDelete()
                else setConfirmDelete(true)
              }}
            >
              🗑 {confirmDelete ? 'Supprimer de Google ?' : 'Supprimer'}
            </Button>
          </>
        )}
      </div>
    </>
  )
}
