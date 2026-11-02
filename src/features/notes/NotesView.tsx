import { useMemo, useRef, useState } from 'react'

import {
  Button,
  ConfirmButton,
  InlineEdit,
  Modal,
  Select,
  TextInput,
  cx,
} from '../../components/ui'
import { RichText } from '../../components/RichText'
import { formatInstant } from '../../lib/dates'
import { byPosition } from '../../lib/ordering'
import { chipStyle } from '../../lib/palette'
import { useStore } from '../../lib/state'
import type { ID, Note, NoteCategory } from '../../lib/types'

/** Filtre courant : toutes les notes, une catégorie, ou celles sans catégorie. */
type Filter = { kind: 'all' } | { kind: 'none' } | { kind: 'category'; id: ID }

/** Couleur d'une catégorie encore à naître. */
const NEW_COLOR = '#64748b'

/**
 * Le texte d'une note sans son balisage — pour l'aperçu d'une vignette.
 * Les images partent en premier : une seule suffirait à remplir l'aperçu de
 * base64.
 */
function excerpt(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_`[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Le carnet : des notes rangées par catégories que le user crée lui-même.
 *
 * Volontairement à part du tableau : une note n'est pas une tâche, elle ne se
 * termine pas et n'avance aucun objectif. Elle s'archive quand elle a fait son
 * temps — rangée, jamais perdue.
 */
export function NotesView({ hasWallpaper }: { hasWallpaper: boolean }) {
  const store = useStore()
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState<ID | null>(null)
  /**
   * Le corps de la note ouverte, tapé mais pas encore écrit.
   *
   * L'éditeur prévient à chaque frappe : écrire en base à chaque lettre ferait
   * un aller-retour réseau par caractère. On garde donc la saisie ici et on
   * l'enregistre à la fermeture, comme les pages du plan de travail.
   */
  const [draftBody, setDraftBody] = useState<string | null>(null)
  const savedBody = useRef<string | null>(null)
  const [draftCategory, setDraftCategory] = useState<string | null>(null)

  const categories = useMemo(
    () => [...store.noteCategories].sort(byPosition),
    [store.noteCategories],
  )
  const categoriesById = useMemo(
    () => new Map(categories.map((item) => [item.id, item] as const)),
    [categories],
  )

  /** Les notes du filtre, les plus récentes d'abord. */
  const notes = useMemo(() => {
    const kept = store.notes.filter((note) => {
      if ((note.archivedAt !== null) !== showArchived) return false
      if (filter.kind === 'all') return true
      if (filter.kind === 'none') return note.categoryId === null
      return note.categoryId === filter.id
    })
    return kept.sort(byPosition)
  }, [store.notes, filter, showArchived])

  /** Combien de notes vivantes par catégorie — l'archive ne se compte pas. */
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const note of store.notes) {
      if (note.archivedAt !== null) continue
      const key = note.categoryId ?? ''
      out.set(key, (out.get(key) ?? 0) + 1)
    }
    return out
  }, [store.notes])

  const open = openId ? store.notes.find((note) => note.id === openId) : undefined
  const current = filter.kind === 'category' ? categoriesById.get(filter.id) : undefined

  const openNote = (note: Note) => {
    setDraftBody(note.body)
    savedBody.current = note.body
    setOpenId(note.id)
  }

  /** Fermer enregistre ce qui a été tapé — rien ne se perd en route. */
  const closeNote = () => {
    if (openId !== null && draftBody !== null && draftBody !== savedBody.current) {
      void store.updateNote(openId, { body: draftBody })
    }
    setDraftBody(null)
    savedBody.current = null
    setOpenId(null)
  }

  const addNote = async () => {
    const created = await store.createNote(filter.kind === 'category' ? filter.id : null)
    if (created) openNote(created)
  }

  const addCategory = async () => {
    const name = (draftCategory ?? '').trim()
    setDraftCategory(null)
    if (!name) return
    const created = await store.createNoteCategory(name, NEW_COLOR)
    if (created) setFilter({ kind: 'category', id: created.id })
  }

  const chip = (label: string, count: number | undefined, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-line text-muted hover:border-accent/60 hover:text-ink',
      )}
    >
      {label}
      {count !== undefined ? <span className="text-muted tabular-nums">{count}</span> : null}
    </button>
  )

  return (
    <div
      className={cx(
        'flex flex-col gap-4',
        // Sur fond d'écran, le carnet se pose sur son propre cadre : sans lui,
        // le texte se lirait à même la photo.
        hasWallpaper && 'rounded-2xl border border-line bg-bg p-4 shadow-lg',
      )}
    >
      {/* Les catégories, en filtres. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chip('Toutes', store.notes.filter((note) => note.archivedAt === null).length, filter.kind === 'all', () =>
          setFilter({ kind: 'all' }),
        )}
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setFilter({ kind: 'category', id: category.id })}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
              filter.kind === 'category' && filter.id === category.id
                ? 'ring-2 ring-accent'
                : 'opacity-75 hover:opacity-100',
            )}
            style={chipStyle(category.color)}
          >
            {category.name}
            <span className="tabular-nums opacity-70">{counts.get(category.id) ?? 0}</span>
          </button>
        ))}
        {(counts.get('') ?? 0) > 0
          ? chip('Sans catégorie', counts.get(''), filter.kind === 'none', () =>
              setFilter({ kind: 'none' }),
            )
          : null}

        {draftCategory === null ? (
          <Button size="sm" variant="ghost" onClick={() => setDraftCategory('')}>
            + Catégorie
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <TextInput
              autoFocus
              value={draftCategory}
              placeholder="Nom de la catégorie…"
              className="h-7 w-44 py-0 text-xs"
              onChange={(event) => setDraftCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addCategory()
                if (event.key === 'Escape') setDraftCategory(null)
              }}
            />
            <Button size="sm" variant="primary" onClick={() => void addCategory()}>
              Créer
            </Button>
          </span>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Archivées
        </label>
      </div>

      {/* La catégorie choisie se renomme, se recolore, se supprime. */}
      {current ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <InlineEdit
            value={current.name}
            onSubmit={(name) => store.updateNoteCategory(current.id, { name })}
            className="text-sm font-semibold"
            placeholder="Nom de la catégorie"
          />
          <label
            className="relative size-6 shrink-0 cursor-pointer rounded-full border border-line"
            style={{ backgroundColor: current.color }}
            title="Couleur de la catégorie"
          >
            <input
              type="color"
              value={current.color}
              onChange={(event) => store.updateNoteCategory(current.id, { color: event.target.value })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <ConfirmButton
            size="sm"
            className="ml-auto"
            confirmLabel="Supprimer la catégorie ?"
            onConfirm={() => {
              setFilter({ kind: 'all' })
              void store.deleteNoteCategory(current.id)
            }}
          >
            Supprimer
          </ConfirmButton>
          <span className="w-full text-[11px] text-muted">
            Supprimer une catégorie ne supprime pas ses notes : elles se retrouvent sans catégorie.
          </span>
        </div>
      ) : null}

      <div>
        <Button size="sm" variant="primary" onClick={() => void addNote()}>
          + Nouvelle note
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          {showArchived ? 'Aucune note archivée.' : 'Aucune note ici pour l’instant.'}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => openNote(note)}
                className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent/60"
              >
                <span className="flex items-center gap-1.5">
                  {note.categoryId && categoriesById.has(note.categoryId) ? (
                    <span
                      className="rounded border px-1.5 py-px text-[10px] leading-tight font-medium"
                      style={chipStyle(categoriesById.get(note.categoryId)!.color)}
                    >
                      {categoriesById.get(note.categoryId)!.name}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[10px] text-muted">
                    {formatInstant(note.updatedAt)}
                  </span>
                </span>
                <span className="text-sm font-semibold">{note.title.trim() || 'Sans titre'}</span>
                <span className="line-clamp-3 text-xs text-muted">
                  {excerpt(note.body) || 'Note vide'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <Modal
          open
          wide
          onClose={closeNote}
          title={
            <InlineEdit
              value={open.title}
              onSubmit={(title) => store.updateNote(open.id, { title })}
              className="text-base font-semibold"
              placeholder="Titre de la note"
            />
          }
        >
          <div className="flex flex-col gap-3 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted">Catégorie</span>
              <Select
                value={open.categoryId ?? ''}
                className="w-48"
                onChange={(event) =>
                  store.updateNote(open.id, { categoryId: event.target.value || null })
                }
              >
                <option value="">— Aucune —</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>

              <Button
                size="sm"
                className="ml-auto"
                onClick={() => void store.setNoteArchived(open.id, open.archivedAt === null)}
              >
                {open.archivedAt === null ? '🗃 Archiver' : '↩ Désarchiver'}
              </Button>
              <ConfirmButton
                size="sm"
                confirmLabel="Supprimer ?"
                onConfirm={() => {
                  // Supprimée : la saisie en cours n'a plus de destination.
                  setDraftBody(null)
                  savedBody.current = null
                  setOpenId(null)
                  void store.deleteNote(open.id)
                }}
              >
                Supprimer
              </ConfirmButton>
            </div>

            {/* `key` : passer d'une note à l'autre remonte l'éditeur, qui ne lit
                son contenu qu'à sa création. */}
            <RichText
              key={open.id}
              value={draftBody ?? open.body}
              onChange={setDraftBody}
              onSave={closeNote}
              onCancel={closeNote}
              contentClass="prose-card max-h-[55vh] min-h-[16rem] overflow-y-auto px-3 py-2 focus:outline-none"
              actions={
                <span className="text-[11px] text-muted">
                  Enregistrée en fermant · dernière modification le{' '}
                  {formatInstant(open.updatedAt)}
                  {open.archivedAt !== null ? ' · archivée' : ''}
                </span>
              }
            />
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

/** Le type est réexporté pour les vues qui listent des catégories. */
export type { NoteCategory, Note }
