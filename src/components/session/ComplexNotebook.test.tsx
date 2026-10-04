import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ComplexNotebook from './ComplexNotebook'
import { db } from '../../db'

const EXERCISE_ID = 901
const USER_ID = 1

function renderComplex(onNext = vi.fn(), extra: Partial<React.ComponentProps<typeof ComplexNotebook>> = {}) {
  render(
    <ComplexNotebook
      exercise={{
        exerciseId: EXERCISE_ID,
        exerciseName: 'Iron Cardio (clean + press + squat kettlebell)',
        instructions: 'Complexe enchaîné en continu, un tour par bras en alternance.',
      }}
      target={{ durationSeconds: 720, restSeconds: 120, intensity: 'volume', cue: '1 clean + 1 press + 1 squat' }}
      exerciseIndex={0}
      totalExercises={3}
      userId={USER_ID}
      onNext={onNext}
      onSkip={vi.fn()}
      {...extra}
    />,
  )
  return onNext
}

describe('ComplexNotebook', () => {
  beforeEach(async () => {
    await db.notebookEntries.clear()
  })

  it('annonce la durée et le repos en clair', () => {
    renderComplex()
    expect(screen.getByText('12 min au chrono — repos 2min')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
  })

  it('compte les tours et alterne le bras à chaque tour', async () => {
    const user = userEvent.setup()
    renderComplex()

    // Le premier tour se fait à gauche.
    expect(screen.getByText('Gauche')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+1 tour' }))
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Droite')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+1 tour' }))
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Gauche')).toBeInTheDocument()

    // Correction d'un tour compté en trop.
    await user.click(screen.getByRole('button', { name: '−1' }))
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('enregistre la charge et le nombre de tours, puis avance', async () => {
    const user = userEvent.setup()
    const onNext = renderComplex()

    await user.type(screen.getByPlaceholderText('kg'), '16')
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '+1 tour' }))
    await user.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    const entries = await db.notebookEntries.where('exerciseId').equals(EXERCISE_ID).toArray()
    expect(entries).toHaveLength(1)
    // La durée part avec : « 3 tours » ne veut rien dire sans elle.
    expect(entries[0].sets).toEqual([{ weightKg: 16, reps: 3, seconds: 720 }])
    expect(entries[0].skipped).toBe(false)
  })

  it('sans aucun tour, « Suivant » n\'enregistre rien', async () => {
    const user = userEvent.setup()
    const onNext = renderComplex()

    await user.click(screen.getByRole('button', { name: 'Suivant ›' }))

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(await db.notebookEntries.where('exerciseId').equals(EXERCISE_ID).count()).toBe(0)
  })

  it('rappelle la dernière séance : charge et tours', async () => {
    await db.notebookEntries.add({
      userId: USER_ID,
      exerciseId: EXERCISE_ID,
      exerciseName: 'Iron Cardio (clean + press + squat kettlebell)',
      date: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      sessionIntensity: 'volume',
      sets: [{ weightKg: 14, reps: 22 }],
      skipped: false,
    })
    renderComplex()
    expect(await screen.findByText('22 tours')).toBeInTheDocument()
    // La charge de la dernière fois est pré-remplie.
    await waitFor(() => expect(screen.getByPlaceholderText('kg')).toHaveValue(14))
  })

  it('le chrono reprend là où il en était après un rechargement', () => {
    // 7 min restantes sur les 12 du palier.
    renderComplex(vi.fn(), { initialChronoEndTime: Date.now() + 7 * 60 * 1000 })
    expect(screen.getByText('7:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('un chrono déjà expiré ne repart pas tout seul', () => {
    renderComplex(vi.fn(), { initialChronoEndTime: Date.now() - 60 * 1000 })
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeInTheDocument()
  })

  it('prévient le parent quand le chrono démarre, pour qu\'il soit sauvegardé', async () => {
    const user = userEvent.setup()
    const onChronoChange = vi.fn()
    renderComplex(vi.fn(), { onChronoChange })

    onChronoChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Démarrer' }))
    expect(onChronoChange).toHaveBeenCalledWith(expect.any(Number))
  })

  it('la durée se règle par minute, chrono à l\'arrêt', async () => {
    const user = userEvent.setup()
    renderComplex()
    expect(screen.getByText('12 min')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('14 min')).toBeInTheDocument()
    expect(screen.getByText('14:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByText('13 min')).toBeInTheDocument()
  })

  it('on ne peut pas changer la durée pendant que le chrono tourne', async () => {
    const user = userEvent.setup()
    renderComplex()
    await user.click(screen.getByRole('button', { name: 'Démarrer' }))
    expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '−' })).toBeDisabled()
  })

  it('la durée enregistrée est celle qu\'on a réglée', async () => {
    const user = userEvent.setup()
    const onNext = renderComplex()

    await user.click(screen.getByRole('button', { name: '+' })) // 13 min
    await user.type(screen.getByPlaceholderText('kg'), '16')
    await user.click(screen.getByRole('button', { name: '+1 tour' }))
    await user.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    const entries = await db.notebookEntries.where('exerciseId').equals(EXERCISE_ID).toArray()
    expect(entries[0].sets).toEqual([{ weightKg: 16, reps: 1, seconds: 13 * 60 }])
  })

  it('repart sur la durée de la dernière séance, pas sur celle du programme', async () => {
    await db.notebookEntries.add({
      userId: USER_ID,
      exerciseId: EXERCISE_ID,
      exerciseName: 'Iron Cardio (clean + press + squat kettlebell)',
      date: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      sessionIntensity: 'volume',
      sets: [{ weightKg: 16, reps: 24, seconds: 20 * 60 }],
      skipped: false,
    })
    renderComplex()
    expect(await screen.findByText('20 min')).toBeInTheDocument()
    // Le chrono se recale un microtask plus tard (useRestTimer).
    expect(await screen.findByText('20:00')).toBeInTheDocument()
    // Le texte de l'historique est découpé en plusieurs éléments.
    expect(screen.getByText((_, el) =>
      el?.className?.includes('text-zinc-300') === true
      && el.textContent?.replace(/\s+/g, ' ').includes('16 kg · 20 min · 24 tours') === true,
    )).toBeInTheDocument()
  })
})
