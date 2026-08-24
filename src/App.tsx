import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { IconButton, Pill, cx } from './components/ui'
import { RemindersView, useReminderNotifications } from './features/reminders/RemindersView'
import { BoardView, WallpaperModal } from './features/board/BoardView'
import { CardDetail } from './features/board/CardDetail'
import { CalendarView } from './features/calendar/CalendarView'
import { GoalsView } from './features/goals/GoalsView'
import { SearchBar } from './features/search/SearchBar'
import { ErrorBanner, SettingsView } from './features/settings/SettingsView'
import { goalProgress } from './lib/goals'
import { byPosition } from './lib/ordering'
import { useStore } from './lib/state'
import { useTheme } from './lib/theme'
import type { ID } from './lib/types'

type View = 'board' | 'goals' | 'calendar' | 'automation' | 'settings'

export function App() {
  const store = useStore()
  const { theme, setTheme } = useTheme()
  const [view, setView] = useState<View>('board')
  const [boardId, setBoardId] = useState<ID | null>(null)
  const [openCardId, setOpenCardId] = useState<ID | null>(null)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)

  // Notifications système des rappels : actives quel que soit l'onglet affiché.
  useReminderNotifications()

  /** Identité stable : une flèche inline ferait rejouer les effets de la modale. */
  const closeCard = useCallback(() => setOpenCardId(null), [])

  const boards = useMemo(
    () => store.boards.filter((board) => board.archivedAt === null).sort(byPosition),
    [store.boards],
  )
  const board = boards.find((item) => item.id === boardId) ?? boards[0]

  /** Compteur d'objectifs en retard : c'est l'information qui doit sauter aux yeux depuis n'importe quelle vue. */
  const behind = useMemo(() => {
    const cards = store.cards.filter((card) => card.archivedAt === null)
    return store.goals.filter((goal) => {
      if (goal.status !== 'active') return false
      const pace = goalProgress(goal, cards).pace
      return pace === 'behind' || pace === 'overdue'
    }).length
  }, [store.goals, store.cards])

  if (!store.ready) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">Chargement…</div>
    )
  }

  // Le fond d'écran du tableau couvre tout l'écran ; l'en-tête passe alors en
  // verre sombre pour rester lisible par-dessus la photo.
  const wallpaper = board ? store.wallpapers[board.id] : undefined
  const showWallpaper = view === 'board' && Boolean(wallpaper)

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
            {behind > 0 ? (
              <Pill tone="warn" className="ml-1">
                {behind}
              </Pill>
            ) : null}
          </TabButton>
          <TabButton active={view === 'automation'} onClick={() => setView('automation')}>
            Rappels
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

        {/* Tout à droite : le fond d'écran, puis la roue dentée, toujours en
            dernière position. */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {view === 'board' && board ? (
            <IconButton label="Fond du tableau" onClick={() => setWallpaperOpen(true)}>
              🖼
            </IconButton>
          ) : null}
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

      {view === 'goals' ? <GoalsView onOpenCard={setOpenCardId} /> : null}
      {view === 'calendar' ? <CalendarView onOpenCard={setOpenCardId} /> : null}
      {view === 'automation' ? <RemindersView /> : null}
      {view === 'settings' ? <SettingsView theme={theme} setTheme={setTheme} /> : null}

      {openCardId ? <CardDetail cardId={openCardId} onClose={closeCard} /> : null}

      {wallpaperOpen && board ? (
        <WallpaperModal
          boardId={board.id}
          url={wallpaper ?? null}
          onClose={() => setWallpaperOpen(false)}
        />
      ) : null}

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
