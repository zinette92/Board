/**
 * Le trait de séparation d'une liste.
 *
 * Une carte dont le titre n'est qu'une rangée de tirets n'est pas une tâche :
 * c'est un trait qui coupe une colonne en deux blocs. Aucune colonne en base,
 * aucune migration — le titre suffit à la reconnaître, comme les sections de
 * la barre du bas se reconnaissent au nom de leur liste ([[lib/dock.ts]]).
 */

/** Ce qu'on tape pour en créer un. */
export const SEPARATOR_TITLE = '---'

/** Trois tirets ou plus, et rien d'autre. */
export function isSeparator(title: string): boolean {
  return /^-{3,}$/.test(title.trim())
}
