import { useEffect } from 'react'

/**
 * Garde l'écran allumé tant que `active` est true — en salle, on consulte le
 * timer de repos entre les séries sans toucher au téléphone, et déverrouiller
 * l'écran à chaque série est la friction n°1 de l'app.
 *
 * Le navigateur relâche automatiquement le verrou quand l'app passe en
 * arrière-plan ; on le ré-acquiert au retour au premier plan. Best effort :
 * non supporté (vieux navigateurs) ou refusé (batterie faible) = silencieux.
 * Supporté par iOS Safari 16.4+ et Android Chrome.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        // L'effet a pu être nettoyé pendant l'attente du verrou
        if (cancelled) lock.release().catch(() => {})
      } catch { /* refus ou non supporté — pas critique */ }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lock?.release().catch(() => {})
    }
  }, [active])
}
