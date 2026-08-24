import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { Button, Field, TextInput } from '../../components/ui'
import { supabase } from '../../lib/supabase'

/**
 * Portail d'authentification : rien de l'application ne se monte tant qu'il
 * n'y a pas de session.
 *
 * C'est délibéré — le magasin de données ne doit jamais démarrer sans session,
 * sinon toutes ses requêtes partiraient sans jeton et reviendraient vides à
 * cause de la RLS, ce qui ressemblerait à « mes données ont disparu ».
 * Se déconnecter démonte l'arbre, donc l'état en mémoire s'efface tout seul.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return <div className="grid h-full place-items-center text-sm text-muted">Chargement…</div>
  }
  if (!session) return <SignIn />
  return <>{children}</>
}

/** Les messages bruts de l'API ne sont pas montrables : on traduit les cas connus. */
function readable(message: string): string {
  if (message === 'Invalid login credentials') return 'Adresse ou mot de passe incorrect.'
  if (message === 'Email not confirmed') {
    return "Ce compte n'est pas confirmé — coche « Auto Confirm User » dans Supabase."
  }
  // « Failed to fetch » : projet injoignable, en pause, ou URL mal renseignée.
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Serveur injoignable. Vérifie ta connexion, et que le projet Supabase n'est pas en pause."
  }
  return message
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const { error: cause } = await supabase.auth.signInWithPassword({ email, password })
    if (cause) setError(readable(cause.message))
    setBusy(false)
  }

  return (
    <div className="grid h-full place-items-center px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-surface p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div>
          <h1 className="text-lg font-semibold">Mon board</h1>
          <p className="mt-0.5 text-xs text-muted">Connexion requise.</p>
        </div>

        <Field label="Adresse e-mail">
          <TextInput
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Mot de passe">
          <TextInput
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={busy || !email || !password}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </div>
  )
}

/** Bouton de déconnexion, posé dans les réglages. */
export function SignOutButton() {
  return (
    <Button size="sm" onClick={() => void supabase.auth.signOut()}>
      Se déconnecter
    </Button>
  )
}
