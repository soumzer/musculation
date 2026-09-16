import type { Exercise } from '../db/types'

export interface SwapOption {
  exerciseId: number
  name: string
}

/**
 * Alternatives proposées par « Changer » dans le carnet.
 * Alternatives curées d'abord (ordre déclaré sur l'exo), puis auto-match
 * (même catégorie + au moins un muscle principal commun) en filet de sécurité
 * pour qu'un exo fraîchement ajouté au catalogue reste atteignable.
 * Extrait de SessionPage pour servir aussi l'écran superset.
 */
export function computeSwapOptions(
  current: Exercise | undefined,
  allExercises: Exercise[],
  usedIds: Set<number>,
): SwapOption[] {
  if (!current) return []
  const seen = new Set<number>()
  const result: SwapOption[] = []

  const canShow = (e: Exercise): boolean => {
    if (e.id === undefined) return false
    if (e.id === current.id) return false
    if (e.isRehab) return false
    if (usedIds.has(e.id)) return false
    if (seen.has(e.id)) return false
    return true
  }

  // 1. Curated alternatives, in the order declared on the exercise.
  const altNamesLower = (current.alternatives ?? []).map((n) => n.toLowerCase())
  const byNameLower = new Map(
    allExercises.filter((e) => e.id !== undefined).map((e) => [e.name.toLowerCase(), e]),
  )
  for (const lower of altNamesLower) {
    const e = byNameLower.get(lower)
    if (e && canShow(e)) {
      seen.add(e.id!)
      result.push({ exerciseId: e.id!, name: e.name })
    }
  }

  // 2. Auto-match: same category + at least one shared primary muscle.
  const currentMuscles = new Set(current.primaryMuscles.map((m) => m.toLowerCase()))
  for (const e of allExercises) {
    if (!canShow(e)) continue
    if (e.category !== current.category) continue
    const shares = e.primaryMuscles.some((m) => currentMuscles.has(m.toLowerCase()))
    if (!shares) continue
    seen.add(e.id!)
    result.push({ exerciseId: e.id!, name: e.name })
  }

  return result
}
