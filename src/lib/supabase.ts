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

/**
 * Configuration absente = oubli des variables d'environnement, de très loin le
 * ratage le plus courant d'un premier déploiement.
 *
 * On ne lève **pas** d'exception ici : ce module est importé avant que React ne
 * monte, donc une exception donnerait une page blanche sans le moindre indice.
 * On signale plutôt le problème, et `main.tsx` affiche un écran explicite.
 */
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url || 'https://non-configure.supabase.co',
  anonKey || 'non-configure',
  {
    auth: {
      // La session survit au rechargement et se renouvelle toute seule : sans
      // cela, il faudrait se reconnecter à chaque onglet.
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)

/** Durée de validité des URL signées (fichiers privés). */
export const SIGNED_URL_TTL = 60 * 60 * 8
