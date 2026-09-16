import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useCoachProgram } from './useCoachProgram'
import { useRegenerateProgram } from './useRegenerateProgram'
import { useEngineVersionCheck } from './useEngineVersionCheck'
import { db } from '../db'
import { seedExercises } from '../data/seed'
import { yassineProgram, jannaProgram } from '../data/coach-program'
import type { UserProfile, WorkoutProgram } from '../db/types'

const userId = 1

async function activeProgram(): Promise<WorkoutProgram | undefined> {
  return db.workoutPrograms.where('userId').equals(userId).filter((p) => p.isActive).first()
}

async function addAutoProgram(): Promise<number> {
  return db.workoutPrograms.add({
    userId,
    name: 'Auto',
    type: 'upper_lower',
    sessions: [{ name: 'Upper', order: 0, exercises: [] }],
    isActive: true,
    createdAt: new Date('2026-08-01'),
    engineVersion: 1, // volontairement ancien : ne doit PAS déclencher la régénération
  }) as Promise<number>
}

describe('useCoachProgram', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
    await db.userProfiles.add({ id: userId, name: 'Test', daysPerWeek: 4, minutesPerSession: 45 } as UserProfile)
    await seedExercises()
  })

  it('active le programme coach et désactive le programme automatique (sans le supprimer)', async () => {
    const autoId = await addAutoProgram()
    const { result } = renderHook(() => useCoachProgram())

    const res = await result.current.activate(userId, 'yassine')
    expect(res.success).toBe(true)

    const active = await activeProgram()
    expect(active?.isCoach).toBe(true)
    expect(active?.type).toBe('custom')
    expect(active?.coachVersion).toBe(yassineProgram.version)
    expect(active?.coachId).toBe('yassine')
    expect(active?.startedAt).toBeInstanceOf(Date)
    expect(active?.prepRoutine).toHaveLength(5)
    expect(active?.sessions).toHaveLength(5)
    expect(active?.sessions[0].exercises.every((e) => e.exerciseId > 0)).toBe(true)

    const auto = await db.workoutPrograms.get(autoId)
    expect(auto?.isActive).toBe(false)
  })

  it('ré-activer met à jour en place et conserve startedAt', async () => {
    const { result } = renderHook(() => useCoachProgram())
    await result.current.activate(userId, 'yassine')
    const first = await activeProgram()
    const startedAt = first!.startedAt!

    await new Promise((r) => setTimeout(r, 5))
    await result.current.activate(userId, 'yassine')

    const all = await db.workoutPrograms.where('userId').equals(userId).toArray()
    expect(all.filter((p) => p.isCoach)).toHaveLength(1)
    expect((await activeProgram())!.startedAt!.getTime()).toBe(startedAt.getTime())
  })

  it('désactiver restaure le dernier programme automatique', async () => {
    const autoId = await addAutoProgram()
    const { result } = renderHook(() => useCoachProgram())
    await result.current.activate(userId, 'yassine')

    const res = await result.current.deactivate(userId)
    expect(res).toEqual({ success: true, restored: true })
    expect((await activeProgram())?.id).toBe(autoId)
  })

  it('désactiver sans programme automatique → restored: false', async () => {
    const { result } = renderHook(() => useCoachProgram())
    await result.current.activate(userId, 'yassine')
    const res = await result.current.deactivate(userId)
    expect(res).toEqual({ success: true, restored: false })
    expect(await activeProgram()).toBeUndefined()
  })

  it('regenerate et refresh refusent tant que le coach est actif', async () => {
    const { result: coach } = renderHook(() => useCoachProgram())
    await coach.current.activate(userId, 'yassine')
    const before = await activeProgram()

    const { result: regen } = renderHook(() => useRegenerateProgram())
    const r1 = await regen.current.regenerate(userId)
    const r2 = await regen.current.refresh(userId)
    expect(r1.success).toBe(false)
    expect(r1.error).toMatch(/coach/i)
    expect(r2.success).toBe(false)

    const after = await activeProgram()
    expect(after?.id).toBe(before?.id)
    expect(after?.isCoach).toBe(true)
  })

  it('passer de Yassine à Janna remplace le programme coach (nouveau startedAt, 3 séances, pas de prépa)', async () => {
    const { result } = renderHook(() => useCoachProgram())
    await result.current.activate(userId, 'yassine')
    const first = await activeProgram()
    await db.workoutPrograms.update(first!.id!, { startedAt: new Date('2026-08-01') })

    const res = await result.current.activate(userId, 'janna')
    expect(res.success).toBe(true)
    const active = await activeProgram()
    expect(active?.coachId).toBe('janna')
    expect(active?.coachVersion).toBe(jannaProgram.version)
    expect(active?.name).toBe('Programme coach — Janna')
    expect(active?.sessions).toHaveLength(3)
    expect(active?.prepRoutine).toHaveLength(4)
    expect(active!.startedAt!.getTime()).toBeGreaterThan(new Date('2026-08-01').getTime())

    const all = await db.workoutPrograms.where('userId').equals(userId).toArray()
    expect(all.filter((p) => p.isCoach && p.isActive)).toHaveLength(1)
    expect(all.filter((p) => p.isCoach)).toHaveLength(2)
  })

  it('un programme stocké sans coachId (avant Janna) est traité comme celui de Yassine', async () => {
    const { result } = renderHook(() => useCoachProgram())
    await result.current.activate(userId, 'yassine')
    const first = await activeProgram()
    const startedAt = first!.startedAt!
    await db.workoutPrograms.update(first!.id!, { coachId: undefined, coachVersion: 1 })

    await result.current.activate(userId, 'yassine')
    const active = await activeProgram()
    expect(active?.id).toBe(first?.id)
    expect(active?.coachId).toBe('yassine')
    expect(active!.startedAt!.getTime()).toBe(startedAt.getTime())
  })

  it('la vérification de version moteur ignore le programme coach', async () => {
    const { result: coach } = renderHook(() => useCoachProgram())
    await coach.current.activate(userId, 'yassine')
    const id = (await activeProgram())!.id
    // Simule un programme coach produit par un vieux moteur.
    await db.workoutPrograms.update(id!, { engineVersion: 1 })

    const { result } = renderHook(() => useEngineVersionCheck(userId))
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.upgraded).toBe(false)
    expect((await activeProgram())?.id).toBe(id)
  })
})
