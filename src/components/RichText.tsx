/**
 * L'éditeur de texte mis en forme, partagé par tout ce qui se rédige :
 * description d'une carte, pages du plan de travail, notes du carnet.
 *
 * Il vivait dans la fiche carte ; les notes en avaient besoin aussi, et
 * dupliquer trois cents lignes de barre d'outils n'était pas une option.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Extension } from '@tiptap/core'
import ImageExtension from '@tiptap/extension-image'
import LinkExtension from '@tiptap/extension-link'
import UnderlineExtension from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as MarkdownExtension } from 'tiptap-markdown'

import { Button, TextInput, cx } from './ui'
import { prepareInlineImage } from '../lib/image'

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

/**
 * Éditeur de description WYSIWYG (TipTap/ProseMirror, le moteur de Trello) :
 * le gras s'affiche en gras, aucun `*` visible. Le stockage, lui, reste du
 * markdown — sérialisé à chaque frappe par `tiptap-markdown` — donc le rendu
 * en lecture (react-markdown) et les données existantes ne changent pas.
 */
/**
 * Le même éditeur sert à la description et au plan de travail : `contentClass`
 * règle la hauteur de la zone d'écriture, `actions` remplace le pied de page
 * (le plan, lui, s'enregistre tout seul et n'a donc pas de bouton).
 */
export function RichText({
  value,
  onChange,
  onSave,
  onCancel,
  contentClass,
  actions,
}: {
  value: string
  onChange: (next: string) => void
  onSave: () => void
  onCancel: () => void
  contentClass?: string
  actions?: ReactNode
}) {
  const [stylesOpen, setStylesOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [, forceRender] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      // `allowBase64` : l'image collée vit dans le texte, pas dans un bucket.
      ImageExtension.configure({ allowBase64: true }),
      LinkExtension.configure({ openOnClick: false, autolink: true }),
      // html:true — le souligné n'existe pas en markdown : il voyage en <u>.
      MarkdownExtension.configure({ html: true }),
      ShortcutOverrides,
    ],
    content: value,
    autofocus: 'end',
    editorProps: {
      attributes: {
        class:
          contentClass ?? 'prose-card max-h-96 min-h-36 overflow-y-auto px-3 py-2 focus:outline-none',
      },
      /*
       * Une image collée s'insère DANS la page, à l'endroit du curseur. Le
       * `preventDefault` fait d'une pierre deux coups : il empêche le collage
       * natif, et il signale à l'écouteur de la fiche — qui transforme sinon
       * toute image collée en pièce jointe — que celle-ci a trouvé preneur.
       */
      handlePaste: (view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        )
        if (images.length === 0) return false
        event.preventDefault()
        void (async () => {
          for (const file of images) {
            try {
              const src = await prepareInlineImage(file)
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src }),
                ),
              )
            } catch {
              /* Image illisible : on n'insère rien plutôt qu'un cadre cassé. */
            }
          }
        })()
        return true
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
        {actions ?? (
          <>
            <Button variant="primary" size="sm" onClick={onSave}>
              Enregistrer
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Annuler
            </Button>
            <span className="ml-auto text-[11px] text-muted">
              mise en forme directe — enregistrée en markdown
            </span>
          </>
        )}
      </div>
    </div>
  )
}

