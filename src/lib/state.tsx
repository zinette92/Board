/**
 * État de l'application et **toutes** les mutations.
 *
 * Répartition volontaire : `repo.ts` ne sait que lire et écrire, ce fichier
 * détient les règles métier (ce que veut dire « terminée », ce qui se passe en
 * cascade quand on supprime une liste…). C'est ce qui a permis de passer
 * d'IndexedDB à Supabase sans toucher une ligne ici.
 *
 * Chaque action écrit d'abord, met l'état à jour ensuite : on ne peut donc
 * jamais afficher un état qui n'a pas été enregistré. Le prix est un aller-retour
 * réseau par mutation — acceptable pour un usage personnel, et bien plus sûr
 * qu'un affichage optimiste qui divergerait en cas d'échec.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  makeBoard,
  makeCard,
  makeChecklist,
  makeChecklistItem,
  makeGoal,
  makeLabel,
  makeList,
  makeReminder,
} from './create'
import { addDays, today } from './dates'
import { nowIso } from './id'
import { prepareWallpaper } from './image'
import {
  byPosition,
  needsRenumber,
  positionAtEnd,
  positionBetween,
  positionForIndex,
  renumber,
} from './ordering'
import * as repo from './repo'
import { markSeeded, seedIfEmpty } from './seed'
import type {
  Attachment,
  Board,
  Card,
  Checklist,
  ChecklistItem,
  Goal,
  GoalCategory,
  ID,
  Label,
  List,
  Reminder,
  Snapshot,
} from './types'

/** Au-delà, on refuse : ce sera aussi la limite raisonnable côté Supabase Storage. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const EMPTY: Snapshot = {
  boards: [],
  lists: [],
  cards: [],
  labels: [],
  goals: [],
  reminders: [],
}

type Row = { id: ID }

/** Remplace les lignes modifiées dans une collection, en conservant les autres. */
function upsert<T extends Row>(current: T[], changed: T[]): T[] {
  if (changed.length === 0) return current
  const byId = new Map(changed.map((row) => [row.id, row]))
  const merged = current.map((row) => byId.get(row.id) ?? row)
  const known = new Set(current.map((row) => row.id))
  return [...merged, ...changed.filter((row) => !known.has(row.id))]
}

function without<T extends Row>(current: T[], ids: ID[]): T[] {
  const drop = new Set(ids)
  return current.filter((row) => !drop.has(row.id))
}

export type Store = {
  ready: boolean
  error: string | null
  dismissError: () => void

  boards: Board[]
  lists: List[]
  cards: Card[]
  labels: Label[]
  goals: Goal[]
  reminders: Reminder[]

  updateBoard: (id: ID, patch: Partial<Board>) => Promise<void>
  deleteBoard: (id: ID) => Promise<void>

  createList: (boardId: ID, name: string) => Promise<List | undefined>
  updateList: (id: ID, patch: Partial<List>) => Promise<void>
  deleteList: (id: ID) => Promise<void>
  moveList: (id: ID, targetIndex: number) => Promise<void>

  createCard: (boardId: ID, listId: ID, title: string) => Promise<Card | undefined>
  updateCard: (id: ID, patch: Partial<Card>) => Promise<void>
  moveCard: (id: ID, toListId: ID, targetIndex: number) => Promise<void>
  moveCardBetween: (id: ID, toListId: ID, beforeId: ID | null, afterId: ID | null) => Promise<void>
  setCardDone: (id: ID, done: boolean) => Promise<void>
  archiveCard: (id: ID) => Promise<void>
  deleteCard: (id: ID) => Promise<void>

  addChecklist: (cardId: ID, title?: string) => Promise<Checklist | undefined>
  renameChecklist: (cardId: ID, checklistId: ID, title: string) => Promise<void>
  removeChecklist: (cardId: ID, checklistId: ID) => Promise<void>
  addChecklistItem: (cardId: ID, checklistId: ID, text: string) => Promise<void>
  updateChecklistItem: (
    cardId: ID,
    checklistId: ID,
    itemId: ID,
    patch: Partial<ChecklistItem>,
  ) => Promise<void>
  removeChecklistItem: (cardId: ID, checklistId: ID, itemId: ID) => Promise<void>

  createLabel: (name: string, color: string) => Promise<void>
  updateLabel: (id: ID, patch: Partial<Label>) => Promise<void>
  deleteLabel: (id: ID) => Promise<void>
  toggleCardLabel: (cardId: ID, labelId: ID) => Promise<void>

  createGoal: (category: GoalCategory) => Promise<Goal | undefined>
  updateGoal: (id: ID, patch: Partial<Goal>) => Promise<void>
  deleteGoal: (id: ID) => Promise<void>

  createReminder: (title: string) => Promise<Reminder | undefined>
  /** Valide (ou dévalide) UNE occurrence datée d'un rappel. */
  setReminderDone: (id: ID, on: string, done: boolean) => Promise<void>
  updateReminder: (id: ID, patch: Partial<Reminder>) => Promise<void>
  deleteReminder: (id: ID) => Promise<void>

  readAttachments: (cardId: ID) => Promise<Attachment[] | undefined>
  addAttachment: (cardId: ID, file: File) => Promise<void>
  removeAttachment: (cardId: ID, attachmentId: ID) => Promise<void>

  /**
   * URL d'objet du fond d'écran par tableau. Clé absente = pas encore chargé
   * (appeler `loadWallpaper`), null = ce tableau n'a pas de fond.
   */
  wallpapers: Record<ID, string | null>
  loadWallpaper: (boardId: ID) => Promise<void>
  setWallpaper: (boardId: ID, file: File) => Promise<void>
  clearWallpaper: (boardId: ID) => Promise<void>

  resetAll: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Miroir synchrone de l'état : les actions asynchrones lisent ici plutôt que
   * dans la valeur capturée par la clôture, qui peut être périmée après un
   * `await`.
   */
  const snapRef = useRef<Snapshot>(EMPTY)

  const [wallpapers, setWallpapers] = useState<Record<ID, string | null>>({})
  /** Chargements en cours : StrictMode et les re-rendus ne doivent pas relire le Blob. */
  const wallpaperLoads = useRef(new Set<ID>())

  const apply = useCallback((patch: Partial<Snapshot>) => {
    snapRef.current = { ...snapRef.current, ...patch }
    setSnapshot(snapRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await seedIfEmpty()
        const loaded = await repo.loadSnapshot()
        if (cancelled) return
        snapRef.current = loaded
        setSnapshot(loaded)
      } catch (cause) {
        if (!cancelled) setError(describe(cause))
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Toute action passe par ici : une écriture qui échoue ne modifie pas l'affichage. */
  const guard = useCallback(async <T,>(body: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await body()
    } catch (cause) {
      setError(describe(cause))
      return undefined
    }
  }, [])

  const actions = useMemo<
    Omit<Store, keyof Snapshot | 'ready' | 'error' | 'dismissError' | 'wallpapers'>
  >(() => {
    const snap = () => snapRef.current

    const cardsOfList = (listId: ID, exclude?: ID) =>
      snap()
        .cards.filter(
          (card) => card.listId === listId && card.archivedAt === null && card.id !== exclude,
        )
        .sort(byPosition)

    const listsOfBoard = (boardId: ID, exclude?: ID) =>
      snap()
        .lists.filter(
          (list) => list.boardId === boardId && list.archivedAt === null && list.id !== exclude,
        )
        .sort(byPosition)

    const saveCards = async (changed: Card[]) => {
      await repo.cards.putMany(changed)
      apply({ cards: upsert(snap().cards, changed) })
    }

    const saveLists = async (changed: List[]) => {
      await repo.lists.putMany(changed)
      apply({ lists: upsert(snap().lists, changed) })
    }

    /** Toutes les mutations de checklists passent par là : relire, transformer, écrire. */
    const patchChecklists = async (cardId: ID, map: (lists: Checklist[]) => Checklist[]) => {
      const card = snap().cards.find((item) => item.id === cardId)
      if (!card) return
      const next = { ...card, checklists: map(card.checklists), updatedAt: nowIso() }
      await repo.cards.put(next)
      apply({ cards: upsert(snap().cards, [next]) })
    }

    /**
     * Place une carte à une position donnée, en renumérotant si les flottants
     * s'épuisent. Déplacer une carte ne touche JAMAIS à son état terminé :
     * comme sur Trello, « terminée » vit sur la carte (`doneAt`), et les listes
     * sont toutes équivalentes.
     */
    const placeCard = async (card: Card, toListId: ID, position: number) => {
      const toList = snap().lists.find((list) => list.id === toListId)
      if (!toList) return
      const moved: Card = {
        ...card,
        listId: toListId,
        boardId: toList.boardId,
        position,
        updatedAt: nowIso(),
      }
      const resulting = [...cardsOfList(toListId, card.id), moved].sort(byPosition)
      await saveCards(
        needsRenumber(resulting.map((item) => item.position)) ? renumber(resulting) : [moved],
      )
    }

    const placeCardAtIndex = async (card: Card, toListId: ID, targetIndex: number) => {
      const siblings = cardsOfList(toListId, card.id)
      const index = Math.max(0, Math.min(targetIndex, siblings.length))
      await placeCard(
        card,
        toListId,
        positionForIndex(
          siblings.map((sibling) => sibling.position),
          index,
        ),
      )
    }

    return {
      /* ---------------------------------------------------------------- Tableaux */
      updateBoard: async (id, patch) => {
        const board = snap().boards.find((item) => item.id === id)
        if (!board) return
        const next = { ...board, ...patch, updatedAt: nowIso() }
        await repo.boards.put(next)
        apply({ boards: upsert(snap().boards, [next]) })
      },

      deleteBoard: async (id) => {
        const current = snap()
        const listIds = current.lists.filter((list) => list.boardId === id).map((list) => list.id)
        const doomedCards = current.cards.filter((card) => card.boardId === id)
        await Promise.all(
          doomedCards.map(async (card) => {
            const files = await repo.attachments.ofCard(card.id)
            await repo.attachments.removeMany(files.map((file) => file.id))
          }),
        )
        await repo.cards.removeMany(doomedCards.map((card) => card.id))
        await repo.lists.removeMany(listIds)
        await repo.wallpapers.remove(id)
        await repo.boards.remove(id)
        setWallpapers((prev) => {
          const { [id]: _removed, ...rest } = prev
          return rest
        })
        apply({
          boards: without(current.boards, [id]),
          lists: without(current.lists, listIds),
          cards: without(
            current.cards,
            doomedCards.map((card) => card.id),
          ),
        })
      },

      /* ------------------------------------------------------------------ Listes */
      createList: async (boardId, name) => {
        const list = makeList(
          boardId,
          name,
          positionAtEnd(listsOfBoard(boardId).map((item) => item.position)),
        )
        await repo.lists.put(list)
        apply({ lists: upsert(snap().lists, [list]) })
        return list
      },

      updateList: async (id, patch) => {
        const list = snap().lists.find((item) => item.id === id)
        if (!list) return
        const next = { ...list, ...patch, updatedAt: nowIso() }
        await repo.lists.put(next)
        apply({ lists: upsert(snap().lists, [next]) })
      },

      deleteList: async (id) => {
        const current = snap()
        const doomedCards = current.cards.filter((card) => card.listId === id)
        await Promise.all(
          doomedCards.map(async (card) => {
            const files = await repo.attachments.ofCard(card.id)
            await repo.attachments.removeMany(files.map((file) => file.id))
          }),
        )
        await repo.cards.removeMany(doomedCards.map((card) => card.id))
        await repo.lists.remove(id)
        apply({
          lists: without(current.lists, [id]),
          cards: without(
            current.cards,
            doomedCards.map((card) => card.id),
          ),
        })
      },

      moveList: async (id, targetIndex) => {
        const list = snap().lists.find((item) => item.id === id)
        if (!list) return
        const siblings = listsOfBoard(list.boardId, id)
        const index = Math.max(0, Math.min(targetIndex, siblings.length))
        const moved: List = {
          ...list,
          position: positionForIndex(
            siblings.map((sibling) => sibling.position),
            index,
          ),
          updatedAt: nowIso(),
        }
        const resulting = [...siblings, moved].sort(byPosition)
        await saveLists(
          needsRenumber(resulting.map((item) => item.position)) ? renumber(resulting) : [moved],
        )
      },

      /* ------------------------------------------------------------------ Cartes */
      createCard: async (boardId, listId, title) => {
        const card = makeCard(
          boardId,
          listId,
          title,
          positionAtEnd(cardsOfList(listId).map((item) => item.position)),
        )
        await repo.cards.put(card)
        apply({ cards: upsert(snap().cards, [card]) })
        return card
      },

      /** `listId` et `position` sont ignorés ici : le placement passe par `moveCard`. */
      updateCard: async (id, patch) => {
        const card = snap().cards.find((item) => item.id === id)
        if (!card) return
        const { listId: _listId, position: _position, ...safe } = patch
        const next = { ...card, ...safe, updatedAt: nowIso() }
        await repo.cards.put(next)
        apply({ cards: upsert(snap().cards, [next]) })
      },

      moveCard: async (id, toListId, targetIndex) => {
        const card = snap().cards.find((item) => item.id === id)
        if (card) await placeCardAtIndex(card, toListId, targetIndex)
      },

      /**
       * Placement par voisinage plutôt que par index : c'est ce qu'utilise le
       * glisser-déposer. Un index serait faux dès qu'un filtre masque des cartes,
       * alors que « entre celle-ci et celle-là » reste juste dans tous les cas.
       */
      moveCardBetween: async (id, toListId, beforeId, afterId) => {
        const current = snap()
        const card = current.cards.find((item) => item.id === id)
        if (!card) return
        const before = beforeId ? current.cards.find((item) => item.id === beforeId) : undefined
        const after = afterId ? current.cards.find((item) => item.id === afterId) : undefined
        await placeCard(card, toListId, positionBetween(before?.position, after?.position))
      },

      /** Coche/décoche le rond « terminée » de la carte, sans la déplacer — modèle Trello. */
      setCardDone: async (id, done) => {
        const card = snap().cards.find((item) => item.id === id)
        if (!card) return
        const next = { ...card, doneAt: done ? nowIso() : null, updatedAt: nowIso() }
        await repo.cards.put(next)
        apply({ cards: upsert(snap().cards, [next]) })
      },

      archiveCard: async (id) => {
        const card = snap().cards.find((item) => item.id === id)
        if (!card) return
        const next = { ...card, archivedAt: nowIso(), updatedAt: nowIso() }
        await repo.cards.put(next)
        apply({ cards: upsert(snap().cards, [next]) })
      },

      deleteCard: async (id) => {
        const files = await repo.attachments.ofCard(id)
        await repo.attachments.removeMany(files.map((file) => file.id))
        await repo.cards.remove(id)
        apply({ cards: without(snap().cards, [id]) })
      },

      /* -------------------------------------------------------------- Checklists */
      addChecklist: async (cardId, title = 'Checklist') => {
        const card = snap().cards.find((item) => item.id === cardId)
        if (!card) return undefined
        const checklist = makeChecklist(title)
        const next = { ...card, checklists: [...card.checklists, checklist], updatedAt: nowIso() }
        await repo.cards.put(next)
        apply({ cards: upsert(snap().cards, [next]) })
        return checklist
      },

      renameChecklist: async (cardId, checklistId, title) => {
        await patchChecklists(cardId, (lists) =>
          lists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, title: title.trim() || checklist.title }
              : checklist,
          ),
        )
      },

      removeChecklist: async (cardId, checklistId) => {
        await patchChecklists(cardId, (lists) =>
          lists.filter((checklist) => checklist.id !== checklistId),
        )
      },

      addChecklistItem: async (cardId, checklistId, text) => {
        if (!text.trim()) return
        await patchChecklists(cardId, (lists) =>
          lists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, items: [...checklist.items, makeChecklistItem(text)] }
              : checklist,
          ),
        )
      },

      updateChecklistItem: async (cardId, checklistId, itemId, patch) => {
        await patchChecklists(cardId, (lists) =>
          lists.map((checklist) =>
            checklist.id === checklistId
              ? {
                  ...checklist,
                  items: checklist.items.map((item) =>
                    item.id === itemId ? { ...item, ...patch } : item,
                  ),
                }
              : checklist,
          ),
        )
      },

      removeChecklistItem: async (cardId, checklistId, itemId) => {
        await patchChecklists(cardId, (lists) =>
          lists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, items: checklist.items.filter((item) => item.id !== itemId) }
              : checklist,
          ),
        )
      },

      /* -------------------------------------------------------------- Étiquettes */
      createLabel: async (name, color) => {
        const label = makeLabel(name, color)
        await repo.labels.put(label)
        apply({ labels: upsert(snap().labels, [label]) })
      },

      updateLabel: async (id, patch) => {
        const label = snap().labels.find((item) => item.id === id)
        if (!label) return
        const next = { ...label, ...patch }
        await repo.labels.put(next)
        apply({ labels: upsert(snap().labels, [next]) })
      },

      deleteLabel: async (id) => {
        const current = snap()
        // Sans ce détachement, les cartes garderaient un identifiant fantôme.
        const touched = current.cards
          .filter((card) => card.labelIds.includes(id))
          .map((card) => ({
            ...card,
            labelIds: card.labelIds.filter((labelId) => labelId !== id),
            updatedAt: nowIso(),
          }))
        if (touched.length > 0) await repo.cards.putMany(touched)
        await repo.labels.remove(id)
        apply({
          labels: without(current.labels, [id]),
          cards: upsert(current.cards, touched),
        })
      },

      toggleCardLabel: async (cardId, labelId) => {
        const card = snap().cards.find((item) => item.id === cardId)
        if (!card) return
        const next = {
          ...card,
          labelIds: card.labelIds.includes(labelId)
            ? card.labelIds.filter((id) => id !== labelId)
            : [...card.labelIds, labelId],
          updatedAt: nowIso(),
        }
        await repo.cards.put(next)
        apply({ cards: upsert(snap().cards, [next]) })
      },

      /* --------------------------------------------------------------- Objectifs */
      createGoal: async (category) => {
        const goal = makeGoal(category, positionAtEnd(snap().goals.map((item) => item.position)))
        await repo.goals.put(goal)
        apply({ goals: upsert(snap().goals, [goal]) })
        return goal
      },

      updateGoal: async (id, patch) => {
        const goal = snap().goals.find((item) => item.id === id)
        if (!goal) return
        const next = { ...goal, ...patch, updatedAt: nowIso() }
        await repo.goals.put(next)
        apply({ goals: upsert(snap().goals, [next]) })
      },

      deleteGoal: async (id) => {
        const current = snap()
        // Les tâches survivent à leur objectif : on les détache, on ne les tue pas.
        const touched = current.cards
          .filter((card) => card.goalId === id)
          .map((card) => ({ ...card, goalId: null, updatedAt: nowIso() }))
        if (touched.length > 0) await repo.cards.putMany(touched)
        await repo.goals.remove(id)
        apply({
          goals: without(current.goals, [id]),
          cards: upsert(current.cards, touched),
        })
      },

      /* ----------------------------------------------------------- Pièces jointes */
      readAttachments: (cardId) => repo.attachments.ofCard(cardId),

      addAttachment: async (cardId, file) => {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `« ${file.name} » pèse ${(file.size / 1024 / 1024).toFixed(1)} Mo, au-delà de la limite de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} Mo.`,
          )
        }
        await repo.attachments.add(cardId, file)
        const card = snap().cards.find((item) => item.id === cardId)
        if (card) {
          const next = {
            ...card,
            attachmentCount: card.attachmentCount + 1,
            updatedAt: nowIso(),
          }
          await repo.cards.put(next)
          apply({ cards: upsert(snap().cards, [next]) })
        }
      },

      removeAttachment: async (cardId, attachmentId) => {
        await repo.attachments.remove(attachmentId)
        const card = snap().cards.find((item) => item.id === cardId)
        if (card) {
          const next = {
            ...card,
            attachmentCount: Math.max(0, card.attachmentCount - 1),
            updatedAt: nowIso(),
          }
          await repo.cards.put(next)
          apply({ cards: upsert(snap().cards, [next]) })
        }
      },

      /* ------------------------------------------------------------------ Rappels */
      createReminder: async (title) => {
        const reminder = makeReminder(title)
        await repo.reminders.put(reminder)
        apply({ reminders: upsert(snap().reminders, [reminder]) })
        return reminder
      },

      updateReminder: async (id, patch) => {
        const reminder = snap().reminders.find((item) => item.id === id)
        if (!reminder) return
        const next = { ...reminder, ...patch, updatedAt: nowIso() }
        await repo.reminders.put(next)
        apply({ reminders: upsert(snap().reminders, [next]) })
      },

      setReminderDone: async (id, on, done) => {
        const reminder = snap().reminders.find((item) => item.id === id)
        if (!reminder) return
        const kept = reminder.doneOn.filter((day) => day !== on)
        // Élagage : un rappel quotidien accumulerait sinon des milliers de
        // dates. Au-delà d'un an, plus rien ne peut être en attente.
        const floor = addDays(today(), -400)
        const doneOn = (done ? [...kept, on] : kept).filter((day) => day >= floor).sort()
        const next = { ...reminder, doneOn, updatedAt: nowIso() }
        await repo.reminders.put(next)
        apply({ reminders: upsert(snap().reminders, [next]) })
      },

      deleteReminder: async (id) => {
        await repo.reminders.remove(id)
        apply({ reminders: without(snap().reminders, [id]) })
      },

      /* -------------------------------------------------------------- Fond d'écran */
      loadWallpaper: async (boardId) => {
        if (wallpaperLoads.current.has(boardId)) return
        wallpaperLoads.current.add(boardId)
        const url = await repo.wallpapers.get(boardId)
        setWallpapers((prev) => ({ ...prev, [boardId]: url }))
      },

      setWallpaper: async (boardId, file) => {
        const blob = await prepareWallpaper(file)
        const url = await repo.wallpapers.put(boardId, blob)
        setWallpapers((prev) => ({ ...prev, [boardId]: url }))
      },

      clearWallpaper: async (boardId) => {
        await repo.wallpapers.remove(boardId)
        setWallpapers((prev) => ({ ...prev, [boardId]: null }))
      },

      /* ----------------------------------------------------------------- Réglages */
      resetAll: async () => {
        await repo.wipe()
        setWallpapers({})
        wallpaperLoads.current.clear()
        // Sans ce drapeau, le jeu de démonstration reviendrait au rechargement.
        await markSeeded()
        const board = makeBoard('Mon tableau', '🗂️', 1000)
        const seedLists = [
          makeList(board.id, 'À faire', 1000),
          makeList(board.id, 'En cours', 2000),
          makeList(board.id, 'Terminé', 3000, { color: 'green' }),
        ]
        await repo.boards.put(board)
        await repo.lists.putMany(seedLists)
        snapRef.current = {
          boards: [board],
          lists: seedLists,
          cards: [],
          labels: [],
          goals: [],
          reminders: [],
        }
        setSnapshot(snapRef.current)
      },
    }
  }, [apply])

  /** Les actions exposées sont enrobées : une erreur remonte à l'écran au lieu de disparaître. */
  const guarded = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const [name, fn] of Object.entries(actions)) {
      out[name] = (...args: unknown[]) =>
        guard(() => (fn as (...a: unknown[]) => Promise<unknown>)(...args))
    }
    return out as unknown as Omit<
      Store,
      keyof Snapshot | 'ready' | 'error' | 'dismissError' | 'wallpapers'
    >
  }, [actions, guard])

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      dismissError: () => setError(null),
      wallpapers,
      ...snapshot,
      ...guarded,
    }),
    [ready, error, wallpapers, snapshot, guarded],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore doit être utilisé dans <StoreProvider>.')
  return value
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
