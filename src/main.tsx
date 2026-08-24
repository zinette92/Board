import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { AuthGate } from './features/auth/AuthGate'
import { StoreProvider } from './lib/state'
import './index.css'

const host = document.getElementById('root')
if (!host) throw new Error('Élément #root introuvable dans index.html.')

createRoot(host).render(
  <StrictMode>
    <AuthGate>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthGate>
  </StrictMode>,
)
