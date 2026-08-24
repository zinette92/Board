import { useMemo, useState } from 'react'

import { Button, Pill, TextInput, cx } from '../../components/ui'
import { useStore } from '../../lib/state'
import type { Card, ID, List } from '../../lib/types'

const MAX_CARDS = 12
const MAX_LISTS = 6

/**
 * « Parcourir » : la recherche globale de l'en-tête, façon Trello. Elle fouille
 * les cartes ET les listes, actives comme **archivées** — c'est le seul endroit
 * d'où l'on peut retrouver (et restaurer) une carte archivée.
 */
export function SearchBar({
  onOpenCard,
  onOpenBoard,
}: {
  onOpenCard: (id: ID) => void
  onOpenBoard: (boardId: ID) => void
}) {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const needle = query.trim().toLowerCase()

  /** Les archivés en dernier : le vivant d'abord. */
  const archivedLast = (a: { archivedAt: string | null }, b: { archivedAt: string | null }) =>
    Number(a.archivedAt !== null) - Number(b.archivedAt !== null)

  const results = useMemo(() => {
    if (!needle) return { cards: [] as Card[], lists: [] as List[] }
    return {
      cards: store.cards
        .filter((card) => card.title.toLowerCase().includes(needle))
        .sort(archivedLast)
        .slice(0, MAX_CARDS),
      lists: store.lists
        .filter((list) => list.name.toLowerCase().includes(needle))
        .sort(archivedLast)
        .slice(0, MAX_LISTS),
    }
  }, [store.cards, store.lists, needle])

  const boardsById = useMemo(
    () => new Map(store.boards.map((board) => [board.id, board] as const)),
    [store.boards],
  )

  const close = () => setOpen(false)
  const showPanel = open && needle.length > 0

  return (
    <div className="relative min-w-40 max-w-xl flex-1">
      <TextInput
        value={query}
        placeholder="Parcourir…"
        className="h-8 py-0"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            close()
            event.currentTarget.blur()
          }
        }}
      />

      {showPanel ? (
        <>
          {/* Voile transparent : un clic hors du panneau le referme. */}
          <div className="fixed inset-0 z-40" onMouseDown={close} />
          <div className="absolute top-9 right-0 left-0 z-50 max-h-96 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-xl backdrop-blur-lg">
            {results.cards.length === 0 && results.lists.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted">
                Aucun résultat pour « {query.trim()} ».
              </p>
            ) : (
              <>
                {results.cards.length > 0 ? (
                  <p className="px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                    Cartes
                  </p>
                ) : null}
                {results.cards.map((card) => (
                  <div key={card.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        close()
                        onOpenCard(card.id)
                      }}
                    >
                      <span className="shrink-0">{boardsById.get(card.boardId)?.emoji}</span>
                      <span
                        className={cx(
                          'min-w-0 flex-1 truncate',
                          card.doneAt !== null && 'text-muted line-through',
                        )}
                      >
                        {card.title}
                      </span>
                      {card.archivedAt !== null ? <Pill tone="warn">archivée</Pill> : null}
                    </button>
                    {card.archivedAt !== null ? (
                      <Button
                        size="sm"
                        onClick={() => void store.updateCard(card.id, { archivedAt: null })}
                      >
                        ↩ Restaurer
                      </Button>
                    ) : null}
                  </div>
                ))}

                {results.lists.length > 0 ? (
                  <p className="px-2 pt-2 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                    Listes
                  </p>
                ) : null}
                {results.lists.map((list) => {
                  const count = store.cards.filter(
                    (card) => card.listId === list.id && card.archivedAt === null,
                  ).length
                  return (
                    <div key={list.id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          close()
                          onOpenBoard(list.boardId)
                        }}
                      >
                        <span className="shrink-0">{boardsById.get(list.boardId)?.emoji}</span>
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        <span className="shrink-0 text-xs text-muted">{count} carte(s)</span>
                        {list.archivedAt !== null ? <Pill tone="warn">archivée</Pill> : null}
                      </button>
                      {list.archivedAt !== null ? (
                        <Button
                          size="sm"
                          onClick={() => void store.updateList(list.id, { archivedAt: null })}
                        >
                          ↩ Restaurer
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
