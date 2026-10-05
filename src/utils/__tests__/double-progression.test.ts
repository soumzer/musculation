import { describe, it, expect } from 'vitest'
import { doubleProgression, incrementFor } from '../double-progression'
import type { NotebookEntry } from '../../db/types'

const entry = (sets: [number, number][]): NotebookEntry => ({
  userId: 1, exerciseId: 1, exerciseName: 'X', date: new Date(), sessionIntensity: 'volume',
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })), skipped: false,
})
const target = { sets: 3, reps: 6, repsMax: 10 }

describe('double progression', () => {
  it('+2,5 kg haltères/kettlebell, +5 kg machines et poulies', () => {
    expect(incrementFor(['bench', 'dumbbells'])).toBe(2.5)
    expect(incrementFor(['kettlebell'])).toBe(2.5)
    expect(incrementFor(['cable'])).toBe(5)
    expect(incrementFor(['leg_press'])).toBe(5)
    expect(incrementFor([])).toBe(5)
    // Janna : +2 haltères
    expect(incrementFor(['dumbbells'], { machine: 5, free: 2 })).toBe(2)
    expect(incrementFor(['cable'], { machine: 5, free: 2 })).toBe(5)
  })

  it('première fois → consigne de choix de charge', () => {
    const a = doubleProgression(null, target, 2.5)
    expect(a.kind).toBe('first')
    expect(a.weightKg).toBeNull()
    expect(a.message).toContain('6-10')
  })

  it('haut de la fourchette sur toutes les séries → monte la charge', () => {
    const a = doubleProgression(entry([[20, 10], [20, 10], [20, 10]]), target, 2.5)
    expect(a.kind).toBe('increase')
    expect(a.weightKg).toBe(22.5)
    expect(a.message).toContain('22,5 kg')
  })

  it('une série sous le haut de la fourchette → garde la charge', () => {
    const a = doubleProgression(entry([[20, 10], [20, 10], [20, 8]]), target, 2.5)
    expect(a.kind).toBe('hold')
    expect(a.weightKg).toBe(20)
    expect(a.message).toContain('Garde 20 kg')
    expect(a.message).toContain('10 reps')
  })

  it('séries manquantes → garde la charge même si le haut est atteint', () => {
    const a = doubleProgression(entry([[20, 10], [20, 10]]), target, 2.5)
    expect(a.kind).toBe('hold')
  })

  it('poids de corps au max → lest ou variante', () => {
    const a = doubleProgression(entry([[0, 15], [0, 15], [0, 15]]), { sets: 3, reps: 8, repsMax: 15 }, 2.5)
    expect(a.kind).toBe('bodyweight')
    expect(a.weightKg).toBeNull()
  })

  it('cible fixe (sans fourchette) : le haut = la cible', () => {
    const a = doubleProgression(entry([[40, 4], [40, 4], [40, 4], [40, 4]]), { sets: 4, reps: 4 }, 5)
    expect(a.kind).toBe('increase')
    expect(a.weightKg).toBe(45)
  })
})

describe('doubleProgression — portage (distance)', () => {
  const entry = (weightKg: number, metres: number): NotebookEntry => ({
    userId: 1, exerciseId: 1, exerciseName: 'Marche valise', date: new Date(),
    sessionIntensity: 'volume', skipped: false,
    sets: Array.from({ length: 3 }, () => ({ weightKg, reps: metres })),
  })

  it('parle en mètres, jamais en reps', () => {
    const cible = { sets: 3, reps: 30, isDistance: true }
    expect(doubleProgression(null, cible, 2).message).toContain('30 m')
    expect(doubleProgression(null, cible, 2).message).not.toContain('reps')
    expect(doubleProgression(entry(16, 20), cible, 2).message).toContain('30 m')
    const monte = doubleProgression(entry(16, 30), cible, 2)
    expect(monte.kind).toBe('increase')
    expect(monte.message).toContain('18 kg')
    expect(monte.message).toContain('30 m')
  })
})
