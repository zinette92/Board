/**
 * Notifications système du navigateur.
 *
 * Limite assumée et affichée à l'écran : une application locale ne tourne pas
 * en tâche de fond. Ces notifications ne peuvent donc apparaître que lorsque
 * l'onglet est ouvert. Le bandeau « à traiter » de l'onglet Rappels reste le
 * filet de sécurité, et un jour un service worker + Web Push (une fois déployé)
 * pourrait lever la contrainte.
 */

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function permissionState(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifyPermission
}

export async function requestPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission as NotifyPermission
  return (await Notification.requestPermission()) as NotifyPermission
}

export function notify(title: string, body: string, tag: string): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    // `tag` dédoublonne : deux appels identiques remplacent la même bulle.
    new Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}
