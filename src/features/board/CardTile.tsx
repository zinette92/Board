import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Pill, cx } from '../../components/ui'
import { dueTone, formatDue } from '../../lib/dates'
import { formatAmount } from '../../lib/goals'
import { chipStyle } from '../../lib/palette'
import { useStore } from '../../lib/state'
import type { Card, Goal, Label } from '../../lib/types'

/** Un glisser natif de fichier(s) OS, distinct du drag-and-drop pointeur de dnd-kit. */
function isFileDrag(event: { dataTransfer: DataTransfer | null }): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

const DUE_TONES = {
  overdue: 'danger',
  today: 'warn',
  soon: 'plain',
  later: 'muted',
} as const

export function CardFace({
  card,
  labels,
  goal,
  dragging,
  onToggleDone,
}: {
  card: Card
  labels: Label[]
  goal: Goal | undefined
  dragging?: boolean
  /** Absent (aperçu de drag) : le rond est décoratif. */
  onToggleDone?: () => void
}) {
  const items = card.checklists.flatMap((checklist) => checklist.items)
  const checked = items.filter((item) => item.done).length
  const done = card.doneAt !== null

  return (
    <article
      className={cx(
        'rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-sm transition-colors',
        dragging ? 'rotate-1 shadow-lg' : 'hover:border-accent/50',
      )}
    >
      {labels.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className="rounded border px-1.5 py-px text-[10px] leading-tight font-medium"
              style={chipStyle(label.color)}
            >
              {label.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-start gap-1.5">
        {/* Le rond « terminée », comme sur Trello : c'est lui qui fait avancer
            l'objectif rattaché — les listes n'y sont pour rien. */}
        <button
          type="button"
          aria-label={done ? 'Remettre à faire' : 'Marquer terminée'}
          title={done ? 'Remettre à faire' : 'Marquer terminée'}
          disabled={!onToggleDone}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDone?.()
          }}
          className={cx(
            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none transition-colors',
            done
              ? 'border-ok bg-ok text-white'
              : 'border-line text-transparent hover:border-ok hover:text-ok',
          )}
        >
          ✓
        </button>
        <p className={cx('min-w-0 flex-1 text-sm leading-snug', done && 'text-muted line-through')}>
          {card.title}
        </p>
      </div>

      {goal || card.dueOn || items.length > 0 || card.attachmentCount > 0 || card.schedule ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {goal ? (
            <Pill tone="accent" className="max-w-full">
              <span className="truncate">🎯 {goal.title || 'Objectif sans titre'}</span>
              {card.contribution > 0 ? (
                <span className="opacity-80">+{formatAmount(card.contribution)}</span>
              ) : null}
            </Pill>
          ) : null}
          {card.dueOn ? (
            <Pill tone={done ? 'muted' : DUE_TONES[dueTone(card.dueOn)]}>
              📅 {formatDue(card.dueOn)}
              {card.dueTime ? ` · ${card.dueTime}` : ''}
            </Pill>
          ) : null}
          {items.length > 0 ? (
            <Pill tone={checked === items.length ? 'ok' : 'muted'}>
              ☑ {checked}/{items.length}
            </Pill>
          ) : null}
          {card.attachmentCount > 0 ? <Pill>📎 {card.attachmentCount}</Pill> : null}
          {/* Modèle programmé : on voit d'un coup d'œil qu'il partira tout seul. */}
          {card.schedule ? (
            <Pill tone={card.schedule.active ? 'accent' : 'muted'}>
              🗓 {card.schedule.active ? formatDue(card.schedule.nextOn) : 'suspendu'}
            </Pill>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function CardTile({
  card,
  labels,
  goal,
  onOpen,
  onToggleDone,
}: {
  card: Card
  labels: Label[]
  goal: Goal | undefined
  onOpen: () => void
  onToggleDone: () => void
}) {
  const store = useStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId: card.listId },
  })
  // Survol par un fichier du système : distinct du drag dnd-kit (pointeur), qui
  // ne déclenche jamais ces événements natifs de glisser-déposer.
  const [fileOver, setFileOver] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // La carte en cours de déplacement reste en place mais s'effface : c'est
      // l'aperçu du DragOverlay qui suit le pointeur.
      className={cx(
        'touch-manipulation rounded-lg',
        isDragging && 'opacity-40',
        fileOver && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
      )}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      // Les `listeners` de dnd-kit contiennent déjà un `onKeyDown` (Espace pour
      // saisir la carte, flèches pour la déplacer). Déclarer le nôtre après
      // l'étalement l'écraserait : on le chaîne au lieu de le remplacer.
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event)
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen()
        }
      }}
      tabIndex={0}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return
        // Sans ce preventDefault, le navigateur refuse le dépôt (curseur « interdit »).
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        if (!fileOver) setFileOver(true)
      }}
      onDragLeave={(event) => {
        // Un enfant survolé déclenche aussi dragleave : ne retirer le halo que
        // lorsqu'on quitte vraiment la carte, pas entre deux de ses enfants.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setFileOver(false)
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        // Empêche la colonne/le tableau de traiter le même dépôt une seconde fois.
        event.stopPropagation()
        setFileOver(false)
        for (const file of Array.from(event.dataTransfer.files)) {
          void store.addAttachment(card.id, file)
        }
      }}
    >
      <CardFace card={card} labels={labels} goal={goal} onToggleDone={onToggleDone} />
    </div>
  )
}
