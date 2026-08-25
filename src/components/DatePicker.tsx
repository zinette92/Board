import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { addDays, parseDay, toDay, today } from '../lib/dates'
import { Button, IconButton, cx } from './ui'

/**
 * Échap ferme le popover — et lui seul. En capture avec arrêt immédiat, pour
 * passer AVANT l'écouteur de la modale hôte, qui fermerait toute la fiche.
 */
function useEscapeFirst(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onEscape()
    }
    document.addEventListener('keydown', handler, { capture: true })
    return () => document.removeEventListener('keydown', handler, { capture: true })
  }, [active, onEscape])
}

const WEEKDAYS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di']

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * Un segment du sélecteur d'heure : valeur éditable au clavier, chevrons
 * discrets au survol, molette de souris, flèches ↑/↓. Les incréments passent
 * par `onBump` — le parent lit sa vérité synchrone, aucune fermeture périmée.
 */
function NumberSpin({
  label,
  value,
  step,
  onBump,
  onSet,
}: {
  label: string
  value: number | null
  step: number
  onBump: (delta: number) => void
  onSet: (next: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const zone = useRef<HTMLDivElement>(null)
  const shown = draft ?? (value === null ? '' : pad2(value))

  const commitDraft = () => {
    if (draft === null) return
    const parsed = Number(draft)
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(parsed)) onSet(Math.trunc(parsed))
  }

  // Molette : écouteur natif non passif — React déclare `onWheel` passif, ce
  // qui interdirait le preventDefault (la modale défilerait derrière).
  useEffect(() => {
    const el = zone.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      onBump(event.deltaY < 0 ? step : -step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  return (
    <div ref={zone} className="group flex items-center">
      <input
        aria-label={label}
        inputMode="numeric"
        placeholder="––"
        value={shown}
        className="w-8 border-0 bg-transparent text-center text-base font-semibold text-ink tabular-nums placeholder:text-muted/40 focus:outline-none"
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitDraft()
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onBump(step)
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onBump(-step)
          }
        }}
      />
      <span className="flex flex-col opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} +`}
          className="grid h-3.5 w-4 place-items-center text-[8px] leading-none text-muted hover:text-accent"
          onClick={() => onBump(step)}
        >
          ▲
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} -`}
          className="grid h-3.5 w-4 place-items-center text-[8px] leading-none text-muted hover:text-accent"
          onClick={() => onBump(-step)}
        >
          ▼
        </button>
      </span>
    </div>
  )
}

/** L'heure en deux roues — Heure et Minutes — avec « Sans heure » pour effacer. */
function TimeFields({
  time,
  onChange,
}: {
  time: string | null
  onChange: (next: string | null) => void
}) {
  /**
   * Vérité locale pendant la vie du popover : les clics rapides sur ▲/▼
   * s'enchaînent sans attendre l'aller-retour IndexedDB du parent — sinon un
   * martèlement de flèche relit une valeur en retard et perd des pas.
   */
  const localRef = useRef<string | null>(time)
  const [, rerender] = useState(0)
  const commit = (next: string | null) => {
    localRef.current = next
    rerender((tick) => tick + 1)
    onChange(next)
  }

  /** Lecture synchrone de la vérité locale — jamais d'une fermeture de rendu. */
  const read = () => {
    const raw = localRef.current
    if (!raw) return { hour: null as number | null, minute: null as number | null }
    const [h, m] = raw.split(':')
    return { hour: Number(h), minute: Number(m) }
  }
  const wrapMod = (value: number, mod: number) => ((value % mod) + mod) % mod

  // Première interaction sans heure posée : on part de l'heure courante.
  const bumpHour = (delta: number) => {
    const { hour, minute } = read()
    commit(`${pad2(wrapMod((hour ?? new Date().getHours()) + delta, 24))}:${pad2(minute ?? 0)}`)
  }
  const setHour = (next: number) => {
    const { minute } = read()
    commit(`${pad2(wrapMod(next, 24))}:${pad2(minute ?? 0)}`)
  }
  const bumpMinute = (delta: number) => {
    const { hour, minute } = read()
    commit(`${pad2(hour ?? new Date().getHours())}:${pad2(wrapMod((minute ?? 0) + delta, 60))}`)
  }
  const setMinute = (next: number) => {
    const { hour } = read()
    commit(`${pad2(hour ?? new Date().getHours())}:${pad2(wrapMod(next, 60))}`)
  }

  const { hour, minute } = read()

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="mr-auto text-xs text-muted">Heure</span>
      <div className="inline-flex items-center rounded-lg border border-line bg-surface py-0.5 pr-0.5 pl-1 shadow-sm focus-within:border-accent">
        <NumberSpin label="Heure" value={hour} step={1} onBump={bumpHour} onSet={setHour} />
        <span aria-hidden className="px-0.5 pb-0.5 font-semibold text-muted">
          :
        </span>
        <NumberSpin label="Minutes" value={minute} step={5} onBump={bumpMinute} onSet={setMinute} />
      </div>
      {localRef.current ? (
        <IconButton label="Sans heure" onClick={() => commit(null)}>
          ✕
        </IconButton>
      ) : null}
    </div>
  )
}

/**
 * Sélecteur de date à la française (semaine au lundi, libellés fr), en popover
 * ancré sur un déclencheur fourni par l'appelant — avec champ heure en option.
 * La sélection s'applique immédiatement ; sans heure, choisir un jour referme.
 */
export function DatePicker({
  day,
  time = null,
  withTime = false,
  onSelect,
  onClear,
  defaultOpen = false,
  trigger,
}: {
  day: string | null
  time?: string | null
  withTime?: boolean
  /** Reçoit le jour choisi et l'heure (inchangée si le jour seul bouge). */
  onSelect: (day: string, time: string | null) => void
  onClear?: () => void
  defaultOpen?: boolean
  /** Le déclencheur du popover — reçoit la fonction d'ouverture/fermeture. */
  trigger: (toggle: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [anchor, setAnchor] = useState(() => {
    const base = parseDay(day ?? today())
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const openPanel = () => {
    // Rouvrir sur le mois de la valeur courante, pas sur le dernier feuilleté.
    const base = parseDay(day ?? today())
    setAnchor(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const toggle = () => (open ? close() : openPanel())
  useEscapeFirst(open, close)

  /**
   * Panneau en `position: fixed`, placé après mesure : sous le déclencheur si
   * la place suffit, au-dessus sinon, et toujours ramené dans l'écran — un
   * popover ne doit jamais demander de scroller pour être vu, ni être rogné
   * par le conteneur défilant d'une modale.
   */
  const triggerZone = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const anchorRect = triggerZone.current?.getBoundingClientRect()
    const panelRect = panel.current?.getBoundingClientRect()
    if (!anchorRect || !panelRect) return
    const margin = 8
    let top = anchorRect.bottom + 6
    if (top + panelRect.height > window.innerHeight - margin) {
      top = anchorRect.top - panelRect.height - 6
    }
    top = Math.min(Math.max(margin, top), window.innerHeight - panelRect.height - margin)
    let left = anchorRect.left
    left = Math.min(Math.max(margin, left), window.innerWidth - panelRect.width - margin)
    setPos({ top, left })
    // `day`/`time` changent bien la hauteur (apparition du bouton « Sans heure »).
    // `anchor` NON : la grille fait 6 rangées en toutes saisons. L'exclure des
    // dépendances garantit qu'aucun changement de mois ne déplace le panneau.
  }, [open, day, time, withTime])

  const offset = (new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay() + 6) % 7
  // TOUJOURS 6 rangées, même quand le mois en occupe 5. Une grille à hauteur
  // variable ferait changer la hauteur du panneau d'un mois à l'autre : le
  // placement se recalculerait, les flèches ‹ › glisseraient sous le curseur et
  // l'on ne pourrait plus enchaîner les clics. Les cases en trop débordent sur
  // le mois suivant et sont grisées, comme celles du mois précédent.
  const cells = Array.from({ length: 6 * 7 }, (_, i) =>
    toDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1 - offset + i)),
  )

  const currentMonth = anchor.getMonth()
  const todayDay = today()

  const pick = (picked: string) => {
    onSelect(picked, time ?? null)
    if (!withTime) close()
  }

  return (
    <div ref={triggerZone} className="relative inline-block">
      {trigger(toggle)}
      {open ? (
        <>
          {/* Voile transparent : un clic hors du calendrier le referme. */}
          <div className="fixed inset-0 z-10" onMouseDown={close} />
          <div
            ref={panel}
            className="fixed z-20 w-64 rounded-xl border border-line bg-surface p-2.5 shadow-xl"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          >
            <div className="mb-1.5 flex items-center gap-1">
              <span className="flex-1 pl-1 text-sm font-semibold capitalize">
                {monthFormatter.format(anchor)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Mois précédent"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
              >
                ‹
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Mois suivant"
                onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
              >
                ›
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  className="py-0.5 text-center text-[10px] font-semibold text-muted uppercase"
                >
                  {weekday}
                </span>
              ))}
              {cells.map((cell) => {
                const inMonth = Number(cell.slice(5, 7)) - 1 === currentMonth
                const isToday = cell === todayDay
                const selected = cell === day
                return (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => pick(cell)}
                    className={cx(
                      'grid size-8 place-items-center rounded-md text-xs tabular-nums transition-colors',
                      selected
                        ? 'bg-accent font-semibold text-accent-ink'
                        : cx(
                            'hover:bg-surface-2',
                            inMonth ? 'text-ink' : 'text-muted/50',
                            isToday && 'font-bold text-accent',
                          ),
                    )}
                  >
                    {Number(cell.slice(8, 10))}
                  </button>
                )
              })}
            </div>

            {withTime ? (
              <div className="mt-2 border-t border-line pt-2">
                <TimeFields
                  time={time ?? null}
                  onChange={(next) => onSelect(day ?? todayDay, next)}
                />
              </div>
            ) : null}

            <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
              <Button size="sm" variant="ghost" onClick={() => pick(todayDay)}>
                Aujourd'hui
              </Button>
              <Button size="sm" variant="ghost" onClick={() => pick(addDays(todayDay, 1))}>
                Demain
              </Button>
              {day && onClear ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger"
                  onClick={() => {
                    onClear()
                    close()
                  }}
                >
                  Retirer
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={close}>
                  OK
                </Button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
