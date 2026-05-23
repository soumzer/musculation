import { useCallback, useState } from 'react'
import { db } from '../db'
import { generateProgram, ENGINE_VERSION } from '../engine/program-generator'
import type { ProgramSession, WorkoutProgram } from '../db/types'

/**
 * Re-apply user swaps from the previous program onto a freshly generated one.
 *
 * A swap is detected on the OLD program by `exerciseId !== defaultExerciseId`
 * for a given ProgramExercise. We index those by (sessionName, slotLabel) and
 * patch the matching slot in the new program. Slots that no longer exist
 * (renamed/removed) silently drop their swap, which is the desired behavior
 * when the program structure has changed.
 */
function applyUserSwaps(
  newSessions: ProgramSession[],
  oldProgram: WorkoutProgram | undefined,
): ProgramSession[] {
  if (!oldProgram) return newSessions
  const swaps = new Map<string, number>() // key: "sessionName||slotLabel"
  for (const oldSession of oldProgram.sessions) {
    for (const ex of oldSession.exercises) {
      if (!ex.slotLabel || ex.defaultExerciseId === undefined) continue
      if (ex.exerciseId === ex.defaultExerciseId) continue
      swaps.set(`${oldSession.name}||${ex.slotLabel}`, ex.exerciseId)
    }
  }
  if (swaps.size === 0) return newSessions
  return newSessions.map((s) => ({
    ...s,
    exercises: s.exercises.map((ex) => {
      if (!ex.slotLabel) return ex
      const key = `${s.name}||${ex.slotLabel}`
      const swappedId = swaps.get(key)
      if (swappedId === undefined) return ex
      return { ...ex, exerciseId: swappedId }
    }),
  }))
}

/**
 * Hook that returns a function to regenerate the workout program.
 *
 * Used when health conditions change — reads current user profile, conditions,
 * equipment, weights, and the exercise catalog, then generates a fresh program
 * while deactivating (not deleting) the old one. User swaps from the previous
 * active program are preserved across regeneration.
 */
export function useRegenerateProgram() {
  const [isRegenerating, setIsRegenerating] = useState(false)

  const regenerate = useCallback(async (userId: number): Promise<{ success: boolean; error?: string }> => {
    setIsRegenerating(true)
    try {
      // 1. Read the current user profile
      const profile = await db.userProfiles.get(userId)
      if (!profile) {
        return { success: false, error: 'Profil utilisateur introuvable.' }
      }

      // 2. Read current active health conditions
      const conditions = await db.healthConditions
        .where('userId').equals(userId)
        .filter(c => c.isActive)
        .toArray()

      // 3. Read equipment
      const equipment = await db.gymEquipment
        .where('userId').equals(userId)
        .toArray()

      // 4. Read exercise catalog
      const exerciseCatalog = await db.exercises.toArray()

      // 5. Generate the new program
      const generatedProgram = generateProgram(
        {
          userId,
          conditions,
          equipment,
          daysPerWeek: profile.daysPerWeek,
          minutesPerSession: profile.minutesPerSession,
        },
        exerciseCatalog,
      )

      // 6a. Read the previous active program (if any) so we can carry swaps over.
      const previousProgram = await db.workoutPrograms
        .where('userId').equals(userId)
        .filter(p => p.isActive)
        .first()

      const patchedSessions = applyUserSwaps(generatedProgram.sessions, previousProgram)

      // 6b. Deactivate old + save new in a single transaction
      // Note: ProgramExercise is pure prescription (sets/reps/rest).
      // Progression data (weights) lives in WorkoutSession logs, not here.
      // No merge needed — always use freshly generated parameters.
      await db.transaction('rw', db.workoutPrograms, async () => {
        const activePrograms = await db.workoutPrograms
          .where('userId').equals(userId)
          .filter(p => p.isActive)
          .toArray()

        for (const prog of activePrograms) {
          if (prog.id !== undefined) {
            await db.workoutPrograms.update(prog.id, { isActive: false })
          }
        }

        await db.workoutPrograms.add({
          userId,
          name: generatedProgram.name,
          type: generatedProgram.type,
          sessions: patchedSessions,
          isActive: true,
          createdAt: new Date(),
          engineVersion: ENGINE_VERSION,
        })
      })

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.'
      return { success: false, error: message }
    } finally {
      setIsRegenerating(false)
    }
  }, [])

  /** Refresh = regenerate but exclude all current exercise IDs to get new variations */
  const refresh = useCallback(async (userId: number): Promise<{ success: boolean; error?: string }> => {
    setIsRegenerating(true)
    try {
      const profile = await db.userProfiles.get(userId)
      if (!profile) return { success: false, error: 'Profil utilisateur introuvable.' }

      const conditions = await db.healthConditions
        .where('userId').equals(userId)
        .filter(c => c.isActive)
        .toArray()

      const equipment = await db.gymEquipment
        .where('userId').equals(userId)
        .toArray()

      const exerciseCatalog = await db.exercises.toArray()

      // Collect current exercise IDs to exclude
      const oldProgram = await db.workoutPrograms
        .where('userId').equals(userId)
        .filter(p => p.isActive)
        .first()

      const currentExerciseIds = oldProgram?.sessions
        ?.flatMap(s => s.exercises.map(e => e.exerciseId)) ?? []

      const generatedProgram = generateProgram(
        {
          userId,
          conditions,
          equipment,
          daysPerWeek: profile.daysPerWeek,
          minutesPerSession: profile.minutesPerSession,
          excludeExerciseIds: currentExerciseIds,
        },
        exerciseCatalog,
      )

      // Deactivate old + save new in a single transaction
      await db.transaction('rw', db.workoutPrograms, async () => {
        const activePrograms = await db.workoutPrograms
          .where('userId').equals(userId)
          .filter(p => p.isActive)
          .toArray()

        for (const prog of activePrograms) {
          if (prog.id !== undefined) {
            await db.workoutPrograms.update(prog.id, { isActive: false })
          }
        }

        await db.workoutPrograms.add({
          userId,
          name: generatedProgram.name,
          type: generatedProgram.type,
          sessions: generatedProgram.sessions,
          isActive: true,
          createdAt: new Date(),
          engineVersion: ENGINE_VERSION,
        })
      })

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.'
      return { success: false, error: message }
    } finally {
      setIsRegenerating(false)
    }
  }, [])

  return { regenerate, refresh, isRegenerating }
}
