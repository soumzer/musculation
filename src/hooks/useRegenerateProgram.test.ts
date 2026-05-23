import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useRegenerateProgram } from './useRegenerateProgram'
import { db } from '../db'
import { seedExercises } from '../data/seed'
import type { UserProfile } from '../db/types'

const userId = 1

async function setupBaseProfile() {
  await db.userProfiles.add({
    id: userId,
    name: 'Test',
    daysPerWeek: 4,
    minutesPerSession: 60,
  } as UserProfile)
  await seedExercises()
  // No gym equipment → bodyweight catalogue triggers; we don't care which split
  // is picked, only that regenerate produces a program.
}

describe('useRegenerateProgram — swap preservation', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await setupBaseProfile()
  })

  it('preserves a user swap across a regenerate call', async () => {
    const { result } = renderHook(() => useRegenerateProgram())

    // 1. First regenerate — creates the initial active program.
    await result.current.regenerate(userId)
    const beforeProgram = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()
    expect(beforeProgram).toBeDefined()
    expect(beforeProgram!.sessions.length).toBeGreaterThan(0)

    // 2. Pick the first exercise of the first session, simulate a user swap
    // by updating exerciseId while leaving defaultExerciseId in place.
    const session = beforeProgram!.sessions[0]
    expect(session.exercises.length).toBeGreaterThan(0)
    const target = session.exercises[0]
    expect(target.slotLabel).toBeDefined()
    expect(target.defaultExerciseId).toBeDefined()

    // Choose any other exercise id that isn't already used in the session
    // and isn't the current default.
    const usedIds = new Set(session.exercises.map(e => e.exerciseId))
    const allExercises = await db.exercises.toArray()
    const candidate = allExercises.find(e => e.id !== undefined && !usedIds.has(e.id))
    expect(candidate).toBeDefined()
    const swappedId = candidate!.id!

    const patchedSessions = beforeProgram!.sessions.map((s, sIdx) =>
      sIdx === 0
        ? {
            ...s,
            exercises: s.exercises.map((e, eIdx) =>
              eIdx === 0 ? { ...e, exerciseId: swappedId } : e,
            ),
          }
        : s,
    )
    await db.workoutPrograms.update(beforeProgram!.id!, { sessions: patchedSessions })

    // 3. Regenerate again — the swap should survive.
    await waitFor(() => expect(result.current.isRegenerating).toBe(false))
    await result.current.regenerate(userId)

    const afterProgram = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()
    expect(afterProgram).toBeDefined()
    const newFirstSession = afterProgram!.sessions.find(s => s.name === session.name)
    expect(newFirstSession).toBeDefined()
    const newSlot = newFirstSession!.exercises.find(e => e.slotLabel === target.slotLabel)
    expect(newSlot).toBeDefined()
    expect(newSlot!.exerciseId).toBe(swappedId)
    // The default stays equal to what the generator originally picked, so the
    // swap relationship persists.
    expect(newSlot!.defaultExerciseId).not.toBe(swappedId)
  })

  it('does not carry over fields when there is no swap', async () => {
    const { result } = renderHook(() => useRegenerateProgram())
    await result.current.regenerate(userId)
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()
    expect(program).toBeDefined()
    // After a fresh regenerate with no prior swaps, every slot should have
    // exerciseId === defaultExerciseId.
    for (const session of program!.sessions) {
      for (const ex of session.exercises) {
        expect(ex.exerciseId).toBe(ex.defaultExerciseId)
      }
    }
  })
})
