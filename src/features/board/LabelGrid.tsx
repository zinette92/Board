import { useEffect, useRef } from 'react'

import { Button } from '../../components/ui'
import { chipStyle } from '../../lib/palette'
import { useStore } from '../../lib/state'
import type { ID } from '../../lib/types'

/**
 * Le choix de l'étiquette, en grille.
 *
 * Règle du tableau : une carte en porte une, et une seule. On la choisit donc
 * à la création — avant même que la carte existe — plutôt que d'espérer qu'on
 * y repense après coup. C'est aussi ce qui fait qu'un dépôt dans l'agenda du
 * jour trouve toujours le bon calendrier Google ([[features/calendar/DayRail]]).
 */
export function LabelGrid({
  hint,
  onPick,
  onCancel,
}: {
  hint: string
  onPick: (labelId: ID) => void
  onCancel: () => void
}) {
  const store = useStore()
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    // En capture : l'Échap revient au titre, il ne referme pas la fiche ou la
    // barre qui nous contient.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancelRef.current()
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted">{hint}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {store.labels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => onPick(label.id)}
            className="truncate rounded-md border px-2 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={chipStyle(label.color)}
          >
            {label.name}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="self-start" onClick={onCancel}>
        ← Revenir au titre
      </Button>
    </div>
  )
}
