import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  Button,
  ConfirmButton,
  IconButton,
  InlineEdit,
  TextArea,
  cx,
} from '../../components/ui'
import { nowIso } from '../../lib/id'
import { LABEL_COLOR_NAMES, dotStyle, listTintStyle } from '../../lib/palette'
import { useStore } from '../../lib/state'
import { LABEL_COLORS } from '../../lib/types'
import type { Card, Goal, ID, Label, List } from '../../lib/types'
import { CardTile } from './CardTile'

export function ListColumn({
  list,
  cards,
  labelsById,
  goalsById,
  onOpenCard,
  hasWallpaper,
}: {
  list: List
  cards: Card[]
  labelsById: Map<ID, Label>
  goalsById: Map<ID, Goal>
  onOpenCard: (cardId: ID) => void
  hasWallpaper: boolean
}) {
  const store = useStore()
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const sortable = useSortable({
    id: `list:${list.id}`,
    data: { type: 'list', listId: list.id },
  })

  // Zone de dépôt distincte du sortable de la colonne : elle accepte les cartes,
  // y compris quand la liste est vide et n'a donc aucune carte comme cible.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: list.id,
    data: { type: 'container', listId: list.id },
  })

  const tint = listTintStyle(list.color, hasWallpaper)
  const sortStyle = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  }

  /* ------------------------------------------------------------ Liste réduite */
  // Barre verticale à la Trello : un clic n'importe où la rouvre. Elle reste
  // triable (glisser) et accepte le dépôt de cartes — elles vont à la fin.
  if (list.collapsed) {
    return (
      <section
        ref={(node) => {
          sortable.setNodeRef(node)
          setDropRef(node)
        }}
        style={{
          ...sortStyle,
          ...tint,
          ...(isOver ? { borderColor: 'var(--accent)' } : {}),
        }}
        className={cx(
          'flex max-h-full w-11 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border py-2',
          !list.color && !hasWallpaper && 'bg-surface-2',
          isOver ? 'border-accent' : 'border-line',
          sortable.isDragging && 'opacity-50',
        )}
        {...sortable.attributes}
        {...sortable.listeners}
        onClick={() => void store.updateList(list.id, { collapsed: false })}
        title={`Développer « ${list.name} »`}
      >
        <span aria-hidden className="text-xs text-muted">
          ↔
        </span>
        {/* Pas de `flex-1` ici : dans une colonne à hauteur de contenu, une
            base flex de 0 écraserait le nom à hauteur nulle. Taille naturelle,
            plafonnée avec points de suspension. */}
        <span className="max-h-64 overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap [writing-mode:vertical-rl]">
          {list.name}
        </span>
        <span className="text-xs font-medium text-muted tabular-nums [writing-mode:vertical-rl]">
          {cards.length}
        </span>
      </section>
    )
  }

  const submitDraft = async () => {
    const title = draft.trim()
    if (!title) {
      setComposing(false)
      return
    }
    const created = await store.createCard(list.boardId, list.id, title)
    setDraft('')
    setComposing(false)
    // Titre validé → la fiche s'ouvre aussitôt pour compléter la carte.
    if (created) onOpenCard(created.id)
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        ...sortStyle,
        ...tint,
        ...(isOver ? { borderColor: 'var(--accent)' } : {}),
      }}
      className={cx(
        'relative flex max-h-full w-72 shrink-0 flex-col rounded-xl border',
        !list.color && !hasWallpaper && 'bg-surface-2',
        isOver ? 'border-accent' : 'border-line',
        sortable.isDragging && 'opacity-50',
      )}
    >
      <header
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        className="flex cursor-grab items-center gap-1 px-2.5 py-2 active:cursor-grabbing"
      >
        <InlineEdit
          value={list.name}
          onSubmit={(name) => store.updateList(list.id, { name })}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          placeholder="Nom de la liste"
        />
        <span className="text-xs text-muted tabular-nums">{cards.length}</span>
        <IconButton
          label="Réduire la liste"
          className="text-[10px]"
          onClick={() => void store.updateList(list.id, { collapsed: true })}
        >
          ⇥⇤
        </IconButton>
        <IconButton label="Actions de la liste" onClick={() => setMenuOpen((open) => !open)}>
          ⋯
        </IconButton>
      </header>

      {menuOpen ? <ListMenu list={list} onClose={() => setMenuOpen(false)} /> : null}

      <div ref={setDropRef} className="min-h-6 flex-1 overflow-y-auto px-2 pb-1">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                labels={card.labelIds
                  .map((id) => labelsById.get(id))
                  .filter((label): label is Label => label !== undefined)}
                goal={card.goalId ? goalsById.get(card.goalId) : undefined}
                onOpen={() => onOpenCard(card.id)}
                onToggleDone={() => void store.setCardDone(card.id, card.doneAt === null)}
              />
            ))}
          </div>
        </SortableContext>
        {cards.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted">Dépose une carte ici</p>
        ) : null}
      </div>

      <div className="p-2 pt-1">
        {composing ? (
          <div className="flex flex-col gap-1.5">
            <TextArea
              autoFocus
              rows={2}
              value={draft}
              placeholder="Titre de la tâche…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitDraft()
                }
                if (event.key === 'Escape') {
                  setDraft('')
                  setComposing(false)
                }
              }}
            />
            <div className="flex items-center gap-1.5">
              <Button variant="primary" size="sm" onClick={() => void submitDraft()}>
                Ajouter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft('')
                  setComposing(false)
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setComposing(true)}
          >
            + Ajouter une tâche
          </Button>
        )}
      </div>
    </section>
  )
}

/**
 * Menu ⋯ de la liste, en popover ancré comme sur Trello. Deux options, pas
 * une de plus : la couleur et l'archivage.
 */
function ListMenu({ list, onClose }: { list: List; onClose: () => void }) {
  const store = useStore()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Voile transparent : un clic hors du menu le referme. */}
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute top-11 right-1 z-50 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-semibold text-muted">
            Liste « {list.name} »
          </span>
          <IconButton label="Fermer" onClick={onClose}>
            ✕
          </IconButton>
        </div>

        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
          Couleur
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {LABEL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={LABEL_COLOR_NAMES[color]}
              onClick={() => store.updateList(list.id, { color })}
              className="grid h-7 place-items-center rounded-md text-xs font-bold text-white/90 transition-transform hover:scale-105"
              style={dotStyle(color)}
            >
              {list.color === color ? '✓' : ''}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-1.5 w-full"
          disabled={list.color === null}
          onClick={() => store.updateList(list.id, { color: null })}
        >
          ✕ Supprimer la couleur
        </Button>

        <div className="my-2.5 border-t border-line" />

        {/* Liste de modèles : ses cartes deviennent des gabarits, duplicables
            et programmables. La liste elle-même reste une liste ordinaire. */}
        <label className="flex cursor-pointer items-start gap-2 px-1 py-1">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 accent-[var(--accent)]"
            checked={list.isTemplate}
            onChange={(event) => store.updateList(list.id, { isTemplate: event.target.checked })}
          />
          <span className="text-xs text-muted">
            <span className="font-medium text-ink">Liste de modèles</span> — ses cartes se
            dupliquent et peuvent partir dans une autre liste à une date choisie.
          </span>
        </label>

        <div className="my-2.5 border-t border-line" />

        <ConfirmButton
          className="w-full"
          confirmLabel="Confirmer l'archivage"
          onConfirm={() => {
            onClose()
            void store.updateList(list.id, { archivedAt: nowIso() })
          }}
        >
          Archiver cette liste
        </ConfirmButton>
      </div>
    </>
  )
}
