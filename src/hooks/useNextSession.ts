import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ProgramSession, WorkoutProgram } from '../db/types'

export interface NextSessionExercisePreview {
  name: string
  sets: number
  targetReps: number
  isRehab: boolean
  isTimeBased?: boolean
}

export interface NextSessionPreview {
  sessionName: string
  exercises: NextSessionExercisePreview[]
}

export interface NextSessionInfo {
  status: 'ready' | 'editing_window' | 'no_program' | 'rehab_day'
  nextSessionName?: string
  nextSessionIndex?: number
  programId?: number
  exerciseCount?: number
  estimatedMinutes?: number
  lastSessionDate?: Date
  hoursSinceLastSession?: number
  minimumRestHours: number
  nextSession: ProgramSession | null
  canStart: boolean
  restRecommendation: string | null
  program: WorkoutProgram | null
  preview: NextSessionPreview | null
  deloadReminder: string | null
  lastSessionName?: string
  lastSessionIndex?: number
  editingHoursRemaining?: number
  /** Active health condition zones — populated when status is 'rehab_day' */
  activeZones?: string[]
}

export function useNextSession(userId: number | undefined): NextSessionInfo | undefined {
  return useLiveQuery(async () => {
    if (!userId) return {
      status: 'no_program' as const,
      minimumRestHours: 24,
      nextSession: null,
      canStart: false,
      restRecommendation: null,
      program: null,
      preview: null,
      deloadReminder: null,
    }

    // Find active program for this user
    const activeProgram = await db.workoutPrograms
      .where('userId')
      .equals(userId)
      .and((p) => p.isActive)
      .first()

    if (!activeProgram || !activeProgram.sessions || activeProgram.sessions.length === 0) {
      return {
        status: 'no_program' as const,
        minimumRestHours: 24,
        nextSession: null,
        canStart: false,
        restRecommendation: null,
        program: null,
        preview: null,
        deloadReminder: null,
      }
    }

    // Find last completed workout session for this program
    const allSessions = await db.workoutSessions
      .where('programId')
      .equals(activeProgram.id!)
      .toArray()

    // Filter to completed sessions (have completedAt) and sort by completedAt desc
    const completedSessions = allSessions
      .filter((s) => s.completedAt)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))

    const lastSession = completedSessions.length > 0 ? completedSessions[0] : undefined

    // Determine next session index
    let nextSessionIndex = 0
    if (lastSession) {
      // Find the index of the last completed session by name
      const lastIndex = activeProgram.sessions.findIndex(
        (s) => s.name === lastSession.sessionName
      )
      if (lastIndex >= 0) {
        nextSessionIndex = (lastIndex + 1) % activeProgram.sessions.length
      }
    }

    // Fallback: check notebook entries newer than the last formal session.
    // Handles the case where the user did a session but never clicked "Terminer".
    const lastFormalDate = lastSession?.completedAt ?? new Date(0)
    const informalEntries = await db.notebookEntries
      .where('userId').equals(userId)
      .filter(e => {
        if (e.sessionIntensity === 'rehab' || e.skipped || e.sets.length === 0) return false
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d > lastFormalDate
      })
      .toArray()

    if (informalEntries.length >= 2) {
      // Find the most recent calendar day among those entries
      const latestMs = Math.max(...informalEntries.map(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d.getTime()
      }))
      const latestDay = new Date(latestMs)
      const dayEntries = informalEntries.filter(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d.getFullYear() === latestDay.getFullYear() &&
               d.getMonth() === latestDay.getMonth() &&
               d.getDate() === latestDay.getDate()
      })
      const doneExIds = new Set(dayEntries.map(e => e.exerciseId))

      // Match against program sessions by exerciseId overlap
      let bestIdx = -1, bestScore = 0
      activeProgram.sessions.forEach((s, idx) => {
        const sExIds = new Set(s.exercises.map(pe => pe.exerciseId))
        let score = 0
        for (const id of doneExIds) { if (sExIds.has(id)) score++ }
        if (score > bestScore) { bestScore = score; bestIdx = idx }
      })

      if (bestIdx >= 0 && bestScore >= 2) {
        nextSessionIndex = (bestIdx + 1) % activeProgram.sessions.length
      }
    }

    const nextProgramSession = activeProgram.sessions[nextSessionIndex]
    const exerciseCount = nextProgramSession.exercises.length

    // Deload reminder: count how many times this specific session has been completed
    const DELOAD_THRESHOLD = 5
    const sessionCompletionCount = completedSessions.filter(
      (s) => s.sessionName === nextProgramSession.name,
    ).length
    const deloadReminder = sessionCompletionCount >= DELOAD_THRESHOLD
      ? `Semaine ${sessionCompletionCount + 1} — pense au deload`
      : null

    // Estimate time from actual sets and rest per exercise
    // Formula:
    // - Per exercise: sets × (35s work + rest) + 90s transition
    // - Total + 10 min (5 min warmup + 5 min cooldown)
    let totalSeconds = 0
    for (const ex of nextProgramSession.exercises) {
      const setDuration = 35 // ~35 sec per working set
      const exerciseTime = ex.sets * (setDuration + ex.restSeconds)
      const transitionTime = 90 // ~1.5 min per exercise for setup/transition
      totalSeconds += exerciseTime + transitionTime
    }
    const warmupCooldown = 10 * 60 // 5 min warmup + 5 min cooldown
    const estimatedMinutes = Math.round((totalSeconds + warmupCooldown) / 60)

    const minimumRestHours = 10

    // Build session preview with exercise names
    const exerciseIds = nextProgramSession.exercises.map((e) => e.exerciseId)

    // Resolve exercise names from the exercises table
    const exerciseRecords = await db.exercises
      .where('id')
      .anyOf(exerciseIds)
      .toArray()
    const exerciseNameMap = new Map(exerciseRecords.map((e) => [e.id!, e.name]))

    const preview: NextSessionPreview = {
      sessionName: nextProgramSession.name,
      exercises: nextProgramSession.exercises.map((pe) => ({
        name: exerciseNameMap.get(pe.exerciseId) ?? `Exercice #${pe.exerciseId}`,
        sets: pe.sets,
        targetReps: pe.targetReps,
        isRehab: pe.isRehab,
        isTimeBased: pe.isTimeBased,
      })),
    }

    // Calculate hours since last session
    if (lastSession?.completedAt) {
      const now = new Date()
      const diffMs = now.getTime() - lastSession.completedAt.getTime()
      const hoursSinceLastSession = diffMs / (1000 * 60 * 60)

      if (hoursSinceLastSession < minimumRestHours) {
        const remainingHours = Math.ceil(minimumRestHours - hoursSinceLastSession)
        // Find the index of the last completed session so user can re-open it
        const lastSessionIndex = activeProgram.sessions.findIndex(
          (s) => s.name === lastSession.sessionName
        )
        return {
          status: 'editing_window' as const,
          programId: activeProgram.id!,
          lastSessionDate: lastSession.completedAt,
          hoursSinceLastSession,
          minimumRestHours,
          nextSession: null,
          canStart: false,
          restRecommendation: null,
          program: activeProgram,
          preview,
          deloadReminder: null,
          lastSessionName: lastSession.sessionName,
          lastSessionIndex: lastSessionIndex >= 0 ? lastSessionIndex : 0,
          editingHoursRemaining: remainingHours,
          nextSessionName: nextProgramSession.name,
          nextSessionIndex,
        }
      }
    }

    // Check if rehab day is needed (user has active conditions + no rehab since last session)
    const activeConditions = await db.healthConditions
      .where('userId').equals(userId)
      .filter(c => c.isActive)
      .toArray()

    if (activeConditions.length > 0 && lastSession?.completedAt) {
      // Check if any rehab entry exists since the last completed session
      const rehabSinceLast = await db.notebookEntries
        .where('userId').equals(userId)
        .filter(e => {
          if (e.sessionIntensity !== 'rehab') return false
          const d = e.date instanceof Date ? e.date : new Date(e.date)
          return d > lastSession.completedAt!
        })
        .first()

      if (!rehabSinceLast) {
        const zones = [...new Set(activeConditions.map(c => c.bodyZone))]
        return {
          status: 'rehab_day' as const,
          nextSessionName: nextProgramSession.name,
          nextSessionIndex,
          programId: activeProgram.id!,
          minimumRestHours,
          nextSession: null,
          canStart: false,
          restRecommendation: null,
          program: activeProgram,
          preview,
          deloadReminder: null,
          activeZones: zones,
        }
      }
    }

    return {
      status: 'ready' as const,
      nextSessionName: nextProgramSession.name,
      nextSessionIndex,
      programId: activeProgram.id!,
      exerciseCount,
      estimatedMinutes,
      lastSessionDate: lastSession?.completedAt,
      hoursSinceLastSession: lastSession?.completedAt
        ? (new Date().getTime() - lastSession.completedAt.getTime()) / (1000 * 60 * 60)
        : undefined,
      minimumRestHours,
      nextSession: nextProgramSession,
      canStart: true,
      restRecommendation: null,
      program: activeProgram,
      preview,
      deloadReminder,
    }
  }, [userId])
}
