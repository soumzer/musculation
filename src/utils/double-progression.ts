import type { NotebookEntry } from '../db/types'

/**
 * Double progression (programme coach) : on monte la charge quand le haut de
 * la fourchette est atteint sur TOUTES les séries. +5 kg sur machines et
 * poulies, +2,5 kg sur haltères et kettlebell.
 */

export interface ProgressionAdvice {
  /** first = jamais fait · increase = monte la charge · hold = garde la charge · bodyweight = poids de corps au max */
  kind: 'first' | 'increase' | 'hold' | 'bodyweight'
  /** Charge à afficher / pré-remplir (null si inconnue ou poids de corps). */
  weightKg: number | null
  increment: number
  message: string
}

/** Incréments par défaut (programme de Yassine) : +2,5 kg haltères/kettlebell, +5 kg machines et poulies. */
export const DEFAULT_INCREMENTS = { machine: 5, free: 2.5 }

/** Haltères/kettlebell → `free`, tout le reste (machines, poulies, poids de corps lesté) → `machine`. */
export function incrementFor(equipmentNeeded: string[], increments: { machine: number; free: number } = DEFAULT_INCREMENTS): number {
  const free = equipmentNeeded.some((e) => e === 'dumbbells' || e === 'kettlebell')
  return free ? increments.free : increments.machine
}

function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : `${kg}`.replace('.', ',')
}

export function doubleProgression(
  lastEntry: NotebookEntry | null,
  /** `isDistance` : la cible est une distance en mètres, pas des répétitions. */
  target: { sets: number; reps: number; repsMax?: number; isDistance?: boolean },
  increment: number,
): ProgressionAdvice {
  const top = target.repsMax ?? target.reps
  const unit = target.isDistance ? 'm' : 'reps'
  const rangeLabel = target.repsMax !== undefined ? `${target.reps}-${target.repsMax}` : `${target.reps}`

  if (!lastEntry || lastEntry.sets.length === 0) {
    return {
      kind: 'first',
      weightKg: null,
      increment,
      message: `Première fois : une charge où tu tiens ${rangeLabel} ${unit} avec 0-1 en réserve.`,
    }
  }

  const sets = lastEntry.sets
  const weight = sets[sets.length - 1].weightKg
  const allTop = sets.length >= target.sets && sets.every((s) => s.reps >= top)

  if (allTop && weight <= 0) {
    return {
      kind: 'bodyweight',
      weightKg: null,
      increment,
      message: `Haut de la fourchette atteint partout : lest +${fmtKg(increment)} kg ou variante plus dure.`,
    }
  }

  if (allTop) {
    const next = weight + increment
    return {
      kind: 'increase',
      weightKg: next,
      increment,
      message: `Monte à ${fmtKg(next)} kg — ${top} ${unit} atteintes sur toutes les séries la dernière fois.`,
    }
  }

  return {
    kind: 'hold',
    weightKg: weight > 0 ? weight : null,
    increment,
    message: weight > 0
      ? `Garde ${fmtKg(weight)} kg, vise ${top} ${unit} sur les ${target.sets} séries.`
      : `Vise ${top} ${unit} sur les ${target.sets} séries.`,
  }
}
