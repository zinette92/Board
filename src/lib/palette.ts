/**
 * Couleurs d'étiquettes.
 *
 * Une seule valeur par couleur, et non un couple clair/sombre : chaque teinte
 * est choisie à une luminosité moyenne, puis mélangée à la transparence par
 * `color-mix`. Le fond de la puce hérite donc automatiquement de la surface,
 * ce qui la rend lisible dans les deux thèmes sans variante `dark:` — laquelle
 * ne suivrait de toute façon pas le sélecteur `[data-theme]`.
 */

import type { CSSProperties } from 'react'
import type { LabelColor } from './types'

export const LABEL_COLOR_VALUES: Record<LabelColor, string> = {
  slate: 'oklch(0.62 0.03 260)',
  red: 'oklch(0.62 0.19 25)',
  amber: 'oklch(0.73 0.16 70)',
  green: 'oklch(0.64 0.16 145)',
  teal: 'oklch(0.66 0.11 195)',
  blue: 'oklch(0.62 0.17 255)',
  violet: 'oklch(0.6 0.19 300)',
  pink: 'oklch(0.66 0.19 350)',
}

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  slate: 'Ardoise',
  red: 'Rouge',
  amber: 'Ambre',
  green: 'Vert',
  teal: 'Turquoise',
  blue: 'Bleu',
  violet: 'Violet',
  pink: 'Rose',
}

/** Équivalents hex des 8 noms historiques — `<input type="color">` ne parle que hex. */
export const LABEL_COLOR_HEX: Record<LabelColor, string> = {
  slate: '#64748b',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  pink: '#ec4899',
}

/**
 * Depuis la pipette libre (18/08), une couleur d'étiquette est un hex — mais
 * les lignes anciennes portent encore un nom (`red`, `blue`…) : on traduit.
 */
export function resolveLabelColor(color: string): string {
  return (LABEL_COLOR_VALUES as Record<string, string>)[color] ?? color
}

export function labelColorToHex(color: string): string {
  return (LABEL_COLOR_HEX as Record<string, string>)[color] ?? color
}

export function chipStyle(color: string): CSSProperties {
  const value = resolveLabelColor(color)
  return {
    backgroundColor: `color-mix(in oklab, ${value} 20%, transparent)`,
    borderColor: `color-mix(in oklab, ${value} 45%, transparent)`,
  }
}

export function dotStyle(color: string): CSSProperties {
  return { backgroundColor: resolveLabelColor(color) }
}

export const CATEGORY_COLORS = {
  health: 'oklch(0.64 0.16 145)',
  business: 'oklch(0.62 0.17 255)',
  personal: 'oklch(0.66 0.19 320)',
} as const

/**
 * Fond d'une colonne de liste — toujours **opaque** (jamais de photo qui
 * transparaît derrière les cartes), et **gris par défaut** (demandes du user) :
 * sans couleur choisie, c'est la surface secondaire grise qui s'applique, avec
 * ou sans fond d'écran — les cartes, blanches, s'en détachent comme sur Trello.
 */
export function listTintStyle(color: LabelColor | null, hasWallpaper: boolean): CSSProperties {
  if (color) {
    const value = LABEL_COLOR_VALUES[color]
    return {
      backgroundColor: `color-mix(in oklab, ${value} 20%, var(--surface))`,
      borderColor: `color-mix(in oklab, ${value} 45%, var(--border))`,
    }
  }
  if (hasWallpaper) {
    return { backgroundColor: 'var(--surface-2)' }
  }
  return {}
}
