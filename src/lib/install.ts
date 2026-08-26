import { useEffect, useState } from 'react'

/** Sous-ensemble utile du BeforeInstallPromptEvent, absent des libs TS. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** L'app tourne-t-elle déjà en fenêtre installée ? */
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari expose son propre drapeau, hors standard.
  (navigator as { standalone?: boolean }).standalone === true

/**
 * Installation de l'application (PWA).
 *
 * Chrome/Edge ne proposent l'installation qu'à travers `beforeinstallprompt`,
 * un événement qu'il faut intercepter et conserver : le bouton n'existe que
 * si le navigateur l'a émis. Safari iOS ne l'émet jamais — l'installation y
 * passe par Partager → « Sur l'écran d'accueil », d'où `canPrompt: false`
 * mais un mode d'emploi à afficher.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(standalone)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Sans ce preventDefault, Chrome mobile affiche sa propre mini-barre.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    installed,
    canPrompt: prompt !== null,
    install: async () => {
      if (!prompt) return
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      // Refusé ou accepté, l'événement est consommé : Chrome en réémettra un.
      if (outcome === 'dismissed') setPrompt(null)
    },
  }
}
