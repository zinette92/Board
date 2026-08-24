/**
 * Amorçage du compte : uniquement la **structure** — un tableau, ses trois
 * listes, quelques étiquettes.
 *
 * Volontairement sans cartes ni objectifs de démonstration : sur un compte de
 * production, du faux contenu à nettoyer est une nuisance, alors qu'un tableau
 * sans aucune colonne est inutilisable.
 */

import { makeBoard, makeLabel, makeList } from './create'
import { POSITION_STEP } from './ordering'
import * as repo from './repo'
import type { Snapshot } from './types'

const SEEDED_KEY = 'seeded'

/**
 * Une seule exécution par chargement de page, partagée par tous les appelants.
 *
 * Le drapeau en base ne suffit pas : en développement, StrictMode monte le
 * fournisseur deux fois, les deux appels lisent le drapeau avant que l'un ait
 * écrit, et l'amorçage se retrouve inséré en double.
 */
let pending: Promise<Snapshot | null> | null = null

export function seedIfEmpty(): Promise<Snapshot | null> {
  pending ??= seedOnce()
  return pending
}

async function seedOnce(): Promise<Snapshot | null> {
  if (await repo.readMeta<boolean>(SEEDED_KEY)) return null

  // Un compte qui a déjà des tableaux n'a rien à recevoir : on pose seulement
  // le drapeau pour ne plus reposer la question.
  const existing = await repo.boards.all()
  if (existing.length > 0) {
    await repo.writeMeta(SEEDED_KEY, true)
    return null
  }

  const labels = [
    makeLabel('Priorité', '#ef4444'),
    makeLabel('Rapide', '#22c55e'),
    makeLabel('En attente', '#f59e0b'),
    makeLabel('Administratif', '#3b82f6'),
    makeLabel('Santé', '#14b8a6'),
  ]

  const board = makeBoard('Mon tableau', '🎯', POSITION_STEP)
  const lists = [
    makeList(board.id, 'À faire', POSITION_STEP, { color: 'blue' }),
    makeList(board.id, 'En cours', POSITION_STEP * 2, { color: 'teal' }),
    makeList(board.id, 'Terminé', POSITION_STEP * 3, { color: 'green' }),
  ]

  // Le tableau d'abord : les listes le référencent par clé étrangère.
  await repo.boards.put(board)
  await Promise.all([repo.lists.putMany(lists), repo.labels.putMany(labels)])
  await repo.writeMeta(SEEDED_KEY, true)

  return { boards: [board], lists, cards: [], labels, goals: [], reminders: [] }
}

/**
 * Après une remise à zéro, le drapeau est effacé lui aussi. Sans ce rappel,
 * l'amorçage reviendrait au rechargement — l'inverse de ce qu'on demande.
 */
export async function markSeeded(): Promise<void> {
  await repo.writeMeta(SEEDED_KEY, true)
}
