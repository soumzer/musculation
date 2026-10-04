import { useCallback, useState } from 'react'
import { db } from '../db'
import { applyLadder, buildCoachSessions, getCoachProgramDef, type CoachProgramId } from '../data/coach-program'
import { ENGINE_VERSION } from '../engine/program-generator'

export interface CoachActionResult {
  success: boolean
  error?: string
  /**
   * Désactivation : true si un ancien programme automatique a été remis en
   * actif, false s'il n'y en avait aucun (l'appelant doit régénérer).
   */
  restored?: boolean
}

/**
 * Active / désactive un programme coach (data/coach-program.ts).
 *
 * Activation : les exos sont résolus depuis le catalogue en base, le programme
 * actif en cours est désactivé (pas supprimé), et un programme
 * `isCoach: true` est créé. Si LE MÊME programme coach est déjà actif, il est
 * mis à jour en place — `startedAt` est conservé pour ne pas fausser le
 * compteur de semaines. Un autre programme coach actif est remplacé (nouveau
 * `startedAt`).
 *
 * Désactivation : le programme coach passe inactif et le dernier programme
 * automatique est remis en actif s'il existe.
 */
export function useCoachProgram() {
  const [isWorking, setIsWorking] = useState(false)

  const activate = useCallback(async (userId: number, coachId: CoachProgramId): Promise<CoachActionResult> => {
    setIsWorking(true)
    try {
      const def = getCoachProgramDef(coachId)
      const catalog = await db.exercises.toArray()
      const sessions = buildCoachSessions(def, catalog)

      await db.transaction('rw', db.workoutPrograms, async () => {
        const actives = await db.workoutPrograms
          .where('userId').equals(userId)
          .filter((p) => p.isActive)
          .toArray()

        const sameCoach = actives.find((p) => p.isCoach && getCoachProgramDef(p.coachId).id === def.id)
        if (sameCoach?.id !== undefined) {
          await db.workoutPrograms.update(sameCoach.id, {
            name: def.name,
            // Le palier atteint survit à une mise à jour du programme.
            sessions: applyLadder(def, sessions, sameCoach.coachLadder, catalog),
            prepRoutine: def.prepRoutine,
            cooldownRoutine: def.cooldownRoutine,
            engineVersion: ENGINE_VERSION,
            coachId: def.id,
            coachVersion: def.version,
          })
          return
        }

        for (const prog of actives) {
          if (prog.id !== undefined) await db.workoutPrograms.update(prog.id, { isActive: false })
        }

        // Ce programme coach a-t-il déjà tourné ? On récupère sa progression
        // plutôt que de repartir du premier palier — passer sur un autre
        // programme et revenir ne doit rien effacer.
        const ancien = (await db.workoutPrograms.where('userId').equals(userId).toArray())
          .filter((p) => p.isCoach && p.coachId === def.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

        await db.workoutPrograms.add({
          userId,
          name: def.name,
          type: 'custom',
          sessions: applyLadder(def, sessions, ancien?.coachLadder, catalog),
          isActive: true,
          createdAt: new Date(),
          engineVersion: ENGINE_VERSION,
          isCoach: true,
          coachId: def.id,
          coachVersion: def.version,
          startedAt: new Date(),
          prepRoutine: def.prepRoutine,
          cooldownRoutine: def.cooldownRoutine,
          coachLadder: ancien?.coachLadder,
          coachCriteria: ancien?.coachCriteria,
          coachLastAdvanceAt: ancien?.coachLastAdvanceAt,
        })
      })

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.'
      return { success: false, error: message }
    } finally {
      setIsWorking(false)
    }
  }, [])

  const deactivate = useCallback(async (userId: number): Promise<CoachActionResult> => {
    setIsWorking(true)
    try {
      let restored = false
      await db.transaction('rw', db.workoutPrograms, async () => {
        const all = await db.workoutPrograms.where('userId').equals(userId).toArray()

        for (const prog of all) {
          if (prog.isCoach && prog.isActive && prog.id !== undefined) {
            await db.workoutPrograms.update(prog.id, { isActive: false })
          }
        }

        const lastAuto = all
          .filter((p) => !p.isCoach)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

        if (lastAuto?.id !== undefined) {
          await db.workoutPrograms.update(lastAuto.id, { isActive: true })
          restored = true
        }
      })
      return { success: true, restored }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.'
      return { success: false, error: message }
    } finally {
      setIsWorking(false)
    }
  }, [])

  return { activate, deactivate, isWorking }
}
