/**
 * Les colonnes vers lesquelles l'outil envoie des cartes de lui-même.
 *
 * Elles sont désignées par **nom**, comme la destination d'une automatisation
 * ([[lib/models.ts]]) et comme les sections de la barre du bas
 * ([[lib/dock.ts]]) : aucune colonne « spéciale » en base, le user réordonne
 * et renomme son tableau sans rien casser. Si le nom n'existe pas encore, la
 * liste est créée au moment de l'envoi plutôt que de perdre la carte.
 */

/** Une copie de carte modèle atterrit ici : c'est une tâche à faire. */
export const LIST_TODAY = 'TODAY'

/** Une carte mise en attente rejoint cette colonne. */
export const LIST_WAITING = 'WAITING'
