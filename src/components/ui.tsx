/** Primitives d'interface. Aucune logique métier ici. */

import { useEffect, useRef, useState } from 'react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ComponentProps,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* -------------------------------------------------------------------- Boutons */

type ButtonVariant = 'primary' | 'subtle' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed select-none'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  subtle: 'bg-surface-2 text-ink border border-line hover:border-accent/60',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
}

export function Button({
  variant = 'subtle',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  )
}

export function IconButton({
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * Suppression en deux temps : le second clic confirme. Évite une modale de
 * confirmation pour chaque geste destructeur, tout en empêchant l'accident.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirmer ?',
  size = 'sm',
  className,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  size?: ButtonSize
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(timer)
  }, [armed])

  return (
    <Button
      variant={armed ? 'danger' : 'ghost'}
      size={size}
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}

/* --------------------------------------------------------------------- Champs */

const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none'

/* `ComponentProps` plutôt que `InputHTMLAttributes` : inclut `ref`, que React 19
   transmet comme une prop ordinaire aux composants fonction. */
export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(CONTROL, className)} {...rest} />
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(CONTROL, 'resize-y leading-relaxed', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'cursor-pointer', className)} {...rest} />
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

/* ---------------------------------------------------------------- Indicateurs */

export function ProgressBar({
  ratio,
  tone = 'accent',
  /** Repère du temps écoulé : dit d'un coup d'œil si l'on est en avance ou en retard. */
  marker,
  className,
}: {
  ratio: number
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
  marker?: number
  className?: string
}) {
  const width = Math.max(0, Math.min(1, ratio)) * 100
  const tones: Record<string, string> = {
    accent: 'var(--accent)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    danger: 'var(--danger)',
  }
  return (
    <div
      className={cx('relative h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${width}%`, backgroundColor: tones[tone] }}
      />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-ink/45"
          style={{ left: `${marker * 100}%` }}
          title="Temps écoulé"
        />
      ) : null}
    </div>
  )
}

export function Pill({
  children,
  tone = 'muted',
  style,
  className,
  title,
}: {
  children: ReactNode
  tone?: 'muted' | 'ok' | 'warn' | 'danger' | 'accent' | 'plain'
  style?: CSSProperties
  className?: string
  title?: string
}) {
  const tones: Record<string, string> = {
    muted: 'text-muted bg-surface-2 border-line',
    plain: 'text-ink bg-surface-2 border-line',
    ok: 'text-ok border-ok/40 bg-ok/10',
    warn: 'text-warn border-warn/40 bg-warn/10',
    danger: 'text-danger border-danger/40 bg-danger/10',
    accent: 'text-accent border-accent/40 bg-accent/10',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      style={style}
      title={title}
    >
      {children}
    </span>
  )
}

/* --------------------------------------------------------------------- Modale */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  corner,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Remplace la croix de fermeture — Échap et le clic hors fiche restent. */
  corner?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  /**
   * `onClose` est presque toujours une flèche inline chez l'appelant : son
   * identité change à CHAQUE re-rendu du parent. La lire par ref est ce qui
   * permet à l'effet ci-dessous de ne dépendre que de `open` — sinon il
   * rejouait à chaque mutation du store et `panel.focus()` volait le focus du
   * champ en cours de saisie (checklist, titre…).
   */
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    // Sans ce verrou, la page défile derrière la modale sur mobile.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cx(
          'my-auto w-full rounded-xl border border-line bg-surface shadow-xl outline-none',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 text-base font-semibold">{title}</div>
          {corner ?? (
            <IconButton label="Fermer" onClick={onClose}>
              ✕
            </IconButton>
          )}
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Saisie inline */

/**
 * Champ qui s'ouvre au clic, valide sur Entrée, annule sur Échap. Sert partout
 * où Trello laisse renommer sur place — titres de liste, de tableau, de carte.
 */
export function InlineEdit({
  value,
  onSubmit,
  className,
  inputClassName,
  as = 'span',
  placeholder,
}: {
  value: string
  onSubmit: (next: string) => void
  className?: string
  inputClassName?: string
  as?: 'span' | 'h2'
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== value) onSubmit(next)
    else setDraft(value)
  }

  if (editing) {
    return (
      <TextInput
        autoFocus
        value={draft}
        placeholder={placeholder}
        className={cx('h-7 py-0', inputClassName)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }

  const Tag = as
  // Pas d'attribut `title` ici : sur un élément sans nom natif, il *remplace*
  // le contenu textuel dans l'arbre d'accessibilité — le nom de la liste
  // deviendrait invisible aux lecteurs d'écran. Le survol suffit comme indice.
  return (
    <Tag
      className={cx('cursor-text rounded px-1 hover:bg-surface-2', className)}
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-muted">{placeholder}</span>}
    </Tag>
  )
}
