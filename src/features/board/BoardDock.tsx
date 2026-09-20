import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { Button, IconButton, TextInput, cx } from '../../components/ui'
import { DOCK_HINTS, DOCK_NAMES, DOCK_SLOTS, dockListOf, isDockList } from '../../lib/dock'
import type { DockSlot } from '../../lib/dock'
import { byPosition } from '../../lib/ordering'
import { useStore } from '../../lib/state'
import type { Card, ID, List } from '../../lib/types'
import { CardFace } from './CardTile'

/**
 * Pictogrammes monochromes, tracés au trait et teintés par `currentColor` :
 * ils suivent donc le thème et l'état du bouton sans variante dédiée.
 */
function DockIcon({ slot, size = 21 }: { slot: DockSlot; size?: number }) {
  const paths: Record<DockSlot, ReactNode> = {
    // Deux cartes empilées : un gabarit dont on tire des copies.
    models: (
      <>
        <rect x="3" y="7" width="13" height="14" rx="2" />
        <path d="M7 4h11a2 2 0 0 1 2 2v11" />
      </>
    ),
    // Une punaise, vue de face.
    pin: (
      <>
        <path d="M12 16.5V21" />
        <path d="M8 3h8l-1.2 6.2 2.6 2.5a1 1 0 0 1-.7 1.8H7.3a1 1 0 0 1-.7-1.8l2.6-2.5L8 3z" />
      </>
    ),
    // Un bac de réception, et ce qui y tombe.
    inbox: (
      <>
        <path d="M12 3v7" />
        <path d="m9 7 3 3 3-3" />
        <path d="M4 14h4l1.5 2.5h5L16 14h4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" />
      </>
    ),
    // Une file d'attente : des lignes à puces.
    backlog: (
      <>
        <path d="M8.5 6H20M8.5 12H20M8.5 18H20" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[slot]}
    </svg>
  )
}

/**
 * Barre flottante du bas. Chaque section ouvre son panneau au-dessus d'elle ;
 * une carte s'y ouvre au clic et part vers une colonne d'un geste.
 */
export function BoardDock({
  boardId,
  lists,
  onOpenCard,
}: {
  boardId: ID
  /** Toutes les listes du tableau : les sections s'y retrouvent par nom. */
  lists: List[]
  onOpenCard: (id: ID) => void
}) {
  const store = useStore()
  const [open, setOpen] = useState<DockSlot | null>(null)
  const [draft, setDraft] = useState('')
  /** Carte dont on choisit la destination : les colonnes s'affichent sous elle. */
  const [sending, setSending] = useState<ID | null>(null)

  // Échap referme le panneau — même geste que partout ailleurs.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /**
   * MODELS est par définition la réserve de gabarits. Sa case « Liste de
   * modèles » n'est plus atteignable — la liste n'est plus une colonne — et
   * sans le drapeau, les automatisations n'y verraient aucune carte. On répare
   * donc une fois, en silence ; l'écriture ne part que si le drapeau manque.
   */
  useEffect(() => {
    const models = dockListOf(lists, 'models')
    if (models && !models.isTemplate) void store.updateList(models.id, { isTemplate: true })
  }, [lists, store])

  const sections = useMemo(() => {
    const cards = store.cards.filter((card) => card.archivedAt === null)
    return DOCK_SLOTS.map((slot) => {
      const list = dockListOf(lists, slot)
      return {
        slot,
        list,
        cards: list ? cards.filter((card) => card.listId === list.id).sort(byPosition) : [],
      }
    })
  }, [lists, store.cards])

  /** Colonnes du tableau : tout ce qui n'est pas une section de la barre. */
  const columns = useMemo(() => lists.filter((list) => !isDockList(list)), [lists])

  const labelsById = useMemo(
    () => new Map(store.labels.map((label) => [label.id, label] as const)),
    [store.labels],
  )
  const goalsById = useMemo(
    () => new Map(store.goals.map((goal) => [goal.id, goal] as const)),
    [store.goals],
  )

  const active = sections.find((section) => section.slot === open)

  /** La liste d'une section n'est créée qu'au moment où l'on y dépose quelque chose. */
  const listFor = async (slot: DockSlot): Promise<List | undefined> => {
    const existing = dockListOf(lists, slot)
    if (existing) return existing
    const created = await store.createList(boardId, DOCK_NAMES[slot])
    // MODELS est la réserve de gabarits : les automatisations n'y puisent que
    // si la liste est marquée comme telle.
    if (created && slot === 'models') await store.updateList(created.id, { isTemplate: true })
    return created
  }

  const add = async (slot: DockSlot) => {
    const title = draft.trim()
    if (!title) return
    const list = await listFor(slot)
    if (!list) return
    await store.createCard(boardId, list.id, title)
    setDraft('')
  }

  /**
   * La carte s'en va vers une colonne ou vers une autre section — une idée
   * mûrie passe d'INBOX à BACKLOG sans détour par le tableau. Un modèle fait
   * exception : c'est une **copie** qui part, l'original doit rester.
   */
  const send = async (card: Card, listId: ID, model: boolean) => {
    setSending(null)
    const moved = model ? await store.duplicateCard(card.id) : card
    if (!moved) return
    await store.moveCard(moved.id, listId, Number.MAX_SAFE_INTEGER)
  }

  /** Vers une section : sa liste est créée si elle n'existait pas encore. */
  const sendToSlot = async (card: Card, slot: DockSlot, model: boolean) => {
    const list = await listFor(slot)
    if (list) await send(card, list.id, model)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 p-3">
      {active ? (
        <div className="pointer-events-auto flex max-h-[min(60vh,32rem)] w-[min(94vw,26rem)] flex-col rounded-2xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <DockIcon slot={active.slot} />
            <span className="font-display text-sm font-bold">{DOCK_NAMES[active.slot]}</span>
            <span className="text-xs text-muted tabular-nums">{active.cards.length}</span>
            <IconButton label="Fermer" className="ml-auto" onClick={() => setOpen(null)}>
              ✕
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <p className="mb-2 text-xs text-muted">{DOCK_HINTS[active.slot]}</p>

            {active.cards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                Rien ici pour l'instant.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {active.cards.map((card) => (
                  <li key={card.id} data-card-id={card.id} className="flex flex-col gap-1">
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        onClick={() => onOpenCard(card.id)}
                      >
                        <CardFace
                          card={card}
                          labels={card.labelIds
                            .map((id) => labelsById.get(id))
                            .filter((label) => label !== undefined)}
                          goal={card.goalId ? goalsById.get(card.goalId) : undefined}
                          onToggleDone={() => void store.setCardDone(card.id, card.doneAt === null)}
                          onToggleWaiting={() => void store.updateCard(card.id, { waiting: false })}
                        />
                      </button>
                      <IconButton
                        label={
                          active.slot === 'models'
                            ? 'Copier vers une colonne'
                            : 'Envoyer vers une colonne'
                        }
                        onClick={() => setSending(sending === card.id ? null : card.id)}
                      >
                        →
                      </IconButton>
                    </div>

                    {sending === card.id ? (
                      <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2/60 p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="mr-1 text-[11px] text-muted">Dans la barre</span>
                          {DOCK_SLOTS.filter((slot) => slot !== active.slot).map((slot) => (
                            <Button
                              key={slot}
                              size="sm"
                              onClick={() =>
                                void sendToSlot(card, slot, active.slot === 'models')
                              }
                            >
                              <DockIcon slot={slot} size={13} />
                              {DOCK_NAMES[slot]}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="mr-1 text-[11px] text-muted">Sur le tableau</span>
                          {columns.length === 0 ? (
                            <span className="text-xs text-muted">aucune colonne</span>
                          ) : (
                            columns.map((list) => (
                              <Button
                                key={list.id}
                                size="sm"
                                onClick={() => void send(card, list.id, active.slot === 'models')}
                              >
                                {active.slot === 'models' ? '⧉ ' : '→ '}
                                {list.name}
                              </Button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line p-2">
            <TextInput
              value={draft}
              placeholder={`Ajouter dans ${DOCK_NAMES[active.slot]}…`}
              aria-label={`Ajouter une carte dans ${DOCK_NAMES[active.slot]}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void add(active.slot)
                if (event.key === 'Escape') setDraft('')
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-2xl backdrop-blur">
        {sections.map((section) => (
          <button
            key={section.slot}
            type="button"
            title={`${DOCK_NAMES[section.slot]} — ${DOCK_HINTS[section.slot]}`}
            aria-label={DOCK_NAMES[section.slot]}
            aria-pressed={open === section.slot}
            onClick={() => {
              setOpen(open === section.slot ? null : section.slot)
              setSending(null)
              setDraft('')
            }}
            className={cx(
              'relative grid size-11 place-items-center rounded-xl transition-colors',
              open === section.slot
                ? 'bg-accent text-accent-ink'
                : 'text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <DockIcon slot={section.slot} />
            {section.cards.length > 0 ? (
              <span
                className={cx(
                  'absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums',
                  open === section.slot
                    ? 'bg-surface text-ink'
                    : 'bg-surface-2 text-muted ring-1 ring-line',
                )}
              >
                {section.cards.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
