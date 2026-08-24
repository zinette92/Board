import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase, unique pour toute l'application.
 *
 * La clé « anon » est publique par conception : elle part dans le bundle et ne
 * donne aucun droit par elle-même — c'est la RLS, côté serveur, qui décide ce
 * que la session peut lire ou écrire. La clé de service, elle, n'a rien à faire
 * dans un frontend et n'est jamais référencée ici.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    "Configuration Supabase absente : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY " +
      '(fichier .env.local en local, variables d’environnement sur Vercel).',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // La session survit au rechargement et se renouvelle toute seule : sans
    // cela, il faudrait se reconnecter à chaque onglet.
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Durée de validité des URL signées (fichiers privés). */
export const SIGNED_URL_TTL = 60 * 60 * 8
