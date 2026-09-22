import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * Dernier rempart : une exception pendant un rendu démonte tout l'arbre React
 * et laisse une page BLANCHE, sans le moindre indice. On affiche plutôt ce qui
 * s'est passé, avec de quoi repartir — recharger suffit presque toujours, et
 * la purge règle le cas d'un cache de service worker resté en travers.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // La console reste la seule trace : aucun service de télémétrie ici.
    console.error('Plantage du rendu', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid h-full place-items-center px-4">
        <div className="max-w-lg rounded-xl border border-danger/40 bg-danger/10 p-6">
          <h1 className="text-base font-semibold text-danger">L’application s’est arrêtée</h1>
          <p className="mt-2 text-sm">
            Rien n’est perdu : tout est enregistré sur ton compte Supabase. Recharger suffit
            presque toujours.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-surface-2/70 p-2 font-mono text-xs whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => location.reload()}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink"
            >
              Recharger
            </button>
            <button
              type="button"
              onClick={async () => {
                // Purge complète : caches et service worker. Utile quand une
                // mise à jour laisse un cache en travers.
                if (window.caches) {
                  const names = await caches.keys()
                  await Promise.all(names.map((name) => caches.delete(name)))
                }
                if (navigator.serviceWorker) {
                  const regs = await navigator.serviceWorker.getRegistrations()
                  await Promise.all(regs.map((reg) => reg.unregister()))
                }
                location.reload()
              }}
              className="inline-flex h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium text-ink"
            >
              Vider le cache et recharger
            </button>
          </div>
        </div>
      </div>
    )
  }
}
