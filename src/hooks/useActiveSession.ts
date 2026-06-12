import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ActiveSessionState } from '../db/types'

const MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

export function useActiveSession(): ActiveSessionState | null {
  // Le check d'expiration vit dans la query (pas dans le render — Date.now()
  // y est impur). La fraîcheur est réévaluée à chaque écriture de la table.
  const row = useLiveQuery(async () => {
    const r = await db.activeSession.get(1)
    if (!r) return null
    const updatedAt = r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt)
    if (Date.now() - updatedAt.getTime() > MAX_AGE_MS) return null
    return r
  })

  return row ?? null
}
