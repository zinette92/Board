import { useEffect, useState } from 'react'

import { Button, ConfirmButton, Field, IconButton, TextInput, cx } from '../../components/ui'
import { LABEL_COLOR_HEX, LABEL_COLOR_NAMES, chipStyle, labelColorToHex } from '../../lib/palette'
import { SignOutButton } from '../auth/AuthGate'
import { gcalStatus } from '../../lib/gcal'
import type { GcalStatus } from '../../lib/gcal'
import { useInstallPrompt } from '../../lib/install'
import { useStore } from '../../lib/state'
import { LABEL_COLORS } from '../../lib/types'
import type { Theme } from '../../lib/theme'

/**
 * Pipette de couleur : l'`<input type="color">` natif (spectre + pipette
 * d'écran dans Chrome, à la Figma), habillé en pastille ronde.
 */
function ColorInput({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <label
      className="relative size-8 shrink-0 cursor-pointer rounded-full border border-line shadow-sm transition-transform hover:scale-105"
      style={{ backgroundColor: labelColorToHex(value) }}
      title="Choisir une couleur"
    >
      <input
        type="color"
        value={labelColorToHex(value)}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  )
}

export function SettingsView({
  theme,
  setTheme,
}: {
  theme: Theme
  setTheme: (next: Theme) => void
}) {
  const store = useStore()
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState<string>('#3b82f6')

  const addLabel = async () => {
    if (!labelName.trim()) return
    await store.createLabel(labelName, labelColor)
    setLabelName('')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Réglages</h2>
          <SignOutButton />
        </div>

        {/* -------------------------------------------------------- Étiquettes */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-1 text-sm font-semibold">Étiquettes</h3>
          <p className="mb-3 text-xs text-muted">
            Communes à tous les tableaux. Supprimer une étiquette la retire des cartes qui la
            portaient.
          </p>

          {store.labels.length > 0 ? (
            <ul className="mb-3 flex flex-col gap-1.5">
              {store.labels.map((label) => (
                <li key={label.id} className="flex items-center gap-2">
                  <span
                    className="w-32 shrink-0 rounded border px-2 py-0.5 text-center text-xs font-medium"
                    style={chipStyle(label.color)}
                  >
                    {label.name}
                  </span>
                  <TextInput
                    value={label.name}
                    className="flex-1"
                    onChange={(event) => store.updateLabel(label.id, { name: event.target.value })}
                  />
                  <ColorInput
                    value={label.color}
                    onChange={(hex) => store.updateLabel(label.id, { color: hex })}
                  />
                  <ConfirmButton onConfirm={() => store.deleteLabel(label.id)} confirmLabel="Sûr ?">
                    Supprimer
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-xs text-muted">Aucune étiquette pour l'instant.</p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Nouvelle étiquette" className="flex-1">
              <TextInput
                value={labelName}
                placeholder="Ex. Priorité"
                onChange={(event) => setLabelName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void addLabel()
                }}
              />
            </Field>
            <Field label="Couleur" hint="Pipette libre, ou un raccourci ci-contre.">
              <div className="flex items-center gap-1.5">
                <ColorInput value={labelColor} onChange={setLabelColor} />
                {LABEL_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    title={LABEL_COLOR_NAMES[preset]}
                    onClick={() => setLabelColor(LABEL_COLOR_HEX[preset])}
                    className={cx(
                      'size-5 rounded-full border border-line transition-transform hover:scale-110',
                      labelColor === LABEL_COLOR_HEX[preset] && 'ring-2 ring-accent',
                    )}
                    style={{ backgroundColor: LABEL_COLOR_HEX[preset] }}
                  />
                ))}
              </div>
            </Field>
            <Button variant="primary" onClick={() => void addLabel()}>
              Ajouter
            </Button>
          </div>
        </section>

        {/* ---------------------------------------------------------- Tableaux */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Tableaux</h3>
          <ul className="flex flex-col gap-2.5">
            {store.boards.map((board) => {
              const listCount = store.lists.filter(
                (list) => list.boardId === board.id && list.archivedAt === null,
              ).length
              const cardCount = store.cards.filter((card) => card.boardId === board.id).length
              const archived = store.lists.filter(
                (list) => list.boardId === board.id && list.archivedAt !== null,
              )
              return (
                <li key={board.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={board.emoji}
                      className="w-14 text-center"
                      maxLength={4}
                      onChange={(event) =>
                        store.updateBoard(board.id, { emoji: event.target.value })
                      }
                    />
                    <TextInput
                      value={board.name}
                      className="flex-1"
                      onChange={(event) => store.updateBoard(board.id, { name: event.target.value })}
                    />
                    <span className="w-40 shrink-0 text-xs text-muted">
                      {listCount} liste(s) · {cardCount} carte(s)
                    </span>
                    <ConfirmButton
                      onConfirm={() => store.deleteBoard(board.id)}
                      confirmLabel="Tout supprimer ?"
                    >
                      Supprimer
                    </ConfirmButton>
                  </div>
                  {archived.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 pl-16">
                      <span className="text-[11px] text-muted">Listes archivées :</span>
                      {archived.map((list) => (
                        <Button
                          key={list.id}
                          size="sm"
                          onClick={() => store.updateList(list.id, { archivedAt: null })}
                        >
                          ↩ {list.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>

        {/* ------------------------------------------------------------ Thème */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Apparence</h3>
          <div className="flex gap-1.5">
            {(
              [
                ['system', 'Système'],
                ['light', 'Clair'],
                ['dark', 'Sombre'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={theme === value ? 'primary' : 'subtle'}
                onClick={() => setTheme(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- Application */}
        <InstallSection />

        {/* ------------------------------------------------- Google Agenda */}
        <GoogleSection />

        {/* ----------------------------------------------------- Raccourcis */}
        <ShortcutsSection />

        {/* ------------------------------------------------------- Données */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-1 text-sm font-semibold">Données</h3>
          <p className="mb-3 text-xs text-muted">
            Tout est stocké sur <strong className="text-ink">ton compte Supabase</strong>, donc
            synchronisé entre tes appareils. Chaque ligne est cloisonnée par RLS : personne d'autre
            que toi ne peut la lire, même en connaissant l'adresse de l'application.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/70 p-3">
            <span className="text-xs text-muted">
              Repartir de zéro : supprime tableaux, tâches, objectifs et étiquettes, puis recrée un
              tableau vide.
            </span>
            <ConfirmButton
              size="md"
              onConfirm={() => store.resetAll()}
              confirmLabel="Effacer définitivement"
            >
              Effacer toutes les données
            </ConfirmButton>
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * Installation en application (PWA) : fenêtre dédiée, icône dans la barre des
 * tâches / l'écran d'accueil. Le bouton n'existe que si le navigateur a émis
 * `beforeinstallprompt` ; sinon, le mode d'emploi manuel prend le relais.
 */
function InstallSection() {
  const { installed, canPrompt, install } = useInstallPrompt()

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-1 text-sm font-semibold">Application</h3>
      {installed ? (
        <p className="text-xs text-muted">
          ✓ L'application est installée — elle s'ouvre dans sa propre fenêtre, avec son icône.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Installe le board comme une application : fenêtre dédiée sans barre d'adresse, icône
            sur le bureau et l'écran d'accueil du téléphone.
          </p>
          {canPrompt ? (
            <Button variant="primary" className="self-start" onClick={() => void install()}>
              ⤓ Installer l'application
            </Button>
          ) : (
            <p className="rounded-lg bg-surface-2/70 p-3 text-xs text-muted">
              Le navigateur n'a pas (encore) proposé l'installation. Sur
              <strong className="text-ink"> Chrome/Edge</strong> : icône d'installation à droite de
              la barre d'adresse, ou menu ⋮ → « Installer l'application ». Sur
              <strong className="text-ink"> iPhone/iPad</strong> : Partager →
              « Sur l'écran d'accueil ».
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** Aide-mémoire des raccourcis clavier — la référence unique, à jour. */
function ShortcutsSection() {
  const groups: Array<[string, Array<[string, string]>]> = [
    [
      'Tableau — carte survolée par la souris',
      [
        ['C', 'Archiver la carte'],
        ['D', 'Envoyer la carte dans la colonne « DONE » (créée si absente)'],
      ],
    ],
    ['Tableau — liste survolée par la souris', [['R', 'Réduire ou rouvrir la liste']]],
    [
      'Éditeur de description',
      [
        ['Ctrl + B', 'Gras'],
        ['Ctrl + S', 'Barré'],
        ['Ctrl + U', 'Souligné'],
        ['Ctrl + P', 'Liste à puces'],
        ['Ctrl + I', 'Liste numérotée'],
      ],
    ],
  ]
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold">Raccourcis clavier</h3>
      <div className="flex flex-col gap-3">
        {groups.map(([title, keys]) => (
          <div key={title}>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
              {title}
            </span>
            <div className="flex flex-col gap-1">
              {keys.map(([combo, effect]) => (
                <div key={combo} className="flex items-center gap-2 text-xs">
                  <kbd className="min-w-14 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-center font-semibold">
                    {combo}
                  </kbd>
                  <span className="text-muted">{effect}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">
          Les raccourcis à une lettre sont inactifs pendant une saisie de texte.
        </p>
      </div>
    </section>
  )
}

/**
 * État de la connexion Google Agenda. La configuration elle-même vit côté
 * serveur (variables d'environnement Vercel + partage de l'agenda avec le
 * compte de service) : cette section ne fait que la diagnostiquer et guider.
 */
function GoogleSection() {
  const [status, setStatus] = useState<GcalStatus | null>(null)

  useEffect(() => {
    let stale = false
    void gcalStatus().then((result) => {
      if (!stale) setStatus(result)
    })
    return () => {
      stale = true
    }
  }, [])

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-1 text-sm font-semibold">Google Agenda</h3>

      {status === null ? (
        <p className="text-xs text-muted">Vérification de la connexion…</p>
      ) : status.state === 'ok' ? (
        <p className="text-xs text-muted">
          ✓ Connecté à <strong className="text-ink">« {status.summary} »</strong> — les événements
          apparaissent dans le calendrier, et « ＋ Événement Google » écrit directement dedans.
        </p>
      ) : status.state === 'not-shared' ? (
        <div className="flex flex-col gap-2 text-xs text-muted">
          <p>
            Le pont fonctionne, mais l'agenda n'est pas encore partagé avec le compte de service.
            Dans Google Agenda : Paramètres de l'agenda → « Partager avec des personnes » →
            ajouter cette adresse avec le droit
            <strong className="text-ink"> « Apporter des modifications aux événements »</strong> :
          </p>
          <code className="rounded-lg bg-surface-2/70 p-2 break-all select-all">
            {status.saEmail}
          </code>
        </div>
      ) : status.state === 'unconfigured' ? (
        <div className="flex flex-col gap-2 text-xs text-muted">
          <p>
            Connexion non configurée. Variables manquantes sur Vercel (Settings → Environment
            Variables) :
          </p>
          <code className="rounded-lg bg-surface-2/70 p-2">{status.missing.join(', ')}</code>
          <p>
            Il faut un <strong className="text-ink">compte de service Google</strong> (une clé
            JSON), l'agenda partagé avec son adresse e-mail, et l'identifiant de l'agenda —
            « votre-adresse@gmail.com » pour l'agenda principal.
          </p>
        </div>
      ) : (
        <p className="text-xs text-danger">Connexion en erreur : {status.message}</p>
      )}
    </section>
  )
}

/** Petit bandeau d'erreur global, affiché sous la barre du haut. */
export function ErrorBanner() {
  const store = useStore()
  if (!store.error) return null
  return (
    <div
      className={cx(
        'mx-3 mt-2 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger',
      )}
      role="alert"
    >
      <span className="flex-1">{store.error}</span>
      <IconButton label="Masquer" onClick={store.dismissError}>
        ✕
      </IconButton>
    </div>
  )
}
