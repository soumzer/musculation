import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  applyLadder,
  canAdvanceLadder,
  getCoachProgramDef,
  isLightWeekActive,
  ladderExercises,
  ladderStepIndex,
  lightWeekEnd,
  shouldChangeStimulus,
  type CoachLadderStep,
} from '../data/coach-program'

export interface LadderItem {
  exerciseName: string
  stepIndex: number
  stepCount: number
  current: CoachLadderStep
  /** Absent quand l'exo est au dernier palier. */
  next?: CoachLadderStep
}

export interface CoachLadderState {
  items: LadderItem[]
  /** Les critères ont été validés sur les deux dernières séances concernées. */
  canAdvance: boolean
  /** Nombre de séances de suite déjà validées (0, 1 ou 2+). */
  streak: number
  /** Semaine allégée en cours : date de fin, sinon absent. */
  lightWeekUntil?: string
  /** Aucun palier franchi depuis 3 semaines. */
  staleStimulus: boolean
}

/**
 * Progression autorégulée du programme coach actif : où en est chaque exo à
 * paliers, et si le palier suivant est débloqué.
 *
 * Monter d'un palier réécrit la prescription dans le programme stocké et
 * remet le compteur de critères à zéro : une marche à la fois, et il faut
 * de nouveau deux séances propres pour la suivante.
 */
export function useCoachLadder(userId: number | undefined) {
  const state = useLiveQuery(async (): Promise<CoachLadderState | null> => {
    if (!userId) return null
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach) return null

    const def = getCoachProgramDef(program.coachId)
    const items = ladderExercises(def).map(({ name, ladder }): LadderItem => {
      const stepIndex = ladderStepIndex(ladder, program.coachLadder?.[name])
      return {
        exerciseName: name,
        stepIndex,
        stepCount: ladder.length,
        current: ladder[stepIndex],
        next: ladder[stepIndex + 1],
      }
    })
    if (items.length === 0) return null

    const criteria = program.coachCriteria ?? []
    const streak = criteria.at(-1)?.ok
      ? criteria.slice(-2).filter((c) => c.ok).length
      : 0

    const lightWeekUntil = isLightWeekActive(program.coachLightWeekUntil) ? program.coachLightWeekUntil : undefined

    return {
      items,
      canAdvance: canAdvanceLadder(criteria),
      streak,
      lightWeekUntil,
      staleStimulus: shouldChangeStimulus(program.coachLastAdvanceAt, program.startedAt),
    }
  }, [userId], undefined)

  const advance = useCallback(async (exerciseName: string): Promise<void> => {
    if (!userId) return
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach || program.id === undefined) return

    const def = getCoachProgramDef(program.coachId)
    const entry = ladderExercises(def).find((l) => l.name === exerciseName)
    if (!entry) return

    const nextIndex = ladderStepIndex(entry.ladder, (program.coachLadder?.[exerciseName] ?? 0) + 1)
    const coachLadder = { ...(program.coachLadder ?? {}), [exerciseName]: nextIndex }
    const catalog = await db.exercises.toArray()

    await db.workoutPrograms.update(program.id, {
      coachLadder,
      sessions: applyLadder(def, program.sessions, coachLadder, catalog),
      // Une marche à la fois : il faut de nouveau deux séances propres.
      coachCriteria: [],
      coachLastAdvanceAt: new Date().toISOString(),
    })
  }, [userId])

  /** Semaine allégée à la demande : 7 jours, moitié du volume, même charge. */
  const setLightWeek = useCallback(async (on: boolean): Promise<void> => {
    if (!userId) return
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach || program.id === undefined) return
    await db.workoutPrograms.update(program.id, {
      coachLightWeekUntil: on ? lightWeekEnd() : undefined,
    })
  }, [userId])

  /** Enregistre le résultat des critères d'une séance qui vient de finir. */
  const recordCriteria = useCallback(async (ok: boolean): Promise<void> => {
    if (!userId) return
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach || program.id === undefined) return
    const coachCriteria = [...(program.coachCriteria ?? []), { date: new Date().toISOString(), ok }].slice(-10)
    await db.workoutPrograms.update(program.id, { coachCriteria })
  }, [userId])

  return { state, advance, recordCriteria, setLightWeek }
}
