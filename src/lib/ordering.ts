/**
 * Positions fractionnaires : insérer entre deux éléments ne réécrit que
 * l'élément déplacé, pas toute la colonne. Indispensable dès qu'on branchera
 * une vraie base — sinon chaque glisser-déposer devient N écritures.
 */

export const POSITION_STEP = 1000

/** En deçà, les flottants perdent en précision : il faut renuméroter. */
const MIN_GAP = 0.000001

export function positionAtEnd(positions: number[]): number {
  if (positions.length === 0) return POSITION_STEP
  return Math.max(...positions) + POSITION_STEP
}

export function positionAtStart(positions: number[]): number {
  if (positions.length === 0) return POSITION_STEP
  return Math.min(...positions) / 2
}

export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return POSITION_STEP
  if (before === undefined) return after! / 2
  if (after === undefined) return before + POSITION_STEP
  return (before + after) / 2
}

/**
 * Position à donner à un élément inséré à l'index `index` d'une liste ordonnée,
 * l'élément déplacé ayant déjà été retiré de `positions`.
 */
export function positionForIndex(positions: number[], index: number): number {
  const sorted = [...positions].sort((a, b) => a - b)
  return positionBetween(sorted[index - 1], sorted[index])
}

export function needsRenumber(positions: number[]): boolean {
  const sorted = [...positions].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] < MIN_GAP) return true
  }
  return false
}

/** Repart de 1000, 2000, 3000… en conservant l'ordre visible. */
export function renumber<T extends { position: number }>(items: T[]): T[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: (index + 1) * POSITION_STEP }))
}

export function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position
}
