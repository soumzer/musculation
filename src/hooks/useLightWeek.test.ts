import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useLightWeek } from './useLightWeek'
import { db } from '../db'
import { exerciseCatalog } from '../data/exercises'
import { buildCoachSessions, kettlebellProgram } from '../data/coach-program'
import type { UserProfile } from '../db/types'

let userId: number

beforeEach(async () => {
  await db.exercises.clear()
  await db.workoutPrograms.clear()
  await db.userProfiles.clear()
  await db.exercises.bulkAdd(exerciseCatalog.map((e) => ({ ...e })))
  userId = await db.userProfiles.add({
    name: 'Yassine', daysPerWeek: 3, minutesPerSession: 40,
    createdAt: new Date(), updatedAt: new Date(),
  } as UserProfile) as number
  await db.workoutPrograms.add({
    userId,
    name: kettlebellProgram.name,
    type: 'custom',
    sessions: buildCoachSessions(kettlebellProgram, await db.exercises.toArray()),
    isActive: true,
    createdAt: new Date(),
    isCoach: true,
    coachId: 'kettlebell',
    startedAt: new Date(),
  })
})

describe('useLightWeek', () => {
  it('s\'active pour 7 jours puis s\'annule', async () => {
    const { result } = renderHook(() => useLightWeek(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())
    expect(result.current.state!.until).toBeUndefined()

    await act(async () => { await result.current.setLightWeek(true) })
    await waitFor(() => expect(result.current.state!.until).toBeTruthy())
    const jours = (new Date(result.current.state!.until!).getTime() - Date.now()) / (24 * 3600 * 1000)
    expect(jours).toBeGreaterThan(6.9)
    expect(jours).toBeLessThan(7.1)

    await act(async () => { await result.current.setLightWeek(false) })
    await waitFor(() => expect(result.current.state!.until).toBeUndefined())
  })

  it('une semaine allégée expirée ne compte plus', async () => {
    const program = (await db.workoutPrograms.where('userId').equals(userId).first())!
    await db.workoutPrograms.update(program.id!, {
      coachLightWeekUntil: new Date(Date.now() - 3600 * 1000).toISOString(),
    })
    const { result } = renderHook(() => useLightWeek(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())
    expect(result.current.state!.until).toBeUndefined()
  })

  it('pas de programme coach actif → rien à afficher', async () => {
    await db.workoutPrograms.clear()
    const { result } = renderHook(() => useLightWeek(userId))
    await waitFor(() => expect(result.current.state).toBeNull())
  })
})
