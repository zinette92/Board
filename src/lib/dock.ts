/**
 * La barre du bas : quatre réserves qui ne sont pas du travail en cours.
 *
 * Le tableau ne doit montrer que les tâches du jour — MODELS, PIN, INBOX et
 * BACKLOG encombraient l'écran sans jamais être « en cours ». Elles restent
 * des listes ordinaires (mêmes cartes, même base, aucune migration), mais
 * s'affichent dans une barre flottante au lieu d'occuper une colonne.
 *
 * La section est retrouvée par **nom**, comme la destination d'une
 * automatisation ([[lib/models.ts]]) : les listes existantes basculent donc
 * toutes seules, sans rien déplacer.
 */

import type { List } from './types'

export const DOCK_SLOTS = ['models', 'pin', 'inbox', 'backlog'] as const
export type DockSlot = (typeof DOCK_SLOTS)[number]

/** Nom exact de la liste qui porte chaque section. */
export const DOCK_NAMES: Record<DockSlot, string> = {
  models: 'MODELS',
  pin: 'PIN',
  inbox: 'INBOX',
  backlog: 'BACKLOG',
}

export const DOCK_HINTS: Record<DockSlot, string> = {
  models: 'Les cartes modèles, que les automatisations dupliquent.',
  pin: 'Les informations importantes, toujours sous la main.',
  inbox: 'Les idées en vrac, pas encore construites.',
  backlog: 'Les tâches prêtes à partir sur le tableau.',
}

const keyOf = (name: string) => name.trim().toLowerCase()

/** La liste qui porte cette section, si elle existe. */
export function dockListOf(lists: List[], slot: DockSlot): List | undefined {
  return lists.find((list) => keyOf(list.name) === keyOf(DOCK_NAMES[slot]))
}

/** Cette liste appartient-elle à la barre — donc jamais une colonne du tableau ? */
export function isDockList(list: List): boolean {
  return DOCK_SLOTS.some((slot) => keyOf(DOCK_NAMES[slot]) === keyOf(list.name))
}
