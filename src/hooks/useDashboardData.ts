import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { NotebookEntry } from '../db/types'

export interface ExerciseHistory {
  exerciseId: number
  exerciseName: string
  /** All entries sorted by date descending */
  entries: NotebookEntry[]
  /** Best weight across all entries */
  bestWeightKg: number
  /** Most recent non-skipped entry's best weight */
  currentWeightKg: number
  /** Date of most recent entry */
  lastDate: Date
  /** Trend compared to 4+ entries ago */
  trend: 'up' | 'same' | 'down' | null
}

export interface SessionVolume {
  date: Date
  tonnageKg: number
  exerciseCount: number
  intensity: 'heavy' | 'volume' | 'moderate' | null
  /**
   * Name of the workout session (e.g. 'Lower 1 — Force'). Derived from a
   * matching WorkoutSession on the same calendar day, with a fallback to
   * inferring from the active program's exercise overlap. Undefined when
   * neither source can resolve a name.
   */
  sessionName?: string
  /**
   * Position of the resolved session in the active program (its `order` field).
   * Used by the UI to sort chips/filters in program sequence rather than by
   * frequency. Undefined when the name was matched against a deactivated
   * program or couldn't be resolved.
   */
  sessionOrder?: number
}

export interface DashboardData {
  exercises: ExerciseHistory[]
  /** Tonnage per session day, sorted most recent first */
  sessionVolumes: SessionVolume[]
  hasData: boolean
  isLoading: boolean
}

const emptyData: DashboardData = {
  exercises: [],
  sessionVolumes: [],
  hasData: false,
  isLoading: true,
}

export function useDashboardData(userId: number | undefined): DashboardData {
  const data = useLiveQuery(async (): Promise<DashboardData> => {
    if (!userId) return { ...emptyData, isLoading: false }

    const allEntries = await db.notebookEntries
      .where('userId')
      .equals(userId)
      .toArray()

    if (allEntries.length === 0) {
      return { ...emptyData, isLoading: false }
    }

    // Companion sources used to attach a sessionName to each day's tonnage:
    //   1. Formal WorkoutSession records (when the user clicked "Terminer")
    //   2. The active program — for days with notebook entries but no formal
    //      session, we match by exerciseId overlap (same heuristic as Calendar)
    const formalSessions = await db.workoutSessions
      .where('userId').equals(userId)
      .toArray()
    const activeProgram = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const formalByDay = new Map<string, string>()
    for (const ws of formalSessions) {
      const ref = ws.completedAt ?? ws.startedAt
      const d = ref instanceof Date ? ref : new Date(ref)
      formalByDay.set(dayKey(d), ws.sessionName)
    }

    // Group by exerciseName (more reliable than exerciseId, handles rehab exercises with id=0)
    const byName = new Map<string, NotebookEntry[]>()
    for (const entry of allEntries) {
      const key = entry.exerciseName
      if (!byName.has(key)) {
        byName.set(key, [])
      }
      byName.get(key)!.push(entry)
    }

    const exercises: ExerciseHistory[] = []
    for (const [, entries] of byName) {
      const exerciseId = entries[0].exerciseId
      // Sort by date descending
      entries.sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date)
        const dateB = b.date instanceof Date ? b.date : new Date(b.date)
        return dateB.getTime() - dateA.getTime()
      })

      const exerciseName = entries[0].exerciseName

      // Non-skipped entries with sets for weight calculations
      const withSets = entries.filter((e) => !e.skipped && e.sets.length > 0)

      const bestWeightKg = withSets.length > 0
        ? Math.max(...withSets.flatMap((e) => e.sets.map((s) => s.weightKg)))
        : 0

      const currentWeightKg = withSets.length > 0
        ? Math.max(...withSets[0].sets.map((s) => s.weightKg))
        : 0

      const lastDate = entries[0].date instanceof Date
        ? entries[0].date
        : new Date(entries[0].date)

      // Trend: compare most recent to 4+ entries ago
      let trend: 'up' | 'same' | 'down' | null = null
      if (withSets.length >= 2) {
        const previousIndex = Math.min(4, withSets.length - 1)
        const previousWeightKg = Math.max(
          ...withSets[previousIndex].sets.map((s) => s.weightKg),
        )
        if (currentWeightKg > previousWeightKg) trend = 'up'
        else if (currentWeightKg < previousWeightKg) trend = 'down'
        else trend = 'same'
      }

      exercises.push({
        exerciseId,
        exerciseName,
        entries,
        bestWeightKg,
        currentWeightKg,
        lastDate,
        trend,
      })
    }

    // Sort by most recently performed first
    exercises.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())

    // Compute tonnage per session day
    const byDay = new Map<string, { date: Date; tonnage: number; exerciseIds: Set<number>; intensities: Map<string, number> }>()
    for (const entry of allEntries) {
      if (entry.skipped || entry.sets.length === 0) continue
      const d = entry.date instanceof Date ? entry.date : new Date(entry.date)
      const key = dayKey(d)
      if (!byDay.has(key)) {
        byDay.set(key, { date: d, tonnage: 0, exerciseIds: new Set(), intensities: new Map() })
      }
      const day = byDay.get(key)!
      for (const s of entry.sets) {
        day.tonnage += s.weightKg * s.reps
      }
      day.exerciseIds.add(entry.exerciseId)
      if (entry.sessionIntensity && entry.sessionIntensity !== 'rehab') {
        day.intensities.set(entry.sessionIntensity, (day.intensities.get(entry.sessionIntensity) ?? 0) + 1)
      }
    }
    const sessionVolumes: SessionVolume[] = [...byDay.entries()]
      .map(([key, d]) => {
        // Dominant intensity = most frequent
        let intensity: 'heavy' | 'volume' | 'moderate' | null = null
        let maxCount = 0
        for (const [k, v] of d.intensities) {
          if (v > maxCount) { maxCount = v; intensity = k as 'heavy' | 'volume' | 'moderate' }
        }
        // Resolve session name: formal WorkoutSession first, then infer from
        // exerciseId overlap with the active program's sessions (≥2 matches
        // to avoid false positives on warmup-only or near-empty days).
        let sessionName = formalByDay.get(key)
        if (!sessionName && activeProgram) {
          let bestName: string | undefined
          let bestScore = 0
          for (const s of activeProgram.sessions) {
            const sIds = new Set(s.exercises.map(pe => pe.exerciseId))
            let score = 0
            for (const id of d.exerciseIds) { if (sIds.has(id)) score++ }
            if (score > bestScore) { bestScore = score; bestName = s.name }
          }
          if (bestScore >= 2) sessionName = bestName
        }
        // Resolve session order from the active program (used by UI sorting).
        let sessionOrder: number | undefined
        if (sessionName && activeProgram) {
          const match = activeProgram.sessions.find(s => s.name === sessionName)
          sessionOrder = match?.order
        }
        return { date: d.date, tonnageKg: Math.round(d.tonnage), exerciseCount: d.exerciseIds.size, intensity, sessionName, sessionOrder }
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    return {
      exercises,
      sessionVolumes,
      hasData: true,
      isLoading: false,
    }
  }, [userId])

  return data ?? emptyData
}
