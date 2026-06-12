import type { ProgramSession } from '../db/types'

/**
 * Devine le nom de la séance d'un jour à partir des exercices réellement
 * exécutés, en les recoupant avec les séances du programme actif. Au moins
 * 2 exercices doivent correspondre pour éviter les faux positifs (jour à
 * exercice unique ou warmup seul). Utilisé par le Calendrier et le Dashboard
 * pour les jours sans WorkoutSession formelle (« Terminer » jamais cliqué).
 */
export function inferSessionName(
  doneExerciseIds: ReadonlySet<number>,
  sessions: ProgramSession[],
): string | undefined {
  let bestName: string | undefined
  let bestScore = 0
  for (const s of sessions) {
    const sIds = new Set(s.exercises.map(pe => pe.exerciseId))
    let score = 0
    for (const id of doneExerciseIds) {
      if (sIds.has(id)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestName = s.name
    }
  }
  return bestScore >= 2 ? bestName : undefined
}
