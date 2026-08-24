import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { AuthGate } from './features/auth/AuthGate'
import { StoreProvider } from './lib/state'
import { isConfigured } from './lib/supabase'
import './index.css'

const host = document.getElementById('root')
if (!host) throw new Error('Élément #root introuvable dans index.html.')

/**
 * Variables d'environnement oubliées : plutôt qu'une page blanche, on dit quoi
 * faire. Elles sont lues au **build**, donc les ajouter sur Vercel ne suffit
 * pas — il faut relancer un déploiement.
 */
function MissingConfig() {
  return (
    <div className="grid h-full place-items-center px-4">
      <div className="max-w-md rounded-xl border border-danger/40 bg-danger/10 p-6">
        <h1 className="text-base font-semibold text-danger">Configuration Supabase absente</h1>
        <p className="mt-2 text-sm">
          Les variables <code className="font-mono text-xs">VITE_SUPABASE_URL</code> et{' '}
          <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> ne sont pas définies.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            En local : les renseigner dans <code className="font-mono text-xs">.env.local</code>,
            puis redémarrer <code className="font-mono text-xs">npm run dev</code>.
          </li>
          <li>
            Sur Vercel : Settings → Environment Variables, puis{' '}
            <strong className="text-ink">relancer un déploiement</strong> — elles sont lues au
            moment du build, pas à l’exécution.
          </li>
        </ul>
      </div>
    </div>
  )
}

createRoot(host).render(
  <StrictMode>
    {isConfigured ? (
      <AuthGate>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthGate>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
)
