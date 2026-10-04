import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import RoundsChart from './RoundsChart'
import { db } from '../../db'
import { exerciseCatalog } from '../../data/exercises'
import { buildCoachSessions, kettlebellProgram } from '../../data/coach-program'
import type { UserProfile } from '../../db/types'

const USER_ID = 1
let ironCardioId: number

async function setup(): Promise<void> {
  await db.exercises.clear()
  await db.workoutPrograms.clear()
  await db.notebookEntries.clear()
  await db.userProfiles.clear()
  await db.exercises.bulkAdd(exerciseCatalog.map((e) => ({ ...e })))
  await db.userProfiles.add({
    id: USER_ID, name: 'Yassine', daysPerWeek: 3, minutesPerSession: 40,
    createdAt: new Date(), updatedAt: new Date(),
  } as UserProfile)
  const catalog = await db.exercises.toArray()
  ironCardioId = catalog.find((e) => e.name.startsWith('Iron Cardio'))!.id!
  await db.workoutPrograms.add({
    userId: USER_ID,
    name: kettlebellProgram.name,
    type: 'custom',
    sessions: buildCoachSessions(kettlebellProgram, catalog),
    isActive: true,
    createdAt: new Date(),
    isCoach: true,
    coachId: 'kettlebell',
    startedAt: new Date(),
  })
}

async function addSession(daysAgo: number, weightKg: number, rounds: number, minutes?: number): Promise<void> {
  await db.notebookEntries.add({
    userId: USER_ID,
    exerciseId: ironCardioId,
    exerciseName: 'Iron Cardio (clean + press + squat kettlebell)',
    date: new Date(Date.now() - daysAgo * 24 * 3600 * 1000),
    sessionIntensity: 'volume',
    sets: [{ weightKg, reps: rounds, ...(minutes !== undefined ? { seconds: minutes * 60 } : {}) }],
    skipped: false,
  })
}

describe('RoundsChart', () => {
  beforeEach(setup)

  it('reste invisible tant qu\'il n\'y a qu\'une séance', async () => {
    await addSession(3, 12, 18)
    const { container } = render(<RoundsChart userId={USER_ID} />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('affiche les tours de la dernière séance et l\'écart avec la précédente', async () => {
    await addSession(7, 12, 18, 12)
    await addSession(3, 12, 21, 12)
    render(<RoundsChart userId={USER_ID} />)
    expect(await screen.findByText(/21 tours/)).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText(/Dernière séance : 12 kg · 12 min/)).toBeInTheDocument()
  })

  it('ne compare pas deux séances faites sur des durées différentes', async () => {
    await addSession(7, 12, 24, 20)
    await addSession(3, 12, 15, 12)
    render(<RoundsChart userId={USER_ID} />)
    expect(await screen.findByText(/15 tours/)).toBeInTheDocument()
    // −9 serait trompeur : la séance était plus courte de 8 minutes.
    expect(screen.queryByText('−9')).not.toBeInTheDocument()
  })

  it('ne compare pas deux séances faites à des charges différentes', async () => {
    await addSession(7, 12, 24, 12)
    await addSession(3, 14, 15, 12)
    render(<RoundsChart userId={USER_ID} />)
    expect(await screen.findByText(/15 tours/)).toBeInTheDocument()
    // −9 serait trompeur : la kettlebell a changé.
    expect(screen.queryByText('−9')).not.toBeInTheDocument()
    expect(screen.getByText(/Charges utilisées : 12, 14 kg/)).toBeInTheDocument()
  })

  it('pas de programme kettlebell actif → rien', async () => {
    await db.workoutPrograms.clear()
    await addSession(7, 12, 18)
    await addSession(3, 12, 21)
    const { container } = render(<RoundsChart userId={USER_ID} />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
