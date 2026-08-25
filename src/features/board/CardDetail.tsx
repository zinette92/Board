import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Extension } from '@tiptap/core'
import LinkExtension from '@tiptap/extension-link'
import UnderlineExtension from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import rehypeRaw from 'rehype-raw'
import { Markdown as MarkdownExtension } from 'tiptap-markdown'

import { DatePicker } from '../../components/DatePicker'
import {
  Button,
  ConfirmButton,
  IconButton,
  InlineEdit,
  Modal,
  Pill,
  ProgressBar,
  Select,
  TextInput,
  cx,
} from '../../components/ui'
import {
  addDays,
  dueTone,
  formatDue,
  formatFullDay,
  formatInstant,
  parseDay,
  today,
} from '../../lib/dates'
import { formatAmount, formatWithUnit } from '../../lib/goals'
import { describeSchedule, makeSchedule } from '../../lib/models'
import { byPosition } from '../../lib/ordering'
import { chipStyle, listTintStyle } from '../../lib/palette'
import { MAX_ATTACHMENT_BYTES, useStore } from '../../lib/state'
import { WEEKDAYS } from '../../lib/reminders'
import type { Attachment, Card, ID, RecurrenceUnit, Repeat } from '../../lib/types'
import { RECURRENCE_UNITS } from '../../lib/types'

const dueDayFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Raccourcis voulus par le user : Ctrl+S = barré, Ctrl+U = souligné, Ctrl+P =
 * liste à puces, Ctrl+I = liste numérotée. Ce dernier remplace volontairement
 * le Ctrl+I natif de l'italique (dernière extension listée = priorité dans
 * la fusion des raccourcis de TipTap) — l'italique reste accessible via le
 * bouton I de la barre d'outils, simplement sans combinaison clavier dédiée.
 * Retourner true bloque aussi le comportement du navigateur — la boîte
 * « Enregistrer » de Ctrl+S, l'impression de Ctrl+P.
 */
const ShortcutOverrides = Extension.create({
  name: 'shortcutOverrides',
  addKeyboardShortcuts() {
    return {
      'Mod-s': () => this.editor.commands.toggleStrike(),
      'Mod-u': () => this.editor.commands.toggleUnderline(),
      'Mod-p': () => this.editor.commands.toggleBulletList(),
      'Mod-i': () => this.editor.commands.toggleOrderedList(),
    }
  },
})

/** Nuances des pastilles d'échéance d'étape, alignées sur celles des cartes. */
const ITEM_DUE_TONES = {
  overdue: 'border-danger/40 bg-danger/10 text-danger',
  today: 'border-warn/40 bg-warn/10 text-warn',
  soon: 'border-line bg-surface-2 text-ink',
  later: 'border-line bg-surface-2 text-muted',
} as const

function formatBytes(size: number): string {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} Ko`
  return `${(size / 1024 / 1024).toFixed(1)} Mo`
}

export function CardDetail({ cardId, onClose }: { cardId: ID; onClose: () => void }) {
  const store = useStore()
  const card = store.cards.find((item) => item.id === cardId)

  // La carte peut disparaître sous nos pieds (suppression) : on referme proprement.
  useEffect(() => {
    if (!card) onClose()
  }, [card, onClose])

  if (!card) return null
  return <CardDetailBody card={card} onClose={onClose} key={card.id} />
}

/**
 * Fiche carte sur le modèle de Trello : les sections vides n'existent pas —
 * on les fait naître par la rangée de boutons sous le titre. Pas de zone de
 * commentaires, pas de pied de fenêtre : les actions vivent dans le menu ⋯.
 */
function CardDetailBody({ card, onClose }: { card: Card; onClose: () => void }) {
  const store = useStore()
  const goal = card.goalId ? store.goals.find((item) => item.id === card.goalId) : undefined
  const boardLists = store.lists
    .filter((item) => item.boardId === card.boardId && item.archivedAt === null)
    .sort(byPosition)
  const list = boardLists.find((item) => item.id === card.listId)

  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [editingDescription, setEditingDescription] = useState(false)
  /** Champs de saisie d'étape ouverts, par checklist. */
  const [addingItem, setAddingItem] = useState<Record<ID, boolean>>({})
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  /** Sections ouvertes à la main alors qu'elles sont encore vides. */
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  // Dépendre de la seule fonction — stable — et non de `store`, dont l'identité
  // change à chaque mutation : sinon les pièces jointes seraient relues (et
  // leurs URL d'objet recréées) au moindre changement de titre.
  const { readAttachments } = store
  useEffect(() => {
    let cancelled = false
    void readAttachments(card.id).then((rows) => {
      if (!cancelled) setAttachments(rows ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [readAttachments, card.id, card.attachmentCount])

  const done = card.doneAt !== null
  /** Carte d'une liste marquée « modèles » : elle gagne duplication et envoi. */
  const isModel = list?.isTemplate === true

  // Une section existe si elle a du contenu, ou si on vient de l'ajouter.
  const show = {
    labels: card.labelIds.length > 0 || opened.labels === true,
    goal: card.goalId !== null || opened.goal === true,
    due: card.dueOn !== null || opened.due === true,
    files: attachments.length > 0 || card.attachmentCount > 0,
  }
  const openSection = (key: string) => setOpened((prev) => ({ ...prev, [key]: true }))

  const addChecklist = async () => {
    const created = await store.addChecklist(card.id)
    if (created) setAddingItem((prev) => ({ ...prev, [created.id]: true }))
  }

  const saveTitle = () => {
    const next = title.trim()
    if (next && next !== card.title) void store.updateCard(card.id, { title: next })
    else setTitle(card.title)
  }

  const saveDescription = () => {
    if (description !== card.description) void store.updateCard(card.id, { description })
    setEditingDescription(false)
  }

  /** Champs d'ajout, par checklist. Non contrôlés : voir `submitItemForm`. */
  const itemInputs = useRef<Record<ID, HTMLInputElement | null>>({})

  /**
   * L'enchaînement de saisie repose sur un `<form>` natif et un champ NON
   * contrôlé : Entrée comme le bouton « Ajouter » passent par ici, où l'on
   * vide et re-focalise le champ de façon SYNCHRONE — puis une seconde fois
   * une fois l'écriture faite, car le re-rendu qui suit peut déplacer le focus.
   */
  const submitItemForm = async (checklistId: ID) => {
    const input = itemInputs.current[checklistId]
    if (!input) return
    const text = input.value.trim()
    input.value = ''
    input.focus()
    if (!text) return
    await store.addChecklistItem(card.id, checklistId, text)
    itemInputs.current[checklistId]?.focus()
  }

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      await store.addAttachment(card.id, file)
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const chipTint = list?.color
    ? listTintStyle(list.color, false)
    : { backgroundColor: 'var(--surface-2)' }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <div className="flex flex-col gap-2.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-2 pr-1">
            {/* La liste, en pastille dépliable comme « IN PROGRESS ▼ » chez Trello. */}
            <select
              value={card.listId}
              onChange={(event) =>
                void store.moveCard(card.id, event.target.value, Number.MAX_SAFE_INTEGER)
              }
              className="h-7 cursor-pointer rounded-md border-0 pr-1 pl-2 text-xs font-semibold focus:outline-2 focus:outline-accent"
              style={chipTint}
              aria-label="Liste de la carte"
            >
              {boardLists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {card.archivedAt !== null ? <Pill tone="warn">archivée</Pill> : null}
            {done && card.doneAt ? (
              <span className="text-xs font-normal text-muted">
                terminée le {formatInstant(card.doneAt)}
              </span>
            ) : null}

            {/* Menu ⋯ : l'archivage et la suppression, comme chez Trello. */}
            <div className="relative ml-auto">
              <IconButton label="Actions de la carte" onClick={() => setActionsOpen((v) => !v)}>
                ⋯
              </IconButton>
              {actionsOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onMouseDown={() => setActionsOpen(false)} />
                  <div className="absolute top-8 right-0 z-20 flex w-52 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        setActionsOpen(false)
                        void store.updateCard(card.id, { waiting: !card.waiting })
                      }}
                    >
                      {card.waiting ? '⏳ Retirer de l’attente' : '⏳ Mettre en attente'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        setActionsOpen(false)
                        void store.duplicateCard(card.id)
                      }}
                    >
                      ⧉ Dupliquer
                    </Button>
                    {isModel ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setActionsOpen(false)
                          openSection('schedule')
                        }}
                      >
                        🗓 Programmer l'envoi…
                      </Button>
                    ) : null}
                    {card.archivedAt !== null ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setActionsOpen(false)
                          void store.updateCard(card.id, { archivedAt: null })
                        }}
                      >
                        ↩ Désarchiver
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setActionsOpen(false)
                          onClose()
                          void store.archiveCard(card.id)
                        }}
                      >
                        🗃 Archiver
                      </Button>
                    )}
                    <ConfirmButton
                      className="justify-start"
                      confirmLabel="Supprimer pour de bon"
                      onConfirm={() => {
                        setActionsOpen(false)
                        onClose()
                        void store.deleteCard(card.id)
                      }}
                    >
                      🗑 Supprimer
                    </ConfirmButton>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Le rond « terminée », comme sur Trello — indépendant de la liste. */}
            <button
              type="button"
              aria-label={done ? 'Remettre à faire' : 'Marquer terminée'}
              title={done ? 'Remettre à faire' : 'Marquer terminée'}
              onClick={() => void store.setCardDone(card.id, !done)}
              className={cx(
                'grid size-5 shrink-0 place-items-center rounded-full border text-[10px] leading-none transition-colors',
                done
                  ? 'border-ok bg-ok text-white'
                  : 'border-line text-transparent hover:border-ok hover:text-ok',
              )}
            >
              ✓
            </button>
            <TextInput
              value={title}
              className={cx(
                'flex-1 border-transparent bg-transparent px-1 text-xl font-semibold hover:border-line focus:bg-surface',
                done && 'text-muted line-through',
              )}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6 pb-1">
        {/* Rangée d'ajout : fait naître les sections encore vides, à la Trello. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!show.due ? (
            <Button size="sm" onClick={() => openSection('due')}>
              🕐 Dates
            </Button>
          ) : null}
          {/* Toujours visible : une carte peut porter plusieurs checklists. */}
          <Button size="sm" onClick={() => void addChecklist()}>
            ☑ Checklist
          </Button>
          {!show.goal ? (
            <Button size="sm" onClick={() => openSection('goal')}>
              🎯 Objectif
            </Button>
          ) : null}
          {!show.labels ? (
            <Button
              size="sm"
              onClick={() => {
                openSection('labels')
                setLabelPickerOpen(true)
              }}
            >
              🏷 Étiquettes
            </Button>
          ) : null}
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            📎 Pièce jointe
          </Button>
        </div>

        {/* -------------------------------------------------------- Envoi programmé */}
        {isModel && (card.schedule || opened.schedule === true) ? (
          <Section icon="🗓" title="Envoi programmé">
            <ScheduleEditor card={card} />
          </Section>
        ) : null}

        {/* ------------------------------------------------------------ Étiquettes */}
        {show.labels ? (
          <Section
            icon="🏷"
            title="Étiquettes"
            action={
              <IconButton
                label="Choisir les étiquettes"
                onClick={() => setLabelPickerOpen((v) => !v)}
              >
                +
              </IconButton>
            }
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {card.labelIds.length === 0 ? (
                <span className="text-xs text-muted">Aucune étiquette pour l'instant.</span>
              ) : (
                store.labels
                  .filter((label) => card.labelIds.includes(label.id))
                  .map((label) => (
                    <span
                      key={label.id}
                      className="rounded-md border px-3 py-1 text-xs font-semibold"
                      style={chipStyle(label.color)}
                    >
                      {label.name}
                    </span>
                  ))
              )}
            </div>
            {labelPickerOpen ? (
              <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface-2/50 p-2">
                {store.labels.length === 0 ? (
                  <span className="text-xs text-muted">
                    Aucune étiquette — crée-les dans les réglages ⚙.
                  </span>
                ) : (
                  store.labels.map((label) => {
                    const on = card.labelIds.includes(label.id)
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => store.toggleCardLabel(card.id, label.id)}
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
                  })
                )}
              </div>
            ) : null}
          </Section>
        ) : null}

        {/* ----------------------------------------------------------- Description */}
        <Section
          icon="≡"
          title="Description"
          action={
            !editingDescription && card.description.trim() ? (
              <Button size="sm" onClick={() => setEditingDescription(true)}>
                Modifier
              </Button>
            ) : null
          }
        >
          {editingDescription ? (
            <DescriptionEditor
              value={description}
              onChange={setDescription}
              onSave={saveDescription}
              onCancel={() => {
                setDescription(card.description)
                setEditingDescription(false)
              }}
            />
          ) : card.description.trim() ? (
            <button
              type="button"
              className="w-full cursor-text rounded-lg text-left"
              onClick={() => setEditingDescription(true)}
            >
              <div className="prose-card">
                {/* rehype-raw : rend le HTML inline du markdown (le <u> du souligné). */}
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {card.description}
                </Markdown>
              </div>
            </button>
          ) : (
            <button
              type="button"
              className="w-full rounded-lg bg-surface-2 px-3 pt-2 pb-7 text-left text-sm text-muted transition-colors hover:bg-surface-2/70"
              onClick={() => setEditingDescription(true)}
            >
              Ajouter une description plus détaillée…
            </button>
          )}
        </Section>

        {/* -------------------------------------------------------------- Objectif */}
        {show.goal ? (
          <Section icon="🎯" title="Objectif">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-44 flex-1">
                <span className="mb-1 block text-[11px] text-muted">Objectif SMART servi</span>
                <Select
                  value={card.goalId ?? ''}
                  onChange={(event) =>
                    store.updateCard(card.id, { goalId: event.target.value || null })
                  }
                >
                  <option value="">— Aucun —</option>
                  {store.goals.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || 'Objectif sans titre'}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] text-muted">Contribution</span>
                <TextInput
                  type="number"
                  step="any"
                  min={0}
                  disabled={!goal}
                  value={card.contribution}
                  className="w-28"
                  onChange={(event) =>
                    store.updateCard(card.id, { contribution: Number(event.target.value) || 0 })
                  }
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {goal ? (
                <>
                  Cocher le rond ajoutera{' '}
                  <strong className="text-ink">{formatWithUnit(card.contribution, goal.unit)}</strong>{' '}
                  à « {goal.title} » (cible : {formatWithUnit(goal.target, goal.unit)}).
                </>
              ) : (
                "Rattache la tâche à un objectif pour qu'elle fasse avancer sa mesure une fois cochée."
              )}
            </p>
          </Section>
        ) : null}

        {/* ------------------------------------------------------------------ Dates */}
        {show.due ? (
          <Section icon="🕐" title="Échéance">
            <DatePicker
              day={card.dueOn}
              time={card.dueTime}
              withTime
              defaultOpen={opened.due === true && card.dueOn === null}
              onSelect={(day, time) => void store.updateCard(card.id, { dueOn: day, dueTime: time })}
              onClear={() => {
                setOpened((prev) => ({ ...prev, due: false }))
                void store.updateCard(card.id, { dueOn: null, dueTime: null })
              }}
              trigger={(toggle) => (
                <Button size="sm" onClick={toggle}>
                  📅{' '}
                  {card.dueOn
                    ? `${dueDayFormatter.format(parseDay(card.dueOn))}${card.dueTime ? ` à ${card.dueTime}` : ''}`
                    : 'Choisir une date'}
                </Button>
              )}
            />
          </Section>
        ) : null}

        {/* ------------------------------------------------------------- Checklists */}
        {card.checklists.map((checklist) => {
          const checkedCount = checklist.items.filter((item) => item.done).length
          const adding = addingItem[checklist.id] === true
          return (
            <Section
              key={checklist.id}
              icon="☑"
              title={
                <InlineEdit
                  value={checklist.title}
                  onSubmit={(next) => store.renameChecklist(card.id, checklist.id, next)}
                  className="text-sm font-semibold"
                  placeholder="Titre de la checklist"
                />
              }
              action={
                <ConfirmButton
                  confirmLabel="Supprimer ?"
                  onConfirm={() => void store.removeChecklist(card.id, checklist.id)}
                >
                  Supprimer
                </ConfirmButton>
              }
            >
              {checklist.items.length > 0 ? (
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-9 shrink-0 text-right text-[11px] text-muted tabular-nums">
                    {Math.round((checkedCount / checklist.items.length) * 100)} %
                  </span>
                  <ProgressBar
                    ratio={checkedCount / checklist.items.length}
                    tone="ok"
                    className="flex-1"
                  />
                </div>
              ) : null}
              <ul className="mb-1.5 flex flex-col gap-1">
                {checklist.items.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-[var(--accent)]"
                      checked={item.done}
                      onChange={(event) =>
                        store.updateChecklistItem(card.id, checklist.id, item.id, {
                          done: event.target.checked,
                        })
                      }
                    />
                    <InlineEdit
                      value={item.text}
                      onSubmit={(text) =>
                        store.updateChecklistItem(card.id, checklist.id, item.id, { text })
                      }
                      className={cx(
                        'min-w-0 flex-1 text-sm',
                        item.done && 'text-muted line-through',
                      )}
                      placeholder="Texte de l'étape"
                    />
                    <DatePicker
                      day={item.dueOn}
                      time={item.dueTime}
                      withTime
                      onSelect={(day, time) =>
                        void store.updateChecklistItem(card.id, checklist.id, item.id, {
                          dueOn: day,
                          dueTime: time,
                        })
                      }
                      onClear={() =>
                        void store.updateChecklistItem(card.id, checklist.id, item.id, {
                          dueOn: null,
                          dueTime: null,
                        })
                      }
                      trigger={(toggle) =>
                        item.dueOn ? (
                          <button
                            type="button"
                            onClick={toggle}
                            title="Échéance de l'étape"
                            className={cx(
                              'rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
                              item.done
                                ? 'border-line bg-surface-2 text-muted'
                                : ITEM_DUE_TONES[dueTone(item.dueOn)],
                            )}
                          >
                            📅 {formatDue(item.dueOn)}
                            {item.dueTime ? ` · ${item.dueTime}` : ''}
                          </button>
                        ) : (
                          <IconButton
                            label="Échéance de l'étape"
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={toggle}
                          >
                            🕐
                          </IconButton>
                        )
                      }
                    />
                    <IconButton
                      label="Retirer"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => store.removeChecklistItem(card.id, checklist.id, item.id)}
                    >
                      ✕
                    </IconButton>
                  </li>
                ))}
              </ul>
              {adding ? (
                <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitItemForm(checklist.id)
                  }}
                >
                  <TextInput
                    autoFocus
                    ref={(el: HTMLInputElement | null) => {
                      itemInputs.current[checklist.id] = el
                    }}
                    defaultValue=""
                    placeholder="Ajouter un élément puis Entrée…"
                    onKeyDown={(event) => {
                      // Entrée traitée explicitement : ne dépend pas de la
                      // soumission implicite du navigateur.
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void submitItemForm(checklist.id)
                      }
                      if (event.key === 'Escape') {
                        event.stopPropagation()
                        setAddingItem((prev) => ({ ...prev, [checklist.id]: false }))
                      }
                    }}
                  />
                  <div className="flex gap-1.5">
                    <Button type="submit" variant="primary" size="sm">
                      Ajouter
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAddingItem((prev) => ({ ...prev, [checklist.id]: false }))
                      }
                    >
                      Terminé
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setAddingItem((prev) => ({ ...prev, [checklist.id]: true }))}
                >
                  Ajouter un élément
                </Button>
              )}
            </Section>
          )
        })}

        {/* --------------------------------------------------------- Pièces jointes */}
        {show.files ? (
          <Section
            icon="📎"
            title="Pièces jointes"
            action={
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                Ajouter
              </Button>
            }
          >
            <ul className="flex flex-col gap-1.5">
              {attachments.map((file) => {
                const url = file.url
                const isImage = file.mime.startsWith('image/')
                return (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5"
                  >
                    {isImage && url ? (
                      <img src={url} alt="" className="size-9 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded bg-surface-2 text-sm">
                        📄
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{file.name}</span>
                      <span className="block text-[11px] text-muted">{formatBytes(file.size)}</span>
                    </span>
                    {url ? (
                      <a
                        href={url}
                        download={file.name}
                        className="rounded-md px-2 py-1 text-xs text-accent hover:bg-surface-2"
                      >
                        Ouvrir
                      </a>
                    ) : null}
                    <IconButton
                      label="Supprimer la pièce jointe"
                      onClick={() => store.removeAttachment(card.id, file.id)}
                    >
                      ✕
                    </IconButton>
                  </li>
                )
              })}
            </ul>
            <p className="mt-1.5 text-[11px] text-muted">
              {formatAmount(MAX_ATTACHMENT_BYTES / 1024 / 1024)} Mo maximum par fichier.
            </p>
          </Section>
        ) : null}

        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void addFiles(event.target.files)}
        />
      </div>
    </Modal>
  )
}

/**
 * Éditeur de description WYSIWYG (TipTap/ProseMirror, le moteur de Trello) :
 * le gras s'affiche en gras, aucun `*` visible. Le stockage, lui, reste du
 * markdown — sérialisé à chaque frappe par `tiptap-markdown` — donc le rendu
 * en lecture (react-markdown) et les données existantes ne changent pas.
 */
function DescriptionEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (next: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const [stylesOpen, setStylesOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [, forceRender] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      LinkExtension.configure({ openOnClick: false, autolink: true }),
      // html:true — le souligné n'existe pas en markdown : il voyage en <u>.
      MarkdownExtension.configure({ html: true }),
      ShortcutOverrides,
    ],
    content: value,
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'prose-card max-h-96 min-h-36 overflow-y-auto px-3 py-2 focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          // Ne referme que l'éditeur — pas la fiche entière.
          event.stopPropagation()
          onCancel()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.storage.markdown.getMarkdown()),
  })

  // La barre d'outils reflète la sélection (gras actif, niveau d'en-tête…).
  useEffect(() => {
    if (!editor) return
    const refresh = () => forceRender((tick) => tick + 1)
    editor.on('transaction', refresh)
    editor.on('selectionUpdate', refresh)
    return () => {
      editor.off('transaction', refresh)
      editor.off('selectionUpdate', refresh)
    }
  }, [editor])

  if (!editor) return null

  const tool = 'h-7 min-w-7 rounded-md px-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink'
  const activeTool = 'bg-surface-2 text-ink'

  const currentHeading = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive('heading', { level }))

  const applyLink = () => {
    const href = linkUrl.trim()
    if (href && href !== 'https://') {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setLinkOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-lg border border-line focus-within:border-accent">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2/60 px-1.5 py-1">
          <div className="relative">
            <button
              type="button"
              className={cx(tool, 'font-semibold', currentHeading !== undefined && activeTool)}
              onClick={() => setStylesOpen((v) => !v)}
            >
              {currentHeading ? `H${currentHeading}` : 'Tt'} ▾
            </button>
            {stylesOpen ? (
              <>
                <div className="fixed inset-0 z-10" onMouseDown={() => setStylesOpen(false)} />
                <div className="absolute top-8 left-0 z-20 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                  {[0, 1, 2, 3, 4, 5, 6].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        const chain = editor.chain().focus()
                        if (level === 0) chain.setParagraph().run()
                        else chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
                        setStylesOpen(false)
                      }}
                      className={cx(
                        'flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2',
                        (level === 0 ? !currentHeading : currentHeading === level) && 'bg-surface-2',
                      )}
                      style={
                        level > 0 ? { fontSize: `${1.35 - level * 0.11}rem`, fontWeight: 600 } : undefined
                      }
                    >
                      <span>{level === 0 ? 'Texte normal' : `En-tête ${level}`}</span>
                      <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                        Ctrl+Alt+{level}
                      </kbd>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            title="Gras (Ctrl+B)"
            className={cx(tool, 'font-bold', editor.isActive('bold') && activeTool)}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            type="button"
            title="Italique"
            className={cx(tool, 'italic', editor.isActive('italic') && activeTool)}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            type="button"
            title="Souligné (Ctrl+U)"
            className={cx(tool, 'underline', editor.isActive('underline') && activeTool)}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            U
          </button>
          <button
            type="button"
            title="Barré (Ctrl+S)"
            className={cx(tool, 'line-through', editor.isActive('strike') && activeTool)}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            S
          </button>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            title="Liste à puces (Ctrl+P)"
            className={cx(tool, editor.isActive('bulletList') && activeTool)}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            ≔
          </button>
          <button
            type="button"
            title="Liste numérotée (Ctrl+I)"
            className={cx(tool, 'text-xs font-semibold', editor.isActive('orderedList') && activeTool)}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </button>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            title="Lien"
            className={cx(tool, editor.isActive('link') && activeTool)}
            onClick={() => {
              setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? 'https://')
              setLinkOpen((v) => !v)
            }}
          >
            🔗
          </button>
          <button
            type="button"
            title="Code"
            className={cx(tool, 'font-mono text-xs', editor.isActive('code') && activeTool)}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            {'<>'}
          </button>
        </div>

        {linkOpen ? (
          <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/40 px-2 py-1.5">
            <TextInput
              autoFocus
              value={linkUrl}
              placeholder="https://…"
              className="h-7 flex-1 py-0 text-xs"
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyLink()
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setLinkOpen(false)
                }
              }}
            />
            <Button variant="primary" size="sm" onClick={applyLink}>
              OK
            </Button>
            {editor.isActive('link') ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                Retirer
              </Button>
            ) : null}
          </div>
        ) : null}

        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="primary" size="sm" onClick={onSave}>
          Enregistrer
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <span className="ml-auto text-[11px] text-muted">
          mise en forme directe — enregistrée en markdown
        </span>
      </div>
    </div>
  )
}

/**
 * Programmation d'envoi d'une carte modèle.
 *
 * La liste de destination se choisit parmi celles du tableau, ou se saisit
 * librement : dans ce cas elle sera **créée** le jour de l'envoi. C'est
 * pourquoi elle est mémorisée par nom et non par identifiant.
 */
/** Valeur sentinelle du menu : saisir un nom de liste qui n'existe pas encore. */
const NEW_LIST = '__nouvelle_liste__'

function ScheduleEditor({ card }: { card: Card }) {
  const store = useStore()
  // Avant tout retour anticipé : un hook ne se déclare pas conditionnellement.
  const [custom, setCustom] = useState(false)
  const schedule = card.schedule
  const lists = store.lists
    .filter((item) => item.boardId === card.boardId && item.archivedAt === null && !item.isTemplate)
    .sort(byPosition)

  if (!schedule) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          Le jour venu, une copie de cette carte partira dans la liste choisie. L'original reste
          ici.
        </p>
        <Button
          size="sm"
          variant="primary"
          className="self-start"
          onClick={() =>
            store.setCardSchedule(
              card.id,
              makeSchedule(lists[0]?.name ?? 'À faire', addDays(today(), 1)),
            )
          }
        >
          Programmer un envoi
        </Button>
      </div>
    )
  }

  const set = (patch: Partial<typeof schedule>) =>
    store.setCardSchedule(card.id, { ...schedule, ...patch })

  const mode: 'once' | 'daily' | 'weekly' | 'weekdays' | 'interval' =
    schedule.repeat === null
      ? 'once'
      : schedule.repeat.kind === 'weekdays'
        ? 'weekdays'
        : schedule.repeat.interval === 1 && schedule.repeat.unit === 'day'
          ? 'daily'
          : schedule.repeat.interval === 1 && schedule.repeat.unit === 'week'
            ? 'weekly'
            : 'interval'

  const repeatFor = (next: typeof mode): Repeat | null => {
    switch (next) {
      case 'once':
        return null
      case 'daily':
        return { kind: 'interval', interval: 1, unit: 'day' }
      case 'weekly':
        return { kind: 'interval', interval: 1, unit: 'week' }
      case 'weekdays':
        return {
          kind: 'weekdays',
          days: schedule.repeat?.kind === 'weekdays' ? schedule.repeat.days : [1],
        }
      case 'interval':
        return {
          kind: 'interval',
          interval: schedule.repeat?.kind === 'interval' ? Math.max(2, schedule.repeat.interval) : 2,
          unit: schedule.repeat?.kind === 'interval' ? schedule.repeat.unit : 'month',
        }
    }
  }

  // La destination est mémorisée par NOM : elle peut désigner une liste encore
  // inexistante, qui sera alors créée au moment de l'envoi.
  const match = lists.find(
    (item) => item.name.trim().toLowerCase() === schedule.listName.trim().toLowerCase(),
  )
  const showCustom = custom || match === undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-[11px] text-muted">Liste de destination</span>
          <Select
            className="w-full"
            value={showCustom ? NEW_LIST : (match?.name ?? NEW_LIST)}
            aria-label="Liste de destination"
            onChange={(event) => {
              if (event.target.value === NEW_LIST) {
                setCustom(true)
                return
              }
              setCustom(false)
              set({ listName: event.target.value })
            }}
          >
            {lists.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value={NEW_LIST}>➕ Une autre liste…</option>
          </Select>
        </label>
        <div>
          <span className="mb-1 block text-[11px] text-muted">Prochain envoi</span>
          <DatePicker
            day={schedule.nextOn}
            onSelect={(day) => set({ nextOn: day })}
            trigger={(toggle) => (
              <Button size="sm" onClick={toggle}>
                📅 {formatFullDay(schedule.nextOn)}
              </Button>
            )}
          />
        </div>
      </div>

      {showCustom ? (
        <div className="flex flex-col gap-1">
          <TextInput
            autoFocus={custom}
            value={schedule.listName}
            placeholder="Nom de la liste à créer"
            aria-label="Nom de la liste de destination"
            onChange={(event) => set({ listName: event.target.value })}
          />
          {match === undefined ? (
            <p className="text-xs text-warn">
              « {schedule.listName.trim() || '…'} » n'existe pas encore — elle sera créée
              automatiquement au moment de l'envoi.
            </p>
          ) : (
            <p className="text-xs text-muted">« {match.name} » existe déjà : la copie ira dedans.</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mode}
          className="w-52"
          aria-label="Répétition de l'envoi"
          onChange={(event) => set({ repeat: repeatFor(event.target.value as typeof mode) })}
        >
          <option value="once">Une seule fois</option>
          <option value="daily">Tous les jours</option>
          <option value="weekly">Toutes les semaines</option>
          <option value="weekdays">Certains jours de la semaine</option>
          <option value="interval">Tous les X…</option>
        </Select>

        {mode === 'interval' && schedule.repeat?.kind === 'interval' ? (
          <>
            <TextInput
              type="number"
              min={1}
              value={schedule.repeat.interval}
              className="w-20"
              aria-label="Intervalle d'envoi"
              onChange={(event) => {
                if (schedule.repeat?.kind !== 'interval') return
                set({
                  repeat: {
                    ...schedule.repeat,
                    interval: Math.max(1, Number(event.target.value) || 1),
                  },
                })
              }}
            />
            <Select
              value={schedule.repeat.unit}
              className="w-32"
              aria-label="Unité d'envoi"
              onChange={(event) => {
                if (schedule.repeat?.kind !== 'interval') return
                set({ repeat: { ...schedule.repeat, unit: event.target.value as RecurrenceUnit } })
              }}
            >
              {RECURRENCE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {{ day: 'jour(s)', week: 'semaine(s)', month: 'mois', year: 'an(s)' }[unit]}
                </option>
              ))}
            </Select>
          </>
        ) : null}
      </div>

      {mode === 'weekdays' && schedule.repeat?.kind === 'weekdays' ? (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((weekday) => {
            const on =
              schedule.repeat?.kind === 'weekdays' && schedule.repeat.days.includes(weekday.value)
            return (
              <button
                key={weekday.value}
                type="button"
                title={weekday.label}
                onClick={() => {
                  if (schedule.repeat?.kind !== 'weekdays') return
                  const days = on
                    ? schedule.repeat.days.filter((value) => value !== weekday.value)
                    : [...schedule.repeat.days, weekday.value]
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

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--accent)]"
          checked={schedule.setDueDate}
          onChange={(event) => set({ setDueDate: event.target.checked })}
        />
        <span className="text-xs text-muted">
          La copie porte la date d'envoi comme échéance — elle apparaît donc aussi au calendrier.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <span className="mr-auto text-xs text-muted">
          {schedule.active ? describeSchedule(schedule) : 'envoi suspendu'}
          {schedule.lastRunOn ? ` · dernier envoi le ${formatFullDay(schedule.lastRunOn)}` : ''}
        </span>
        <Button size="sm" onClick={() => set({ active: !schedule.active })}>
          {schedule.active ? '⏸ Suspendre' : '▶ Réactiver'}
        </Button>
        <Button size="sm" onClick={() => store.sendModelNow(card.id)}>
          Envoyer maintenant
        </Button>
        <ConfirmButton
          confirmLabel="Retirer ?"
          onConfirm={() => store.setCardSchedule(card.id, null)}
        >
          Retirer
        </ConfirmButton>
      </div>
    </div>
  )
}

/** En-tête de section à la Trello : icône, titre, action à droite, contenu aligné. */
function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex min-h-7 items-center gap-2.5">
        <span aria-hidden className="w-5 text-center text-base leading-none">
          {icon}
        </span>
        <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
        {action}
      </div>
      <div className="pl-[1.875rem]">{children}</div>
    </section>
  )
}
