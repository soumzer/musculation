import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ExerciseNotebook from './ExerciseNotebook'
import { db } from '../../db'

const EXERCISE_ID = 801
const USER_ID = 1

/** Dernière séance réussie à fond : la double progression voudrait faire monter. */
async function lastSessionAtTop(weightKg: number): Promise<void> {
  await db.notebookEntries.add({
    userId: USER_ID,
    exerciseId: EXERCISE_ID,
    exerciseName: 'Kettlebell swing à un bras',
    date: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    sessionIntensity: 'volume',
    sets: Array.from({ length: 5 }, () => ({ weightKg, reps: 8 })),
    skipped: false,
  })
}

function renderNotebook(ladder?: { ladderLabel: string; ladderWeightKg: number }) {
  render(
    <ExerciseNotebook
      exercise={{
        exerciseId: EXERCISE_ID,
        exerciseName: 'Kettlebell swing à un bras',
        instructions: 'Charnière de hanche.',
        category: 'compound',
        primaryMuscles: ['fessiers'],
        isRehab: false,
        contraindications: [],
      }}
      activeZones={[]}
      target={{
        sets: 5, reps: 8, restSeconds: 75, intensity: 'volume',
        perSide: 'bras', increment: 2, ...ladder,
      }}
      exerciseIndex={1}
      totalExercises={3}
      userId={USER_ID}
      exerciseCatalog={[]}
      swapOptions={[]}
      onNext={vi.fn()}
      onSkip={vi.fn()}
      onSwap={vi.fn()}
    />,
  )
}

describe('ExerciseNotebook — exo à paliers', () => {
  beforeEach(async () => {
    await db.notebookEntries.clear()
  })

  it('sans palier, la double progression fait monter la charge', async () => {
    await lastSessionAtTop(14)
    renderNotebook()
    expect(await screen.findByText(/Monte à 16 kg/)).toBeInTheDocument()
  })

  it('avec un palier, la double progression se tait et le palier s\'affiche', async () => {
    await lastSessionAtTop(14)
    renderNotebook({ ladderLabel: '14 kg · 5 × 8 par bras', ladderWeightKg: 14 })

    expect(await screen.findByText('Palier : 14 kg · 5 × 8 par bras')).toBeInTheDocument()
    // Les 8 reps atteintes partout ne doivent PAS déclencher une montée :
    // c'est la validation des 3 critères qui décide.
    expect(screen.queryByText(/Monte à/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Incrément/)).not.toBeInTheDocument()
  })

  it('juste après être monté, le champ propose la charge du nouveau palier', async () => {
    await lastSessionAtTop(14)
    renderNotebook({ ladderLabel: '16 kg · 5 × 8 par bras', ladderWeightKg: 16 })
    // Deux champs « kg » sur un exo compound : l'échauffement puis la saisie
    // de série — c'est le dernier qui porte la charge de travail.
    await waitFor(() => {
      const champs = screen.getAllByPlaceholderText('kg')
      expect(champs[champs.length - 1]).toHaveValue(16)
    })
  })
})
