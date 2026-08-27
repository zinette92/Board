import { useEffect, useMemo, useState } from 'react'

import { DatePicker } from '../../components/DatePicker'
import {
  Button,
  ConfirmButton,
  Field,
  IconButton,
  Modal,
  Pill,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../../components/ui'
import { addDays, endOfMonth, formatFullDay, today } from '../../lib/dates'
import { notify, permissionState, requestPermission } from '../../lib/notify'
import type { NotifyPermission } from '../../lib/notify'
import { chipStyle } from '../../lib/palette'
import {
  WEEKDAYS,
  describeRepeat,
  formatWhen,
  isFinished,
  leadNoticesOn,
  nextOccurrence,
  occurrencesBetween,
  pendingOccurrences,
} from '../../lib/reminders'
import { useStore } from '../../lib/state'
import { RECURRENCE_UNITS } from '../../lib/types'
import type { LeadNotice, Pending } from '../../lib/reminders'
import type { ID, RecurrenceUnit, Reminder, Repeat } from '../../lib/types'

const UNIT_LABELS: Record<RecurrenceUnit, string> = {
  day: 'jour(s)',
  week: 'semaine(s)',
  month: 'mois',
  year: 'an(s)',
}

/** Les cinq formes proposées, dans l'ordre du plus simple au plus précis. */
type RepeatMode = 'once' | 'daily' | 'weekly' | 'weekdays' | 'interval'

const MODE_LABELS: Record<RepeatMode, string> = {
  once: 'Une seule fois',
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines',
  weekdays: 'Certains jours de la semaine',
  interval: 'Tous les X…',
}

function modeOf(repeat: Repeat | null): RepeatMode {
  if (repeat === null) return 'once'
  if (repeat.kind === 'weekdays') return 'weekdays'
  if (repeat.interval === 1 && repeat.unit === 'day') return 'daily'
  if (repeat.interval === 1 && repeat.unit === 'week') return 'weekly'
  return 'interval'
}

function repeatFor(mode: RepeatMode, previous: Repeat | null): Repeat | null {
  switch (mode) {
    case 'once':
      return null
    case 'daily':
      return { kind: 'interval', interval: 1, unit: 'day' }
    case 'weekly':
      return { kind: 'interval', interval: 1, unit: 'week' }
    case 'weekdays':
      return { kind: 'weekdays', days: previous?.kind === 'weekdays' ? previous.days : [1] }
    case 'interval':
      return {
        kind: 'interval',
        interval: previous?.kind === 'interval' ? Math.max(2, previous.interval) : 2,
        unit: previous?.kind === 'interval' ? previous.unit : 'month',
      }
  }
}

/**
 * Rappels : des échéances qui ne vivent que dans le calendrier. Chaque rappel
 * s'édite dans sa propre carte dépliable — titre, note, rythme, jour et heure,
 * étiquette, pré-avis.
 */
/** `true` si le rappel porte une référence d'étiquette qui ne pointe plus vers rien. */
function hasOrphanLabel(reminder: Reminder, labelIds: Set<ID>): boolean {
  return reminder.labelIds.some((id) => !labelIds.has(id))
}

type ReminderScope = 'month' | 'all'
type LabelFilter = 'all' | 'other' | ID

export function RemindersView({ hasWallpaper }: { hasWallpaper: boolean }) {
  const store = useStore()
  const [draft, setDraft] = useState('')
  const [openId, setOpenId] = useState<ID | null>(null)
  const [scope, setScope] = useState<ReminderScope>('month')
  const [labelFilter, setLabelFilter] = useState<LabelFilter>('all')

  const day = today()
  const pending = useMemo(() => pendingOccurrences(store.reminders, day), [store.reminders, day])
  const notices = useMemo(() => leadNoticesOn(store.reminders, day), [store.reminders, day])

  const sorted = useMemo(() => {
    const rank = (reminder: Reminder) => nextOccurrence(reminder, day) ?? '9999-12-31'
    return [...store.reminders].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return rank(a).localeCompare(rank(b))
    })
  }, [store.reminders, day])

  /** Rappels ayant au moins une occurrence entre le 1er et le dernier jour du mois courant. */
  const monthReminders = useMemo(() => {
    const from = day.slice(0, 7) + '-01'
    const to = endOfMonth(day)
    return sorted.filter((reminder) => occurrencesBetween(reminder, from, to).length > 0)
  }, [sorted, day])

  const labelIds = useMemo(() => new Set(store.labels.map((label) => label.id)), [store.labels])
  const anyOrphan = useMemo(
    () => store.reminders.some((reminder) => hasOrphanLabel(reminder, labelIds)),
    [store.reminders, labelIds],
  )

  /** Le filtre par étiquette ne s'applique que dans « Tous les rappels ». */
  const filtered = useMemo(() => {
    if (scope === 'month') return monthReminders
    if (labelFilter === 'all') return sorted
    if (labelFilter === 'other') return sorted.filter((reminder) => hasOrphanLabel(reminder, labelIds))
    return sorted.filter((reminder) => reminder.labelIds.includes(labelFilter))
  }, [scope, sorted, monthReminders, labelFilter, labelIds])

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    const created = await store.createReminder(title)
    setDraft('')
    if (created) setOpenId(created.id)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6">
      <div
        className={cx(
          'mx-auto flex max-w-3xl flex-col gap-3',
          // Panneau OPAQUE aux couleurs du thème — même rendu qu'en plein écran,
          // posé sur la photo. Le verre sombre a été essayé et refusé.
          hasWallpaper && 'rounded-2xl border border-line bg-bg p-4 shadow-lg',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Rappels</h2>

          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['month', 'Ce mois-ci'],
                ['all', 'Tous les rappels'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={cx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  scope === value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <NotificationSwitch />
        </div>

        <PendingPanel pending={pending} notices={notices} />

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <TextInput
            value={draft}
            placeholder="Nouveau rappel — ex. Déclaration d'impôts"
            className="min-w-48 flex-1"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            Ajouter
          </Button>
        </form>

        {scope === 'all' && store.labels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLabelFilter('all')}
              className={cx(
                'rounded border px-2 py-0.5 text-xs font-medium transition-opacity',
                labelFilter === 'all'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-muted hover:text-ink',
              )}
            >
              Toutes
            </button>
            {store.labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => setLabelFilter(label.id)}
                className={cx(
                  'rounded border px-2 py-0.5 text-xs font-medium transition-opacity',
                  labelFilter === label.id ? 'ring-1 ring-accent' : 'opacity-70 hover:opacity-100',
                )}
                style={chipStyle(label.color)}
              >
                {label.name}
              </button>
            ))}
            {anyOrphan ? (
              <button
                type="button"
                title="Rappels dont l'étiquette d'origine a été supprimée"
                onClick={() => setLabelFilter('other')}
                className={cx(
                  'rounded border border-dashed px-2 py-0.5 text-xs font-medium text-muted transition-opacity',
                  labelFilter === 'other' ? 'border-accent text-accent' : 'hover:text-ink',
                )}
              >
                Autre
              </button>
            ) : null}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {scope === 'month'
              ? 'Aucun rappel ce mois-ci.'
              : labelFilter === 'all'
                ? "Aucun rappel. Ils n'apparaissent pas sur le tableau — seulement dans le calendrier."
                : 'Aucun rappel avec cette étiquette.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {filtered.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                open={openId === reminder.id}
                onToggle={() => setOpenId(openId === reminder.id ? null : reminder.id)}
              />
            ))}
          </ul>
        )}

        <p className="text-xs text-muted">
          Les rappels vivent uniquement dans le <strong className="text-ink">calendrier</strong> :
          ils ne créent aucune carte et n'apparaissent pas sur le tableau.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- À valider */

/**
 * Chaque échéance arrivée à terme attend sa propre validation. Une occurrence
 * oubliée reste dans la liste pendant que les suivantes s'y ajoutent — d'où
 * une ligne par occurrence, et non une ligne par rappel.
 */
function PendingPanel({
  pending,
  notices,
}: {
  pending: Pending[]
  notices: LeadNotice[]
}) {
  const store = useStore()
  const day = today()
  if (pending.length === 0 && notices.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 ? (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">
              À valider
            </span>
            <Pill tone="warn">{pending.length}</Pill>
            {pending.length > 3 ? (
              <ConfirmButton
                className="ml-auto"
                confirmLabel={`Valider les ${pending.length} ?`}
                onConfirm={() => {
                  for (const item of pending) {
                    void store.setReminderDone(item.reminder.id, item.on, true)
                  }
                }}
              >
                Tout valider
              </ConfirmButton>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1.5">
            {pending.map((item) => {
              const late = item.on < day
              return (
                <li
                  key={`${item.reminder.id}-${item.on}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Pill tone={late ? 'danger' : 'warn'}>
                    {late ? 'en retard' : "aujourd'hui"}
                  </Pill>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.reminder.title}
                  </span>
                  {item.reminder.note ? (
                    <span className="hidden max-w-48 truncate text-xs text-muted sm:block">
                      {item.reminder.note}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted">
                    {formatWhen(item.on, item.reminder.at)}
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => store.setReminderDone(item.reminder.id, item.on, true)}
                  >
                    ✓ Valider
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
          <span className="mb-2 block text-xs font-semibold tracking-wide text-muted uppercase">
            Pré-avis
          </span>
          <ul className="flex flex-col gap-1.5">
            {notices.map((notice) => (
              <li
                key={`${notice.reminder.id}-${notice.on}`}
                className="flex flex-wrap items-center gap-2"
              >
                <Pill tone="accent">dans {notice.reminder.leadDays} j</Pill>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {notice.reminder.title}
                </span>
                <span className="text-xs text-muted">
                  échéance {formatWhen(notice.on, notice.reminder.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ Notifications */

function NotificationSwitch() {
  const [state, setState] = useState<NotifyPermission>(permissionState)

  if (state === 'unsupported') return null
  if (state === 'granted') {
    return (
      <Pill tone="ok" title="Uniquement lorsque l'application est ouverte">
        🔔 notifications actives
      </Pill>
    )
  }
  if (state === 'denied') {
    return (
      <Pill tone="muted" title="À réautoriser dans les réglages du navigateur">
        🔕 notifications bloquées
      </Pill>
    )
  }
  return (
    <Button
      size="sm"
      onClick={async () => setState(await requestPermission())}
      title="Les notifications système n'apparaissent que si l'application est ouverte"
    >
      🔔 Activer les notifications
    </Button>
  )
}

/**
 * Émet les notifications système du jour, une seule fois par rappel et par
 * jour. Branché sur l'application entière pour être actif quel que soit
 * l'onglet affiché.
 */
export function useReminderNotifications() {
  const store = useStore()
  const { reminders, ready, updateReminder } = store

  useEffect(() => {
    if (!ready || permissionState() !== 'granted') return
    const day = today()
    const seen = new Set<string>()
    // Une seule bulle par rappel et par jour, échéance du jour d'abord.
    for (const item of pendingOccurrences(reminders, day)) {
      if (item.reminder.notifiedOn === day || seen.has(item.reminder.id)) continue
      const note = item.reminder.note ? ` — ${item.reminder.note}` : ''
      const body = `${formatWhen(item.on, item.reminder.at)} — à valider${note}`
      if (notify(item.reminder.title, body, `${item.reminder.id}-${day}`)) {
        seen.add(item.reminder.id)
        void updateReminder(item.reminder.id, { notifiedOn: day })
      }
    }
    for (const notice of leadNoticesOn(reminders, day)) {
      if (notice.reminder.notifiedOn === day || seen.has(notice.reminder.id)) continue
      const body = `Dans ${notice.reminder.leadDays} jour(s) — ${formatWhen(notice.on, notice.reminder.at)}`
      if (notify(notice.reminder.title, body, `${notice.reminder.id}-${day}-lead`)) {
        seen.add(notice.reminder.id)
        void updateReminder(notice.reminder.id, { notifiedOn: day })
      }
    }
  }, [ready, reminders, updateReminder])
}

/* ----------------------------------------------------------- Carte de rappel */

function ReminderCard({
  reminder,
  open,
  onToggle,
}: {
  reminder: Reminder
  open: boolean
  onToggle: () => void
}) {
  const store = useStore()
  const next = nextOccurrence(reminder, today())
  const finished = isFinished(reminder)
  const waiting = pendingOccurrences([reminder], today()).length
  const mode = modeOf(reminder.repeat)
  const labels = store.labels.filter((label) => reminder.labelIds.includes(label.id))
  // Étiquette supprimée depuis : la référence reste sur le rappel (décision
  // volontaire, voir hasOrphanLabel) mais ne résout plus vers rien — elle
  // s'affiche donc comme « Autre » plutôt que de disparaître silencieusement.
  const orphanIds = reminder.labelIds.filter((id) => !store.labels.some((label) => label.id === id))

  const set = (patch: Partial<Reminder>) => store.updateReminder(reminder.id, patch)

  return (
    <li
      className={cx(
        'rounded-xl border bg-surface shadow-sm',
        open ? 'border-accent' : 'border-line',
        !reminder.active && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent"
        >
          {reminder.title || <span className="text-muted">Sans titre</span>}
        </button>

        {labels.map((label) => (
          <span
            key={label.id}
            className="rounded border px-1.5 py-px text-[10px] font-medium"
            style={chipStyle(label.color)}
          >
            {label.name}
          </span>
        ))}
        {orphanIds.length > 0 ? (
          <span
            title="Étiquette d'origine supprimée"
            className="rounded border border-dashed px-1.5 py-px text-[10px] font-medium text-muted"
          >
            Autre
          </span>
        ) : null}

        <span className="text-xs text-muted">{describeRepeat(reminder.repeat)}</span>

        {waiting > 0 ? (
          <Pill tone="warn">
            {waiting} à valider
          </Pill>
        ) : null}

        {!reminder.active ? (
          <Pill tone="muted">en pause</Pill>
        ) : finished ? (
          <Pill tone="ok">passé</Pill>
        ) : next ? (
          <Pill tone="muted">{formatWhen(next, reminder.at)}</Pill>
        ) : (
          <Pill tone="muted">aucune date</Pill>
        )}

        <IconButton
          label={reminder.active ? 'Mettre en pause' : 'Réactiver'}
          onClick={() => set({ active: !reminder.active })}
        >
          {reminder.active ? '⏸' : '▶'}
        </IconButton>
        {/* Pastille arrondie et bordée, dans l'esprit de la barre de liste
            réduite — un badge distinct plutôt qu'une simple icône au survol. */}
        <button
          type="button"
          aria-label="Modifier le rappel"
          title="Modifier le rappel"
          onClick={onToggle}
          className={cx(
            'grid size-7 shrink-0 place-items-center rounded-full border text-xs transition-colors',
            open
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line bg-surface-2 text-muted hover:border-accent hover:text-accent',
          )}
        >
          ✎
        </button>
      </div>

      <Modal
        open={open}
        onClose={onToggle}
        wide
        title={reminder.title.trim() || 'Rappel sans titre'}
        footer={
          <>
            <span className="mr-auto text-xs text-muted">
              {next
                ? `Prochaine échéance : ${formatWhen(next, reminder.at)}`
                : 'Aucune échéance à venir.'}
              {reminder.leadDays > 0 && next
                ? ` · pré-avis le ${formatFullDay(addDays(next, -reminder.leadDays))}`
                : ''}
            </span>
            <ConfirmButton
              confirmLabel="Supprimer pour de bon"
              onConfirm={() => {
                // Fermer AVANT de supprimer : la fiche perdrait sa source.
                onToggle()
                void store.deleteReminder(reminder.id)
              }}
            >
              Supprimer
            </ConfirmButton>
            <Button variant="primary" onClick={onToggle}>
              Terminé
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Titre">
            <TextInput
              value={reminder.title}
              placeholder="Ex. Déclaration d'impôts"
              onChange={(event) => set({ title: event.target.value })}
            />
          </Field>

          <Field label="Note" hint="Précision, lien, numéro de dossier…">
            <TextArea
              rows={2}
              value={reminder.note}
              onChange={(event) => set({ note: event.target.value })}
            />
          </Field>

          {/* ------------------------------------------------------ Rythme */}
          <div className="rounded-lg border border-line p-3">
            <span className="mb-2 block text-xs font-semibold tracking-wide text-muted uppercase">
              Rythme
            </span>
            <Select
              value={mode}
              aria-label="Type de rappel"
              onChange={(event) =>
                set({ repeat: repeatFor(event.target.value as RepeatMode, reminder.repeat) })
              }
            >
              {(Object.keys(MODE_LABELS) as RepeatMode[]).map((key) => (
                <option key={key} value={key}>
                  {MODE_LABELS[key]}
                </option>
              ))}
            </Select>

            {mode === 'weekdays' && reminder.repeat?.kind === 'weekdays' ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {WEEKDAYS.map((weekday) => {
                  const on = reminder.repeat?.kind === 'weekdays' && reminder.repeat.days.includes(weekday.value)
                  return (
                    <button
                      key={weekday.value}
                      type="button"
                      title={weekday.label}
                      onClick={() => {
                        if (reminder.repeat?.kind !== 'weekdays') return
                        const days = on
                          ? reminder.repeat.days.filter((value) => value !== weekday.value)
                          : [...reminder.repeat.days, weekday.value]
                        set({ repeat: { kind: 'weekdays', days } })
                      }}
                      className={cx(
                        'size-8 rounded-lg border text-xs font-semibold transition-colors',
                        on
                          ? 'border-accent bg-accent text-accent-ink'
                          : 'border-line text-muted hover:border-accent',
                      )}
                    >
                      {weekday.short}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {mode === 'interval' && reminder.repeat?.kind === 'interval' ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">Tous les</span>
                <TextInput
                  type="number"
                  min={1}
                  value={reminder.repeat.interval}
                  className="w-20"
                  aria-label="Intervalle"
                  onChange={(event) => {
                    if (reminder.repeat?.kind !== 'interval') return
                    set({
                      repeat: {
                        ...reminder.repeat,
                        interval: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }}
                />
                <Select
                  value={reminder.repeat.unit}
                  className="w-32"
                  aria-label="Unité"
                  onChange={(event) => {
                    if (reminder.repeat?.kind !== 'interval') return
                    set({
                      repeat: { ...reminder.repeat, unit: event.target.value as RecurrenceUnit },
                    })
                  }}
                >
                  {RECURRENCE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <p className="mt-2 text-xs text-muted">{describeRepeat(reminder.repeat)}</p>
          </div>

          {/* -------------------------------------------------- Jour et heure */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
                {reminder.repeat === null ? 'Jour' : 'À partir du'}
              </span>
              <DatePicker
                day={reminder.startsOn}
                time={reminder.at}
                withTime
                onSelect={(day, at) => set({ startsOn: day, at: at ?? reminder.at })}
                trigger={(toggle) => (
                  <Button size="sm" onClick={toggle}>
                    📅 {formatFullDay(reminder.startsOn)} à {reminder.at}
                  </Button>
                )}
              />
            </div>

            <Field label="Pré-avis" hint="Prévenir aussi X jours avant. 0 = seulement le jour J.">
              <TextInput
                type="number"
                min={0}
                max={365}
                value={reminder.leadDays}
                className="w-24"
                onChange={(event) =>
                  set({ leadDays: Math.max(0, Math.min(365, Number(event.target.value) || 0)) })
                }
              />
            </Field>
          </div>

          {/* --------------------------------------------------- Étiquettes */}
          <div>
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              Étiquette
            </span>
            {store.labels.length === 0 && orphanIds.length === 0 ? (
              <p className="text-xs text-muted">Crée des étiquettes dans les réglages ⚙.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {store.labels.map((label) => {
                  const on = reminder.labelIds.includes(label.id)
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() =>
                        set({
                          labelIds: on
                            ? reminder.labelIds.filter((id) => id !== label.id)
                            : [...reminder.labelIds, label.id],
                        })
                      }
                      className={cx(
                        'rounded border px-2 py-0.5 text-xs font-medium transition-opacity',
                        on ? 'ring-1 ring-accent' : 'opacity-60 hover:opacity-100',
                      )}
                      style={chipStyle(label.color)}
                    >
                      {on ? '✓ ' : ''}
                      {label.name}
                    </button>
                  )
                })}
                {/* Étiquette(s) supprimée(s) des réglages depuis : la référence
                    reste sur ce rappel jusqu'à détachement explicite — voir
                    hasOrphanLabel plus haut. */}
                {orphanIds.length > 0 ? (
                  <button
                    type="button"
                    title="Cette étiquette a été supprimée des réglages : détacher la référence"
                    onClick={() =>
                      set({
                        labelIds: reminder.labelIds.filter((id) => !orphanIds.includes(id)),
                      })
                    }
                    className="rounded border border-dashed px-2 py-0.5 text-xs font-medium text-muted hover:text-ink"
                  >
                    ✕ Autre (détacher)
                  </button>
                ) : null}
              </div>
            )}
          </div>

        </div>
      </Modal>
    </li>
  )
}
