import { describe, it, expect } from 'vitest'
import { supersetIndices, supersetLabel, supersetRest } from '../superset'
import { formatPrescription, formatReps } from '../format-prescription'

const exos = [
  { supersetGroup: 'A', restSeconds: 0 },
  { supersetGroup: 'A', restSeconds: 90 },
  { supersetGroup: 'B', restSeconds: 0 },
  { supersetGroup: 'B', restSeconds: 60 },
  { restSeconds: 60 },
]

describe('superset helpers', () => {
  it('regroupe les exos par lettre', () => {
    expect(supersetIndices(exos, 0)).toEqual([0, 1])
    expect(supersetIndices(exos, 1)).toEqual([0, 1])
    expect(supersetIndices(exos, 3)).toEqual([2, 3])
    expect(supersetIndices(exos, 4)).toEqual([4])
  })

  it('étiquette A1/A2, null hors superset', () => {
    expect(supersetLabel(exos, 0)).toBe('A1')
    expect(supersetLabel(exos, 1)).toBe('A2')
    expect(supersetLabel(exos, 3)).toBe('B2')
    expect(supersetLabel(exos, 4)).toBeNull()
  })

  it('le repos du groupe est celui du dernier exo', () => {
    expect(supersetRest(exos, 0)).toBe(90)
    expect(supersetRest(exos, 2)).toBe(60)
    expect(supersetRest(exos, 4)).toBe(60)
  })
})

describe('formatPrescription', () => {
  it('cible fixe, fourchette, chrono, par côté', () => {
    expect(formatPrescription({ sets: 3, targetReps: 8 })).toBe('3 x 8')
    expect(formatPrescription({ sets: 3, targetReps: 6, targetRepsMax: 10 })).toBe('3 x 6-10')
    expect(formatPrescription({ sets: 3, targetReps: 10, targetRepsMax: 12, perSide: 'bras' })).toBe('3 x 10-12/bras')
    expect(formatPrescription({ sets: 3, targetReps: 30, isTimeBased: true, perSide: 'côté' })).toBe('3 x 30s/côté')
    expect(formatReps({ targetReps: 12, targetRepsMax: 12 })).toBe('12')
  })
})
