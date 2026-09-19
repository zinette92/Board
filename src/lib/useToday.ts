import { useEffect, useState } from 'react'

import { today } from './dates'

/**
 * Le jour courant, qui change tout seul : revérifié chaque minute et au retour
 * sur l'onglet. Une appli installée reste ouverte des jours entiers — sans
 * cela, « aujourd'hui » resterait figé à la date d'ouverture. Reposer la même
 * chaîne ne provoque aucun re-rendu.
 */
export function useToday(): string {
  const [day, setDay] = useState(today)

  useEffect(() => {
    const refresh = () => setDay(today())
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return day
}
