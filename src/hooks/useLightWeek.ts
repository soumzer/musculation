import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { isLightWeekActive, lightWeekEnd } from '../data/coach-program'

export interface LightWeekState {
  /** Semaine allégée en cours : date de fin, sinon absent. */
  until?: string
}

/**
 * Semaine allégée à la demande d'un programme coach : 7 jours à moitié du
 * volume, même charge. Déclenchée à la main — rien d'automatique, c'est
 * l'utilisateur qui sait quand la fatigue s'accumule.
 */
export function useLightWeek(userId: number | undefined) {
  const state = useLiveQuery(async (): Promise<LightWeekState | null> => {
    if (!userId) return null
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach) return null
    return { until: isLightWeekActive(program.coachLightWeekUntil) ? program.coachLightWeekUntil : undefined }
  }, [userId], undefined)

  const setLightWeek = useCallback(async (on: boolean): Promise<void> => {
    if (!userId) return
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach || program.id === undefined) return
    await db.workoutPrograms.update(program.id, {
      coachLightWeekUntil: on ? lightWeekEnd() : undefined,
    })
  }, [userId])

  return { state, setLightWeek }
}
