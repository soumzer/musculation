import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useEngineVersionCheck } from './useEngineVersionCheck'
import { ENGINE_VERSION } from '../engine/program-generator'
import { db } from '../db'
import type { WorkoutProgram, ActiveSessionState } from '../db/types'

const userId = 1

async function addProgram(engineVersion: number | undefined): Promise<number> {
  return await db.workoutPrograms.add({
    userId,
    name: 'Test Program',
    type: 'upper_lower',
    sessions: [],
    isActive: true,
    createdAt: new Date(),
    ...(engineVersion !== undefined ? { engineVersion } : {}),
  } as WorkoutProgram)
}

async function addActiveSession(programId: number) {
  await db.activeSession.put({
    id: 1,
    programId,
    sessionIndex: 0,
    phase: 'in_progress',
    currentExerciseIdx: 0,
    exerciseStatuses: [],
    sessionStartTime: new Date(),
    warmupChecked: [],
    draftSets: [],
    restTimerEndTime: null,
    updatedAt: new Date(),
  } as ActiveSessionState)
}

// Wait long enough for the hook's async effect to settle, then assert no upgrade.
async function expectNoUpgrade(result: { current: { upgraded: boolean } }) {
  await new Promise((r) => setTimeout(r, 50))
  expect(result.current.upgraded).toBe(false)
}

describe('useEngineVersionCheck', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('does nothing when userId is undefined', async () => {
    const { result } = renderHook(() => useEngineVersionCheck(undefined))
    await expectNoUpgrade(result)
  })

  it('does nothing when no active program exists', async () => {
    const { result } = renderHook(() => useEngineVersionCheck(userId))
    await expectNoUpgrade(result)
  })

  it('does nothing when active program engineVersion equals ENGINE_VERSION', async () => {
    await addProgram(ENGINE_VERSION)
    const { result } = renderHook(() => useEngineVersionCheck(userId))
    await expectNoUpgrade(result)
  })

  it('does nothing when an activeSession is in progress (even with older engineVersion)', async () => {
    const programId = await addProgram(ENGINE_VERSION - 1)
    await addActiveSession(programId)
    const { result } = renderHook(() => useEngineVersionCheck(userId))
    await expectNoUpgrade(result)
  })

  it('exposes a dismiss() that flips upgraded back to false', async () => {
    const { result } = renderHook(() => useEngineVersionCheck(undefined))
    await waitFor(() => expect(result.current.dismiss).toBeTypeOf('function'))
    result.current.dismiss()
    expect(result.current.upgraded).toBe(false)
  })
})
