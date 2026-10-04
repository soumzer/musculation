import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useCoachLadder } from './useCoachLadder'
import { db } from '../db'
import { exerciseCatalog } from '../data/exercises'
import { buildCoachSessions, kettlebellProgram } from '../data/coach-program'
import type { UserProfile } from '../db/types'

const IRON_CARDIO = 'Iron Cardio (clean + press + squat kettlebell)'
let userId: number

async function setup(): Promise<void> {
  await db.exercises.clear()
  await db.workoutPrograms.clear()
  await db.userProfiles.clear()
  await db.exercises.bulkAdd(exerciseCatalog.map((e) => ({ ...e })))
  userId = await db.userProfiles.add({
    name: 'Yassine', daysPerWeek: 3, minutesPerSession: 40,
    createdAt: new Date(), updatedAt: new Date(),
  } as UserProfile) as number
  const catalog = await db.exercises.toArray()
  await db.workoutPrograms.add({
    userId,
    name: kettlebellProgram.name,
    type: 'custom',
    sessions: buildCoachSessions(kettlebellProgram, catalog),
    isActive: true,
    createdAt: new Date(),
    isCoach: true,
    coachId: 'kettlebell',
    coachVersion: kettlebellProgram.version,
    startedAt: new Date(),
  })
}

async function activeProgram() {
  return (await db.workoutPrograms.where('userId').equals(userId).filter((p) => p.isActive).first())!
}

function ironCardio(sessions: Awaited<ReturnType<typeof activeProgram>>['sessions']) {
  const id = sessions[0].exercises[0].exerciseId
  return sessions.flatMap((s) => s.exercises).filter((e) => e.exerciseId === id)
}

describe('useCoachLadder', () => {
  beforeEach(setup)

  it('démarre au premier palier, verrouillé', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())

    expect(result.current.state!.items).toHaveLength(3)
    expect(result.current.state!.items[0]).toMatchObject({
      exerciseName: IRON_CARDIO,
      stepIndex: 0,
      stepCount: 9,
    })
    expect(result.current.state!.items[0].current.label).toBe('12 kg — 12 min (technique seulement)')
    expect(result.current.state!.items[0].next!.label).toBe('14 kg — 15 min')
    expect(result.current.state!.canAdvance).toBe(false)
  })

  it('deux séances propres débloquent le palier, une ratée casse la série', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())

    await act(async () => { await result.current.recordCriteria(true) })
    await waitFor(() => expect(result.current.state!.streak).toBe(1))
    expect(result.current.state!.canAdvance).toBe(false)

    await act(async () => { await result.current.recordCriteria(true) })
    await waitFor(() => expect(result.current.state!.canAdvance).toBe(true))

    await act(async () => { await result.current.recordCriteria(false) })
    await waitFor(() => expect(result.current.state!.canAdvance).toBe(false))
    expect(result.current.state!.streak).toBe(0)
  })

  it('monter réécrit la prescription des DEUX séances et remet le compteur à zéro', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())

    const before = ironCardio((await activeProgram()).sessions)
    expect(before).toHaveLength(2)
    expect(before.every((e) => e.targetReps === 720)).toBe(true)

    await act(async () => { await result.current.recordCriteria(true) })
    await act(async () => { await result.current.recordCriteria(true) })
    await waitFor(() => expect(result.current.state!.canAdvance).toBe(true))

    await act(async () => { await result.current.advance(IRON_CARDIO) })
    await waitFor(() => expect(result.current.state!.items[0].stepIndex).toBe(1))

    const program = await activeProgram()
    expect(program.coachLadder).toEqual({ [IRON_CARDIO]: 1 })
    expect(ironCardio(program.sessions).every((e) => e.targetReps === 900)).toBe(true)
    expect(ironCardio(program.sessions).every((e) => e.ladderWeightKg === 14)).toBe(true)
    // Une marche à la fois : il faut de nouveau deux séances propres.
    expect(program.coachCriteria).toEqual([])
    expect(result.current.state!.canAdvance).toBe(false)
  })

  it('ne dépasse jamais le dernier palier', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())

    for (let i = 0; i < 12; i++) {
      await act(async () => { await result.current.advance(IRON_CARDIO) })
    }
    await waitFor(() => expect(result.current.state!.items[0].stepIndex).toBe(8))
    expect(result.current.state!.items[0].next).toBeUndefined()
  })

  it('la semaine allégée s\'active, s\'annule, et marque sa date de fin', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())
    expect(result.current.state!.lightWeekUntil).toBeUndefined()

    await act(async () => { await result.current.setLightWeek(true) })
    await waitFor(() => expect(result.current.state!.lightWeekUntil).toBeTruthy())
    const until = new Date(result.current.state!.lightWeekUntil!)
    const jours = (until.getTime() - Date.now()) / (24 * 3600 * 1000)
    expect(jours).toBeGreaterThan(6.9)
    expect(jours).toBeLessThan(7.1)

    await act(async () => { await result.current.setLightWeek(false) })
    await waitFor(() => expect(result.current.state!.lightWeekUntil).toBeUndefined())
  })

  it('propose un changement de stimulus après 3 semaines sans palier', async () => {
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeTruthy())
    // Programme démarré aujourd'hui : rien à signaler.
    expect(result.current.state!.staleStimulus).toBe(false)

    const program = await activeProgram()
    await db.workoutPrograms.update(program.id!, {
      startedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    })
    await waitFor(() => expect(result.current.state!.staleStimulus).toBe(true))

    // Monter d'un palier remet le compteur des 3 semaines à zéro.
    await act(async () => { await result.current.advance(IRON_CARDIO) })
    await waitFor(() => expect(result.current.state!.staleStimulus).toBe(false))
    expect((await activeProgram()).coachLastAdvanceAt).toBeTruthy()
  })

  it('pas de programme coach actif → rien à afficher', async () => {
    await db.workoutPrograms.clear()
    const { result } = renderHook(() => useCoachLadder(userId))
    await waitFor(() => expect(result.current.state).toBeNull())
  })
})
