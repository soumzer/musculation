import type { ProgramExercise } from '../db/types'

/**
 * Helpers supersets — un groupe = les exos d'une séance qui partagent le même
 * `supersetGroup` (A, B, C…). Ils s'enchaînent sans repos ; le repos du groupe
 * est celui du dernier exo.
 */

/** Indices (dans la séance) des exos du même superset que `idx`. Seul si pas de groupe. */
export function supersetIndices(exercises: Pick<ProgramExercise, 'supersetGroup'>[], idx: number): number[] {
  const group = exercises[idx]?.supersetGroup
  if (!group) return [idx]
  return exercises.map((e, i) => (e.supersetGroup === group ? i : -1)).filter((i) => i >= 0)
}

/** Étiquette « A1 », « B2 »… ou null si l'exo n'est pas dans un superset. */
export function supersetLabel(exercises: Pick<ProgramExercise, 'supersetGroup'>[], idx: number): string | null {
  const group = exercises[idx]?.supersetGroup
  if (!group) return null
  const members = supersetIndices(exercises, idx)
  return `${group}${members.indexOf(idx) + 1}`
}

/** Repos du groupe = repos du dernier exo du superset. */
export function supersetRest(exercises: Pick<ProgramExercise, 'supersetGroup' | 'restSeconds'>[], idx: number): number {
  const members = supersetIndices(exercises, idx)
  return exercises[members[members.length - 1]].restSeconds
}
