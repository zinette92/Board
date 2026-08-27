import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'

import { Button, ConfirmButton, Modal, TextInput } from '../../components/ui'
import { nowIso } from '../../lib/id'
import { byPosition } from '../../lib/ordering'
import { useStore } from '../../lib/state'
import type { Board, Card, ID, Label } from '../../lib/types'
import { CardFace } from './CardTile'
import { ListColumn } from './ListColumn'

/** `list:<id>` pour les colonnes, l'identifiant nu pour les cartes : les deux familles cohabitent dans un même DndContext. */
const LIST_PREFIX = 'list:'

type Arrangement = Record<ID, ID[]>

/**
 * Détection de collision.
 *
 * Règle commune aux deux familles : **dnd-kit ne décale les voisins que si
 * `over` appartient au même `SortableContext` que l'élément déplacé.** Laissé à
 * lui-même, `closestCorners` renvoie n'importe quel droppable — une carte
 * pendant qu'on déplace une colonne, une colonne pendant qu'on déplace une
 * carte — et l'aperçu de réorganisation ne se produit jamais.
 *
 * On filtre donc les collisions par type selon ce qui est déplacé.
 */
const collisionForBoard: CollisionDetection = (args) => {
  const typeOf = (id: UniqueIdentifier) =>
    args.droppableContainers.find((container) => container.id === id)?.data.current?.type
  const dragged = args.active.data.current?.type

  if (dragged === 'card') {
    const within = pointerWithin(args)
    const cards = within.filter((collision) => typeOf(collision.id) === 'card')
    if (cards.length > 0) return cards
    const containers = within.filter((collision) => typeOf(collision.id) === 'container')
    if (containers.length > 0) return containers
    // Hors de tout (entre deux colonnes, capteur clavier…) : au plus proche,
    // toujours sans les sortables de liste.
    return rectIntersection(args).filter((collision) => typeOf(collision.id) !== 'list')
  }

  if (dragged === 'list') {
    // Ne garder QUE les colonnes : les cartes et les zones de dépôt qu'elles
    // contiennent gagnaient sinon la collision, et les colonnes voisines
    // restaient immobiles jusqu'au dépôt.
    const onlyLists = (collisions: ReturnType<CollisionDetection>) =>
      collisions.filter((collision) => typeOf(collision.id) === 'list')
    const within = onlyLists(pointerWithin(args))
    if (within.length > 0) return within
    // Pointeur entre deux colonnes ou hors du tableau : la plus proche.
    return onlyLists(closestCorners(args))
  }

  return closestCorners(args)
}

export function BoardView({ board, onOpenCard }: { board: Board; onOpenCard: (id: ID) => void }) {
  const store = useStore()
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  /** Arrangement provisoire pendant un glissement, pour voir la carte changer de colonne en direct. */
  const [dragArrangement, setDragArrangement] = useState<Arrangement | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [listDraft, setListDraft] = useState('')

  // Fond d'écran du tableau : clé absente = jamais chargé pour ce tableau.
  const wallpaper = store.wallpapers[board.id]
  useEffect(() => {
    if (wallpaper === undefined) void store.loadWallpaper(board.id)
  }, [wallpaper, store, board.id])

  const lists = useMemo(
    () =>
      store.lists
        .filter((list) => list.boardId === board.id && list.archivedAt === null)
        .sort(byPosition),
    [store.lists, board.id],
  )

  /* ----------------------------------------------- Raccourcis de survol --
   * C archive la carte sous le curseur, D l'envoie dans la liste « Done »
   * (créée en fin de tableau si absente), R réduit/rouvre la liste survolée.
   *
   * Le survol est résolu à la frappe par elementFromPoint sur la dernière
   * position connue de la souris : aucun état React, aucun re-rendu, et cela
   * reste juste après un défilement (coordonnées viewport des deux côtés).
   */
  const mouse = useRef({ x: -1, y: -1 })
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY }
    }

    const sendToDone = async (cardId: ID) => {
      const done =
        lists.find((list) => !list.isTemplate && list.name.trim().toLowerCase() === 'done') ??
        (await store.createList(board.id, 'DONE'))
      if (!done) return
      const card = store.cards.find((item) => item.id === cardId)
      if (card?.listId === done.id) return
      await store.moveCard(cardId, done.id, Number.MAX_SAFE_INTEGER)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const key = event.key.toLowerCase()
      if (key !== 'c' && key !== 'd' && key !== 'r') return
      // Jamais pendant une saisie : le raccourci mangerait la lettre tapée.
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      const at = document.elementFromPoint(mouse.current.x, mouse.current.y)
      if (!at) return
      const cardEl = at.closest('[data-card-id]')
      const listEl = at.closest('[data-list-id]')

      if (key === 'r' && listEl) {
        const id = listEl.getAttribute('data-list-id') as ID
        const list = lists.find((item) => item.id === id)
        if (list) void store.updateList(id, { collapsed: !list.collapsed })
        event.preventDefault()
        return
      }
      if (!cardEl) return
      const id = cardEl.getAttribute('data-card-id') as ID
      if (key === 'c') void store.updateCard(id, { archivedAt: nowIso() })
      if (key === 'd') void sendToDone(id)
      event.preventDefault()
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [store, lists, board.id])

  const labelsById = useMemo(
    () => new Map(store.labels.map((label) => [label.id, label] as const)),
    [store.labels],
  )
  const goalsById = useMemo(
    () => new Map(store.goals.map((goal) => [goal.id, goal] as const)),
    [store.goals],
  )

  const boardCards = useMemo(
    () => store.cards.filter((card) => card.boardId === board.id && card.archivedAt === null),
    [store.cards, board.id],
  )

  const baseArrangement = useMemo<Arrangement>(() => {
    const out: Arrangement = {}
    for (const list of lists) {
      out[list.id] = boardCards
        .filter((card) => card.listId === list.id)
        .sort(byPosition)
        .map((card) => card.id)
    }
    return out
  }, [lists, boardCards])

  const arrangement = dragArrangement ?? baseArrangement
  const cardsById = useMemo(
    () => new Map(store.cards.map((card) => [card.id, card] as const)),
    [store.cards],
  )

  const sensors = useSensors(
    // Souris : un petit seuil, pour que le clic ouvre encore la carte.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Tactile : appui maintenu, sinon le défilement de la page devient impossible.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = (arr: Arrangement, cardId: UniqueIdentifier): ID | undefined =>
    Object.keys(arr).find((listId) => arr[listId].includes(String(cardId)))

  /** Résout ce qui est survolé en une colonne : soit la colonne elle-même, soit celle de la carte survolée. */
  const resolveContainer = (arr: Arrangement, overId: UniqueIdentifier | undefined): ID | undefined => {
    if (overId === undefined) return undefined
    const raw = String(overId)
    if (raw.startsWith(LIST_PREFIX)) return raw.slice(LIST_PREFIX.length)
    if (arr[raw]) return raw
    return containerOf(arr, raw)
  }

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id)
    if (event.active.data.current?.type === 'card') setDragArrangement(baseArrangement)
  }

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (active.data.current?.type !== 'card' || !over) return

    setDragArrangement((current) => {
      const arr = current ?? baseArrangement
      const from = containerOf(arr, active.id)
      const to = resolveContainer(arr, over.id)
      if (!from || !to || from === to) return arr

      const overRaw = String(over.id)
      const target = arr[to]
      const overIndex = target.indexOf(overRaw)
      // Sous la moitié de la carte survolée → on s'insère après elle : c'est ce
      // qui fait que les cartes « s'écartent » du bon côté avant le dépôt.
      const activeTop = active.rect.current.translated?.top
      const below =
        overIndex !== -1 &&
        activeTop !== undefined &&
        activeTop > over.rect.top + over.rect.height / 2
      // Survol de la colonne elle-même (zone vide) : on ajoute à la fin.
      const insertAt = overIndex === -1 ? target.length : overIndex + (below ? 1 : 0)

      return {
        ...arr,
        [from]: arr[from].filter((id) => id !== String(active.id)),
        [to]: [...target.slice(0, insertAt), String(active.id), ...target.slice(insertAt)],
      }
    })
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (active.data.current?.type === 'list') {
      setDragArrangement(null)
      if (!over || over.id === active.id) return
      // `collisionForBoard` ne renvoie que des colonnes pendant un drag de
      // colonne : `over.id` est donc toujours un `list:<id>`, plus besoin de
      // remonter depuis une carte comme auparavant.
      const from = lists.findIndex((list) => `${LIST_PREFIX}${list.id}` === String(active.id))
      const to = lists.findIndex((list) => `${LIST_PREFIX}${list.id}` === String(over.id))
      if (from === -1 || to === -1 || from === to) return
      await store.moveList(lists[from].id, to)
      return
    }

    const arr = dragArrangement ?? baseArrangement
    const cardId = String(active.id)
    const to = resolveContainer(arr, over?.id)
    if (!to) {
      setDragArrangement(null)
      return
    }

    const column = arr[to]
    const currentIndex = column.indexOf(cardId)
    const overRaw = over ? String(over.id) : ''
    const overIndex = column.indexOf(overRaw)
    const finalColumn =
      currentIndex !== -1 && overIndex !== -1 && currentIndex !== overIndex
        ? arrayMove(column, currentIndex, overIndex)
        : column
    const finalIndex = finalColumn.indexOf(cardId)

    // Placement par voisins visibles : indépendant de tout état d'affichage.
    const before = finalIndex > 0 ? finalColumn[finalIndex - 1] : null
    const after = finalIndex < finalColumn.length - 1 ? finalColumn[finalIndex + 1] : null

    await store.moveCardBetween(cardId, to, before, after)
    // Après l'écriture seulement : sinon l'ancien ordre réapparaîtrait un instant.
    setDragArrangement(null)
  }

  const submitList = async () => {
    const name = listDraft.trim()
    if (!name) {
      setAddingList(false)
      return
    }
    await store.createList(board.id, name)
    setListDraft('')
    setAddingList(false)
  }

  const activeCard = activeId ? cardsById.get(String(activeId)) : undefined
  const activeList =
    activeId && String(activeId).startsWith(LIST_PREFIX)
      ? lists.find((list) => list.id === String(activeId).slice(LIST_PREFIX.length))
      : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionForBoard}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={(event) => void onDragEnd(event)}
        onDragCancel={() => {
          setActiveId(null)
          setDragArrangement(null)
        }}
      >
        {/* `items-start` : chaque colonne prend la hauteur de son contenu, comme
            sur Trello. Le fond d'écran, lui, est posé au niveau de l'app entière. */}
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-3 pt-3 pb-3">
          <SortableContext
            items={lists.map((list) => `${LIST_PREFIX}${list.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                cards={(arrangement[list.id] ?? [])
                  .map((id) => cardsById.get(id))
                  .filter((card): card is Card => card !== undefined)}
                labelsById={labelsById}
                goalsById={goalsById}
                onOpenCard={onOpenCard}
                hasWallpaper={Boolean(wallpaper)}
              />
            ))}
          </SortableContext>

          <div className="w-72 shrink-0">
            {addingList ? (
              <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-2">
                <TextInput
                  autoFocus
                  value={listDraft}
                  placeholder="Nom de la liste…"
                  onChange={(event) => setListDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitList()
                    if (event.key === 'Escape') {
                      setListDraft('')
                      setAddingList(false)
                    }
                  }}
                />
                <div className="flex gap-1.5">
                  <Button variant="primary" size="sm" onClick={() => void submitList()}>
                    Ajouter
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAddingList(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start border border-dashed border-line bg-surface/70"
                onClick={() => setAddingList(true)}
              >
                + Ajouter une liste
              </Button>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            // Légèrement transparent : on voit le tableau se réorganiser dessous.
            <div className="w-72 opacity-80">
              <CardFace
                card={activeCard}
                labels={activeCard.labelIds
                  .map((id) => labelsById.get(id))
                  .filter((label): label is Label => label !== undefined)}
                goal={activeCard.goalId ? goalsById.get(activeCard.goalId) : undefined}
                dragging
              />
            </div>
          ) : activeList ? (
            activeList.collapsed ? (
              <div className="flex w-11 flex-col items-center gap-2 rounded-xl border border-accent bg-surface-2 py-2 shadow-lg">
                <span className="text-xs text-muted">↔</span>
                <span className="text-sm font-semibold [writing-mode:vertical-rl]">
                  {activeList.name}
                </span>
              </div>
            ) : (
              <div className="w-72 rounded-xl border border-accent bg-surface-2 px-2.5 py-2 text-sm font-semibold shadow-lg">
                {activeList.name}
              </div>
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

/** Choix du fond d'écran du tableau — une image stockée en local, comme le reste. */
export function WallpaperModal({
  boardId,
  url,
  onClose,
}: {
  boardId: ID
  url: string | null
  onClose: () => void
}) {
  const store = useStore()
  const input = useRef<HTMLInputElement>(null)

  return (
    <Modal
      open
      onClose={onClose}
      title="Fond du tableau"
      footer={
        <Button variant="primary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {url ? (
          <img
            src={url}
            alt="Fond actuel du tableau"
            className="max-h-44 w-full rounded-lg border border-line object-cover"
          />
        ) : (
          <p className="rounded-lg border border-dashed border-line p-5 text-center text-xs text-muted">
            Aucun fond pour l'instant.
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void store.setWallpaper(boardId, file)
            event.target.value = ''
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => input.current?.click()}>
            Choisir une image…
          </Button>
          {url ? (
            <ConfirmButton
              onConfirm={() => void store.clearWallpaper(boardId)}
              confirmLabel="Retirer ?"
            >
              Retirer le fond
            </ConfirmButton>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          Les grandes images sont réduites à 2 560 px de côté avant d'être envoyées.
        </p>
      </div>
    </Modal>
  )
}
