import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  Button,
  ConfirmButton,
  Field,
  IconButton,
  Modal,
  Pill,
  ProgressBar,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../../components/ui'
import {
  addDays,
  daysBetween,
  formatDay,
  formatDuration,
  formatFullDay,
  today,
} from '../../lib/dates'
import { DatePicker } from '../../components/DatePicker'
import { makeMilestone } from '../../lib/create'
import {
  MILESTONE_LABELS,
  MILESTONE_TONES,
  PACE_LABELS,
  PACE_TONES,
  formatAmount,
  formatWithUnit,
  goalProgress,
  smartCriteria,
} from '../../lib/goals'
import { CATEGORY_COLORS } from '../../lib/palette'
import { useStore } from '../../lib/state'
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABELS } from '../../lib/types'
import type { Card, Goal, GoalCategory, ID } from '../../lib/types'

export function GoalsView({ onOpenCard }: { onOpenCard: (id: ID) => void }) {
  const store = useStore()
  const [editing, setEditing] = useState<ID | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const goals = useMemo(
    () =>
      store.goals
        .filter((goal) => (showArchived ? true : goal.status !== 'archived'))
        .sort((a, b) => a.position - b.position),
    [store.goals, showArchived],
  )

  const cards = useMemo(() => store.cards.filter((card) => card.archivedAt === null), [store.cards])

  const create = async (category: GoalCategory) => {
    const goal = await store.createGoal(category)
    if (goal) setEditing(goal.id)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Objectifs SMART</h2>
          {store.goals.some((goal) => goal.status === 'archived') ? (
            <Button
              size="sm"
              variant={showArchived ? 'primary' : 'ghost'}
              onClick={() => setShowArchived(!showArchived)}
            >
              Archivés
            </Button>
          ) : null}
          {GOAL_CATEGORIES.map((category) => (
            <Button key={category} size="sm" onClick={() => void create(category)}>
              + {GOAL_CATEGORY_LABELS[category]}
            </Button>
          ))}
        </div>

        {goals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            Aucun objectif. Crée-en un, puis rattache tes tâches : leur achèvement fera avancer la
            mesure tout seul.
          </p>
        ) : (
          goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              cards={cards}
              onEdit={() => setEditing(goal.id)}
              onOpenCard={onOpenCard}
            />
          ))
        )}
      </div>

      {editing ? <GoalEditor goalId={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function GoalRow({
  goal,
  cards,
  onEdit,
  onOpenCard,
}: {
  goal: Goal
  cards: Card[]
  onEdit: () => void
  onOpenCard: (id: ID) => void
}) {
  const progress = goalProgress(goal, cards)
  const criteria = smartCriteria(goal)
  const missing = criteria.filter((criterion) => !criterion.filled)
  const linked = cards.filter((card) => card.goalId === goal.id)
  const tone = PACE_TONES[progress.pace]
  // La barre n'a pas de nuance « muted » : un objectif pas encore commencé
  // s'affiche dans la couleur d'accent, la pastille dira le reste.
  const barTone = tone === 'muted' ? 'accent' : tone

  return (
    <article
      className={cx(
        'rounded-xl border border-line bg-surface p-4 shadow-sm',
        goal.status === 'archived' && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Pill
              tone="plain"
              style={{
                borderColor: `color-mix(in oklab, ${CATEGORY_COLORS[goal.category]} 45%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${CATEGORY_COLORS[goal.category]} 18%, transparent)`,
              }}
            >
              {GOAL_CATEGORY_LABELS[goal.category]}
            </Pill>
            <Pill tone={PACE_TONES[progress.pace]}>{PACE_LABELS[progress.pace]}</Pill>
            {goal.status === 'paused' ? <Pill tone="muted">en pause</Pill> : null}
            {missing.length === 0 ? (
              <Pill tone="ok">SMART complet</Pill>
            ) : (
              <Pill tone="warn">
                {criteria.length - missing.length}/5 critères — manque{' '}
                {missing.map((criterion) => criterion.key).join(', ')}
              </Pill>
            )}
          </div>
          <h3 className="text-base font-semibold">
            {goal.title || <span className="text-muted">Objectif sans titre</span>}
          </h3>
          {goal.specific ? <p className="mt-0.5 text-sm text-muted">{goal.specific}</p> : null}
        </div>
        <Button size="sm" onClick={onEdit}>
          Modifier
        </Button>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <strong className="text-base">{formatAmount(progress.current)}</strong>
            <span className="text-muted">
              {' / '}
              {formatWithUnit(progress.target, goal.unit)}
            </span>
            {goal.metric ? <span className="text-muted"> · {goal.metric}</span> : null}
          </span>
          {/* « reste 2 semaines » plutôt que « 2 semaines restantes » : évite
              d'accorder un adjectif avec un nom qui change (jour, semaine, mois). */}
          <span className="text-xs text-muted">
            {progress.daysLeft >= 0
              ? `reste ${formatDuration(progress.daysLeft)} · échéance ${formatFullDay(goal.dueOn)}`
              : `échéance dépassée depuis ${formatDuration(-progress.daysLeft)} (${formatFullDay(goal.dueOn)})`}
          </span>
        </div>
        <ProgressBar ratio={progress.ratio} tone={barTone} marker={progress.timeRatio} />
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            {Math.round(progress.ratio * 100)} % fait · {Math.round(progress.timeRatio * 100)} % du
            temps écoulé
          </span>
          <span>
            {formatAmount(progress.fromCards)} via {progress.linkedDone}/{progress.linked} tâche(s)
            terminée(s)
          </span>
          {progress.manual > 0 ? <span>{formatAmount(progress.manual)} hors outil</span> : null}
          {progress.remaining > 0 && progress.daysLeft > 0 ? (
            <span>
              rythme requis : {formatWithUnit(progress.perWeekNeeded, goal.unit)} / semaine
            </span>
          ) : null}
          {progress.expected !== null ? (
            <span>
              attendu à ce stade : {formatWithUnit(progress.expected, goal.unit)}
            </span>
          ) : null}
        </div>
      </div>

      {progress.milestones.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">
              Paliers
            </span>
            {progress.nextMilestone ? (
              <span className="text-xs text-muted">
                prochain :{' '}
                <strong className="text-ink">
                  {formatWithUnit(progress.nextMilestone.milestone.target, goal.unit)}
                </strong>{' '}
                le {formatFullDay(progress.nextMilestone.milestone.dueOn)} (
                {formatDuration(progress.nextMilestone.daysLeft)})
              </span>
            ) : null}
          </div>
          <ol className="flex flex-col gap-1">
            {progress.milestones.map((view) => (
              <li key={view.milestone.id} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={cx(
                    'grid size-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none',
                    view.status === 'reached' && 'border-ok bg-ok text-white',
                    view.status === 'missed' && 'border-danger text-danger',
                    view.status === 'upcoming' && 'border-line text-transparent',
                  )}
                >
                  {view.status === 'missed' ? '!' : '✓'}
                </span>
                <span className="w-20 shrink-0 text-xs text-muted tabular-nums">
                  {formatDay(view.milestone.dueOn)}
                </span>
                <span
                  className={cx(
                    'font-medium tabular-nums',
                    view.status === 'reached' && 'text-muted',
                  )}
                >
                  {formatWithUnit(view.milestone.target, goal.unit)}
                </span>
                {view.milestone.label ? (
                  <span className="min-w-0 truncate text-xs text-muted">
                    {view.milestone.label}
                  </span>
                ) : null}
                <Pill tone={MILESTONE_TONES[view.status]} className="ml-auto">
                  {MILESTONE_LABELS[view.status]}
                  {view.status === 'upcoming'
                    ? ` · manque ${formatAmount(view.remaining)}`
                    : view.status === 'missed'
                      ? ` · manque ${formatAmount(view.remaining)}`
                      : ''}
                </Pill>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-0.5 rounded-lg bg-surface-2/70 p-2.5 text-xs text-muted">
          {missing.map((criterion) => (
            <li key={criterion.key}>
              <strong className="text-ink">
                {criterion.key} — {criterion.name} :
              </strong>{' '}
              {criterion.hint}
            </li>
          ))}
        </ul>
      ) : null}

      {linked.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
            {linked.length} tâche(s) rattachée(s)
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {linked.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onOpenCard(card.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                >
                  <span className={cx('shrink-0', card.doneAt ? 'text-ok' : 'text-muted')}>
                    {card.doneAt ? '✓' : '○'}
                  </span>
                  <span className={cx('flex-1 truncate', card.doneAt && 'text-muted line-through')}>
                    {card.title}
                  </span>
                  {card.contribution > 0 ? (
                    <span className="shrink-0 text-xs text-muted">
                      +{formatAmount(card.contribution)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}

function GoalEditor({ goalId, onClose }: { goalId: ID; onClose: () => void }) {
  const store = useStore()
  const goal = store.goals.find((item) => item.id === goalId)
  const [draft, setDraft] = useState<Goal | undefined>(goal)

  if (!goal || !draft) return null

  const set = <K extends keyof Goal>(key: K, value: Goal[K]) =>
    setDraft({ ...draft, [key]: value })

  const criteria = smartCriteria(draft)
  const filled = criteria.filter((criterion) => criterion.filled).length

  const save = async () => {
    await store.updateGoal(goalId, {
      title: draft.title,
      specific: draft.specific,
      metric: draft.metric,
      target: draft.target,
      unit: draft.unit,
      manualProgress: draft.manualProgress,
      achievable: draft.achievable,
      relevant: draft.relevant,
      startsOn: draft.startsOn,
      dueOn: draft.dueOn,
      // Triés à l'enregistrement : l'affichage n'a plus à s'en soucier.
      milestones: [...draft.milestones].sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
      category: draft.category,
      status: draft.status,
    })
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Objectif</span>
          <Pill tone={filled === 5 ? 'ok' : 'warn'}>{filled}/5 critères SMART</Pill>
        </div>
      }
      footer={
        <>
          <ConfirmButton
            size="md"
            onConfirm={() => {
              onClose()
              void store.deleteGoal(goalId)
            }}
            confirmLabel="Supprimer pour de bon"
          >
            Supprimer
          </ConfirmButton>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Criterion letter="S" name="Spécifique" done={criteria[0].filled}>
          <Field label="Intitulé">
            <TextInput
              autoFocus
              value={draft.title}
              placeholder="Ex. Signer 3 nouveaux restaurants"
              onChange={(event) => set('title', event.target.value)}
            />
          </Field>
          <Field
            label="Précision"
            hint="Ce qu'on doit pouvoir constater sans discussion possible."
          >
            <TextArea
              rows={2}
              value={draft.specific}
              placeholder="Ex. Trois contrats signés sur l'offre services aux restaurateurs."
              onChange={(event) => set('specific', event.target.value)}
            />
          </Field>
          <Field label="Domaine">
            <Select
              value={draft.category}
              onChange={(event) => set('category', event.target.value as GoalCategory)}
            >
              {GOAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {GOAL_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
        </Criterion>

        <Criterion letter="M" name="Mesurable" done={criteria[1].filled}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ce que je compte">
              <TextInput
                value={draft.metric}
                placeholder="contrats signés"
                onChange={(event) => set('metric', event.target.value)}
              />
            </Field>
            <Field label="Cible">
              <TextInput
                type="number"
                step="any"
                min={0}
                value={draft.target}
                onChange={(event) => set('target', Number(event.target.value) || 0)}
              />
            </Field>
            <Field label="Unité">
              <TextInput
                value={draft.unit}
                placeholder="contrats"
                onChange={(event) => set('unit', event.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Déjà acquis hors de l'outil"
            hint="Le reste de l'avancement se calcule tout seul à partir des tâches terminées — ne le saisis pas ici."
          >
            <TextInput
              type="number"
              step="any"
              min={0}
              value={draft.manualProgress}
              className="w-32"
              onChange={(event) => set('manualProgress', Number(event.target.value) || 0)}
            />
          </Field>
        </Criterion>

        <Criterion letter="A" name="Atteignable" done={criteria[2].filled}>
          <Field label="Les moyens concrets" hint="Ce qui rend cet objectif réaliste, pas juste souhaitable.">
            <TextArea
              rows={2}
              value={draft.achievable}
              placeholder="Ex. 15 prospects identifiés, 5 rendez-vous déjà pris."
              onChange={(event) => set('achievable', event.target.value)}
            />
          </Field>
        </Criterion>

        <Criterion letter="R" name="Pertinent" done={criteria[3].filled}>
          <Field label="Pourquoi cet objectif compte">
            <TextArea
              rows={2}
              value={draft.relevant}
              placeholder="Ex. Seuil à partir duquel le revenu récurrent couvre les charges fixes."
              onChange={(event) => set('relevant', event.target.value)}
            />
          </Field>
        </Criterion>

        <Criterion letter="T" name="Temporel" done={criteria[4].filled}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Début">
              <TextInput
                type="date"
                value={draft.startsOn}
                onChange={(event) => set('startsOn', event.target.value || today())}
              />
            </Field>
            <Field label="Échéance">
              <TextInput
                type="date"
                value={draft.dueOn}
                onChange={(event) => set('dueOn', event.target.value || today())}
              />
            </Field>
          </div>
          {!criteria[4].filled && draft.startsOn && draft.dueOn ? (
            <p className="text-xs text-danger">L'échéance doit être postérieure au début.</p>
          ) : null}
        </Criterion>

        <MilestonesEditor
          goal={draft}
          onChange={(milestones) => setDraft({ ...draft, milestones })}
        />

        <Field label="État">
          <Select
            value={draft.status}
            onChange={(event) => set('status', event.target.value as Goal['status'])}
          >
            <option value="active">Actif</option>
            <option value="paused">En pause</option>
            <option value="archived">Archivé</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Édition des paliers : « au 1er octobre, être à 900 ». Ils décrivent la
 * trajectoire attendue et servent ensuite à juger l'avance ou le retard.
 */
function MilestonesEditor({
  goal,
  onChange,
}: {
  goal: Goal
  onChange: (milestones: Goal['milestones']) => void
}) {
  const sorted = [...goal.milestones].sort((a, b) => a.dueOn.localeCompare(b.dueOn))

  const patch = (id: ID, next: Partial<Goal['milestones'][number]>) =>
    onChange(goal.milestones.map((item) => (item.id === id ? { ...item, ...next } : item)))

  const add = () => {
    // Le nouveau palier se pose à mi-chemin de ce qu'il reste — en date comme
    // en valeur — pour rester DANS la fenêtre de l'objectif. Sans ce calcul,
    // un pas fixe de 30 jours déborde l'échéance dès le deuxième palier.
    const last = sorted[sorted.length - 1]
    const from = last?.dueOn ?? goal.startsOn
    const span = daysBetween(from, goal.dueOn)
    const dueOn = span > 1 ? addDays(from, Math.max(1, Math.round(span / 2))) : addDays(from, 30)
    const previousTarget = last?.target ?? goal.manualProgress
    const suggested = Math.round((previousTarget + goal.target) / 2)
    onChange([...goal.milestones, makeMilestone(suggested, dueOn)])
  }

  return (
    <section className="rounded-lg border border-line p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-xs">
          📍
        </span>
        <span className="text-sm font-semibold">Paliers</span>
        <span className="text-xs text-muted">facultatif</span>
      </div>

      <p className="mb-2.5 text-xs text-muted">
        Des jalons datés sur la route de l'objectif — ex. viser 850 au 1<sup>er</sup> septembre,
        900 au 1<sup>er</sup> octobre. Dès qu'un palier existe, c'est lui qui dit si tu es en
        avance ou en retard, à la place du simple temps écoulé.
      </p>

      {sorted.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {sorted.map((milestone) => {
            const afterDeadline = milestone.dueOn > goal.dueOn
            return (
            <li key={milestone.id} className="flex flex-wrap items-center gap-1.5">
              <DatePicker
                day={milestone.dueOn}
                onSelect={(day) => patch(milestone.id, { dueOn: day })}
                trigger={(toggle) => (
                  <Button
                    size="sm"
                    className={cx(
                      'w-32 justify-start',
                      afterDeadline && 'border-danger text-danger',
                    )}
                    title={afterDeadline ? "Ce palier tombe après l'échéance de l'objectif" : undefined}
                    onClick={toggle}
                  >
                    📅 {formatFullDay(milestone.dueOn)}
                  </Button>
                )}
              />
              <TextInput
                type="number"
                step="any"
                value={milestone.target}
                className="w-24"
                aria-label="Valeur du palier"
                onChange={(event) =>
                  patch(milestone.id, { target: Number(event.target.value) || 0 })
                }
              />
              <span className="text-xs text-muted">{goal.unit}</span>
              <TextInput
                value={milestone.label}
                placeholder="Note (facultatif)"
                className="min-w-32 flex-1"
                onChange={(event) => patch(milestone.id, { label: event.target.value })}
              />
              <IconButton
                label="Retirer ce palier"
                onClick={() =>
                  onChange(goal.milestones.filter((item) => item.id !== milestone.id))
                }
              >
                ✕
              </IconButton>
              {afterDeadline ? (
                <p className="w-full text-xs text-danger">
                  Ce palier tombe après l'échéance de l'objectif ({formatFullDay(goal.dueOn)}).
                </p>
              ) : null}
            </li>
            )
          })}
        </ul>
      ) : null}

      <Button size="sm" onClick={add}>
        + Ajouter un palier
      </Button>
    </section>
  )
}

function Criterion({
  letter,
  name,
  done,
  children,
}: {
  letter: string
  name: string
  done: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cx(
            'grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold',
            done ? 'bg-ok/20 text-ok' : 'bg-surface-2 text-muted',
          )}
        >
          {letter}
        </span>
        <span className="text-sm font-semibold">{name}</span>
        {done ? <span className="text-xs text-ok">✓ renseigné</span> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}
