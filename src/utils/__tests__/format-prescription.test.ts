import { describe, it, expect } from 'vitest'
import { formatPrescription, formatReps, formatRestLabel } from '../format-prescription'

describe('formatReps', () => {
  it('reps, fourchettes et unilatéral', () => {
    expect(formatReps({ targetReps: 8 })).toBe('8')
    expect(formatReps({ targetReps: 6, targetRepsMax: 10 })).toBe('6-10')
    expect(formatReps({ targetReps: 8, perSide: 'jambe' })).toBe('8/jambe')
  })

  it('gainage court : en secondes', () => {
    expect(formatReps({ targetReps: 30, isTimeBased: true })).toBe('30s')
    expect(formatReps({ targetReps: 45, isTimeBased: true, perSide: 'côté' })).toBe('45s/côté')
    expect(formatReps({ targetReps: 90, isTimeBased: true })).toBe('90s')
  })

  it('chrono long (≥ 2 min pile) : en minutes', () => {
    expect(formatReps({ targetReps: 720, isTimeBased: true })).toBe('12 min')
    expect(formatReps({ targetReps: 1200, isTimeBased: true })).toBe('20 min')
    // 2 min 30 n'est pas un multiple de 60 → on reste en secondes.
    expect(formatReps({ targetReps: 150, isTimeBased: true })).toBe('150s')
  })

  it('portage : une distance en mètres', () => {
    expect(formatReps({ targetReps: 30, isDistance: true })).toBe('30 m')
    expect(formatReps({ targetReps: 30, isDistance: true, perSide: 'côté' })).toBe('30 m/côté')
  })

  it('formatPrescription colle séries et reps', () => {
    expect(formatPrescription({ sets: 1, targetReps: 720, isTimeBased: true })).toBe('1 x 12 min')
    expect(formatPrescription({ sets: 3, targetReps: 8, perSide: 'bras' })).toBe('3 x 8/bras')
    expect(formatPrescription({ sets: 3, targetReps: 30, isDistance: true, perSide: 'côté' })).toBe('3 x 30 m/côté')
  })
})

describe('formatRestLabel', () => {
  it('secondes, minutes pleines, minutes et secondes', () => {
    expect(formatRestLabel(45)).toBe('45s')
    expect(formatRestLabel(60)).toBe('1min')
    expect(formatRestLabel(90)).toBe('1m30s')
  })
})
