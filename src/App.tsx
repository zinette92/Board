import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { IconButton, Pill, cx } from './components/ui'
import { RemindersView, useReminderNotifications } from './features/reminders/RemindersView'
import { AutomationsView } from './features/automations/AutomationsView'
import { BoardView } from './features/board/BoardView'
import { CardDetail } from './features/board/CardDetail'
import { CalendarView } from './features/calendar/CalendarView'
import { GoalsView } from './features/goals/GoalsView'
import { SearchBar } from './features/search/SearchBar'
import { ErrorBanner, SettingsView } from './features/settings/SettingsView'
import { byPosition } from './lib/ordering'
import { pendingOccurrences } from './lib/reminders'
import { useStore } from './lib/state'
import { useTheme } from './lib/theme'
import { useToday } from './lib/useToday'
import type { ID } from './lib/types'

type View = 'board' | 'goals' | 'calendar' | 'reminders' | 'automations' | 'settings'

export function App() {
  const store = useStore()
  const { theme, setTheme } = useTheme()
  const [view, setView] = useState<View>('board')
  const [boardId, setBoardId] = useState<ID | null>(null)
  const [openCardId, setOpenCardId] = useState<ID | null>(null)

  // Le jour courant, qui bascule tout seul à minuit : la pastille des rappels
  // et les notifications doivent rester justes dans une appli laissée ouverte.
  const day = useToday()

  // Notifications système des rappels : actives quel que soit l'onglet affiché.
  useReminderNotifications(day)

  /** Identité stable : une flèche inline ferait rejouer les effets de la modale. */
  const closeCard = useCallback(() => setOpenCardId(null), [])

  const boards = useMemo(
    () => store.boards.filter((board) => board.archivedAt === null).sort(byPosition),
    [store.boards],
  )
  const board = boards.find((item) => item.id === boardId) ?? boards[0]

  /**
   * Échéances de rappel à valider, celle du jour comprise — le même compte que
   * le panneau « À valider » de l'onglet, visible depuis n'importe quelle vue.
   * La pastille vivait sur « Objectifs » (objectifs en retard) : déplacée ici à
   * la demande du user, un rappel échu appelle un geste, un retard d'objectif
   * beaucoup moins.
   */
  const due = useMemo(() => {
    const pending = pendingOccurrences(store.reminders, day)
    return { count: pending.length, late: pending.filter((item) => item.on < day).length }
  }, [store.reminders, day])

  if (!store.ready) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">Chargement…</div>
    )
  }

  // Le fond d'écran couvre tout l'écran sur TOUS les onglets de travail —
  // Réglages excepté, qui reste une page de configuration à plat. L'en-tête et
  // le contenu passent alors en verre sombre pour rester lisibles par-dessus
  // la photo, laquelle reste visible de part et d'autre des colonnes centrées.
  const wallpaper = board ? store.wallpapers[board.id] : undefined
  const showWallpaper = view !== 'settings' && Boolean(wallpaper)

  return (
    <div
      className="flex h-full flex-col"
      style={
        showWallpaper
          ? {
              backgroundImage: `url("${wallpaper}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <header
        className={cx(
          'flex flex-wrap items-center gap-2 border-b border-line px-3 py-2',
          showWallpaper && 'glass-dark',
        )}
      >
        <span className="mr-1 text-sm font-semibold">Mon board</span>

        <nav className="flex gap-1">
          <TabButton active={view === 'board'} onClick={() => setView('board')}>
            Tableau
          </TabButton>
          <TabButton active={view === 'goals'} onClick={() => setView('goals')}>
            Objectifs
          </TabButton>
          <TabButton active={view === 'reminders'} onClick={() => setView('reminders')}>
            Rappels
            {due.count > 0 ? (
              <Pill
                tone={due.late > 0 ? 'danger' : 'warn'}
                className="ml-1"
                title={
                  `${due.count} échéance${due.count > 1 ? 's' : ''} à valider` +
                  (due.late > 0 ? ` — dont ${due.late} en retard` : '')
                }
                // Onglet actif : fond opaque, sinon la pastille se noie dans le bleu.
                style={view === 'reminders' ? { backgroundColor: 'var(--surface)' } : undefined}
              >
                {due.count}
              </Pill>
            ) : null}
          </TabButton>
          <TabButton active={view === 'calendar'} onClick={() => setView('calendar')}>
            Calendrier
          </TabButton>
        </nav>

        {/* « Parcourir » : recherche globale, cartes et listes, archivées comprises. */}
        <SearchBar
          onOpenCard={setOpenCardId}
          onOpenBoard={(id) => {
            setBoardId(id)
            setView('board')
          }}
        />

        {/* Tout à droite : les automatisations, puis la roue dentée, toujours
            en dernière position. Le fond d'écran a rejoint les Réglages — on
            le change deux fois par an. */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton
            label="Automatisations"
            onClick={() => setView('automations')}
            className={cx('text-base', view === 'automations' && 'bg-surface-2 text-ink')}
          >
            ⚡
          </IconButton>
          <IconButton
            label="Réglages"
            onClick={() => setView('settings')}
            className={cx('text-base', view === 'settings' && 'bg-surface-2 text-ink')}
          >
            ⚙
          </IconButton>
        </div>
      </header>

      <ErrorBanner />

      {view === 'board' ? (
        board ? (
          <BoardView board={board} onOpenCard={setOpenCardId} />
        ) : (
          <div className="grid flex-1 place-items-center">
            <p className="text-sm text-muted">Aucun tableau.</p>
          </div>
        )
      ) : null}

      {view === 'goals' ? (
        <GoalsView onOpenCard={setOpenCardId} hasWallpaper={showWallpaper} />
      ) : null}
      {view === 'calendar' ? (
        <CalendarView onOpenCard={setOpenCardId} hasWallpaper={showWallpaper} />
      ) : null}
      {view === 'reminders' ? <RemindersView hasWallpaper={showWallpaper} /> : null}
      {view === 'automations' ? (
        <AutomationsView
          boardId={board?.id ?? null}
          hasWallpaper={showWallpaper}
          onOpenCard={setOpenCardId}
        />
      ) : null}
      {view === 'settings' ? <SettingsView theme={theme} setTheme={setTheme} /> : null}

      {openCardId ? <CardDetail cardId={openCardId} onClose={closeCard} /> : null}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center rounded-lg px-2.5 py-1 text-sm transition-colors',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
