import type { PerSide } from '../db/types'

/**
 * Texte court d'une prescription : « 3 × 8 », « 3 × 6-10 », « 3 × 30s/côté ».
 * Partagé entre l'aperçu Home, l'écran séance et le carnet — un seul format.
 */
export interface PrescriptionLike {
  sets: number
  targetReps: number
  targetRepsMax?: number
  isTimeBased?: boolean
  perSide?: PerSide
}

export function formatReps(p: Omit<PrescriptionLike, 'sets'>): string {
  const range = p.targetRepsMax !== undefined && p.targetRepsMax !== p.targetReps
    ? `${p.targetReps}-${p.targetRepsMax}`
    : `${p.targetReps}`
  const unit = p.isTimeBased ? 's' : ''
  const side = p.perSide ? `/${p.perSide}` : ''
  return `${range}${unit}${side}`
}

export function formatPrescription(p: PrescriptionLike): string {
  return `${p.sets} x ${formatReps(p)}`
}

/** Repos lisible : « 90s » → « 1m30s », « 60s » → « 1min », « 45s » → « 45s ». */
export function formatRestLabel(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m${secs}s` : `${mins}min`
  }
  return `${seconds}s`
}
