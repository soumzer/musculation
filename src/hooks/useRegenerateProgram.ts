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
 * Drop engine slots the user manually deleted in the old program. Each
 * `ProgramSession.deletedSlotLabels` carries the list of engine slotLabels the
 * user removed via the reorder page; we filter them out of the fresh program
 * and carry the list forward so the deletion survives subsequent regens. Slots
 * that no longer exist in the new engine (renamed/removed) are silently a
 * no-op. The deletedSlotLabels list itself is preserved verbatim — once a slot
 * is added back through the reorder UI it'd be added as a fresh custom exo,
 * not as the engine slot.
 */
function applyUserDeletions(
  newSessions: ProgramSession[],
  oldProgram: WorkoutProgram | undefined,
): ProgramSession[] {
  if (!oldProgram) return newSessions
  return newSessions.map((newSession) => {
    const oldSession = oldProgram.sessions.find((s) => s.name === newSession.name)
    if (!oldSession) return newSession
    const deleted = oldSession.deletedSlotLabels ?? []
    if (deleted.length === 0) return newSession
    const deletedSet = new Set(deleted)
    return {
      ...newSession,
      exercises: newSession.exercises.filter((e) => !e.slotLabel || !deletedSet.has(e.slotLabel)),
      deletedSlotLabels: deleted,
    }
  })
}

/**
 * Re-append user-added exercises from the previous program onto the fresh one.
 * User adds are tagged with a synthetic slotLabel starting with `__custom__`
 * (set by the reorder page's handleAdd). We walk the old session, collect those
 * exos, and append them — skipping any whose exerciseId already appears in the
 * new session (i.e. the engine independently happened to generate it as a
 * normal slot, no point duplicating). applyUserOrder, which runs after this,
 * uses the synthetic label to sort them into the user's chosen position.
 */
function applyUserAdditions(
  newSessions: ProgramSession[],
  oldProgram: WorkoutProgram | undefined,
): ProgramSession[] {
  if (!oldProgram) return newSessions
  return newSessions.map((newSession) => {
    const oldSession = oldProgram.sessions.find((s) => s.name === newSession.name)
    if (!oldSession) return newSession
    const customs = oldSession.exercises.filter((e) => e.slotLabel?.startsWith('__custom__'))
    if (customs.length === 0) return newSession
    const presentIds = new Set(newSession.exercises.map((e) => e.exerciseId))
    const toAdd = customs.filter((c) => !presentIds.has(c.exerciseId))
    if (toAdd.length === 0) return newSession
    return {
      ...newSession,
      exercises: [...newSession.exercises, ...toAdd],
    }
  })
}

/**
 * Re-apply the user's custom exercise order from the previous program. The
 * order is detected by comparing each session's slotLabel sequence against
 * the natural engine order; if the user reordered slots in the old program,
 * we sort the new program's exercises to mirror that sequence.
 *
 * Slots in the new program that are absent from the old order (newly added
 * by the engine) keep their relative position at the END. Slots present in
 * the old order but absent in the new (removed) silently drop out. The `order`
 * field on each ProgramExercise is renumbered to match the final position.
 */
function applyUserOrder(
  newSessions: ProgramSession[],
  oldProgram: WorkoutProgram | undefined,
): ProgramSession[] {
  if (!oldProgram) return newSessions
  return newSessions.map((newSession) => {
    const oldSession = oldProgram.sessions.find((s) => s.name === newSession.name)
    if (!oldSession) return newSession
    // Build the desired slot order from the old session.
    const oldSlotOrder = oldSession.exercises
      .map((e) => e.slotLabel)
      .filter((l): l is string => typeof l === 'string')
    if (oldSlotOrder.length === 0) return newSession
    const oldIndex = new Map<string, number>()
    oldSlotOrder.forEach((label, i) => { if (!oldIndex.has(label)) oldIndex.set(label, i) })
    // Sort new exercises by old slot index; unknown slots go to the end
    // in their original engine order.
    const known: typeof newSession.exercises = []
    const unknown: typeof newSession.exercises = []
    for (const ex of newSession.exercises) {
      if (ex.slotLabel && oldIndex.has(ex.slotLabel)) known.push(ex)
      else unknown.push(ex)
    }
    known.sort((a, b) => (oldIndex.get(a.slotLabel!) ?? 0) - (oldIndex.get(b.slotLabel!) ?? 0))
    const sorted = [...known, ...unknown]
    // Renumber the order field to match the final position.
    return { ...newSession, exercises: sorted.map((e, idx) => ({ ...e, order: idx + 1 })) }
  })
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

      // Four-step patch:
      //  1. swaps     — preserve exerciseId override on engine slots
      //  2. deletions — drop engine slots the user removed
      //  3. additions — re-append user-added (custom) exos
      //  4. order     — sort the final list to mirror the user's session order
      const swapped = applyUserSwaps(generatedProgram.sessions, previousProgram)
      const afterDeletions = applyUserDeletions(swapped, previousProgram)
      const afterAdditions = applyUserAdditions(afterDeletions, previousProgram)
      const patchedSessions = applyUserOrder(afterAdditions, previousProgram)

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

      // Preserve user curation across the refresh: deletions and custom adds
      // are user choices that should survive even when they explicitly ask for
      // new engine variations. Swaps and order are intentionally NOT carried
      // here — refresh's whole point is to get fresh slot picks, so honouring
      // an old swap on a new slot wouldn't make sense.
      const afterDeletions = applyUserDeletions(generatedProgram.sessions, oldProgram)
      const afterAdditions = applyUserAdditions(afterDeletions, oldProgram)

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
          sessions: afterAdditions,
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
