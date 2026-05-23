import { db } from '../db'
import type { UserProfile, HealthCondition, GymEquipment, Exercise, WorkoutProgram, WorkoutSession, ExerciseNote, NotebookEntry, PainReport, ActiveSessionState, ExerciseStatus, RehabHistoryEntry } from '../db/types'
import type { BodyZone, NotebookSet, SessionPhase } from '../db/types'

// Validation helpers
function isValidBackupStructure(data: unknown): data is {
  version: number
  profile: Record<string, unknown>
  conditions?: unknown[]
  equipment?: unknown[]
  exercises?: unknown[]
  programs?: unknown[]
  sessions?: unknown[]
  exerciseNotes?: unknown[]
  notebookEntries?: unknown[]
  painReports?: unknown[]
  activeSession?: unknown
  rehabHistory?: unknown[]
} {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.version === 'number' &&
    typeof obj.profile === 'object' && obj.profile !== null
  )
}

// Whitelist extractors - only copy known safe properties
function sanitizeCondition(c: Record<string, unknown>, userId: number): Omit<HealthCondition, 'id'> {
  return {
    userId,
    bodyZone: String(c.bodyZone ?? '') as HealthCondition['bodyZone'],
    label: String(c.label ?? ''),
    diagnosis: String(c.diagnosis ?? ''),
    since: String(c.since ?? ''),
    notes: String(c.notes ?? ''),
    isActive: Boolean(c.isActive ?? true),
    createdAt: c.createdAt ? new Date(String(c.createdAt)) : new Date(),
  }
}

function sanitizeEquipment(e: Record<string, unknown>, userId: number): Omit<GymEquipment, 'id'> {
  return {
    userId,
    name: String(e.name ?? ''),
    type: String(e.type ?? 'other') as GymEquipment['type'],
    isAvailable: Boolean(e.isAvailable ?? true),
    notes: String(e.notes ?? ''),
  }
}

function sanitizeProgram(p: Record<string, unknown>, userId: number): Omit<WorkoutProgram, 'id'> {
  return {
    userId,
    name: String(p.name ?? ''),
    type: String(p.type ?? 'custom') as WorkoutProgram['type'],
    sessions: Array.isArray(p.sessions) ? p.sessions as WorkoutProgram['sessions'] : [],
    isActive: Boolean(p.isActive ?? false),
    createdAt: p.createdAt ? new Date(String(p.createdAt)) : new Date(),
  }
}

function sanitizeSession(s: Record<string, unknown>, userId: number): Omit<WorkoutSession, 'id'> {
  return {
    userId,
    programId: Number(s.programId ?? 0),
    sessionName: String(s.sessionName ?? ''),
    startedAt: s.startedAt ? new Date(String(s.startedAt)) : new Date(),
    completedAt: s.completedAt ? new Date(String(s.completedAt)) : undefined,
    exercises: Array.isArray(s.exercises) ? s.exercises as WorkoutSession['exercises'] : [],
    endPainChecks: Array.isArray(s.endPainChecks) ? s.endPainChecks as WorkoutSession['endPainChecks'] : [],
    notes: String(s.notes ?? ''),
  }
}

function sanitizeNotebookEntry(e: Record<string, unknown>, userId: number): Omit<NotebookEntry, 'id'> {
  return {
    userId,
    exerciseId: Number(e.exerciseId ?? 0),
    exerciseName: String(e.exerciseName ?? ''),
    date: e.date ? new Date(String(e.date)) : new Date(),
    sessionIntensity: String(e.sessionIntensity ?? 'moderate') as NotebookEntry['sessionIntensity'],
    sets: Array.isArray(e.sets) ? (e.sets as NotebookSet[]) : [],
    skipped: Boolean(e.skipped ?? false),
    skipZone: e.skipZone ? String(e.skipZone) as BodyZone : undefined,
  }
}

function sanitizePainReport(r: Record<string, unknown>, userId: number): Omit<PainReport, 'id'> {
  return {
    userId,
    zone: String(r.zone ?? '') as BodyZone,
    date: r.date ? new Date(String(r.date)) : new Date(),
    fromExerciseName: String(r.fromExerciseName ?? ''),
    accentDaysRemaining: Number(r.accentDaysRemaining ?? 0),
  }
}

function sanitizeExercise(e: Record<string, unknown>): Omit<Exercise, 'id'> {
  return {
    name: String(e.name ?? ''),
    category: String(e.category ?? 'compound') as Exercise['category'],
    primaryMuscles: Array.isArray(e.primaryMuscles) ? e.primaryMuscles.map(String) : [],
    secondaryMuscles: Array.isArray(e.secondaryMuscles) ? e.secondaryMuscles.map(String) : [],
    equipmentNeeded: Array.isArray(e.equipmentNeeded) ? e.equipmentNeeded.map(String) : [],
    contraindications: Array.isArray(e.contraindications) ? e.contraindications.map(String) as BodyZone[] : [],
    alternatives: Array.isArray(e.alternatives) ? e.alternatives.map(String) : [],
    instructions: String(e.instructions ?? ''),
    isRehab: Boolean(e.isRehab ?? false),
    rehabTarget: e.rehabTarget ? String(e.rehabTarget) as BodyZone : undefined,
    tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
  }
}

function sanitizeExerciseNote(n: Record<string, unknown>, userId: number): Omit<ExerciseNote, 'id'> {
  return {
    userId,
    exerciseId: Number(n.exerciseId ?? 0),
    note: String(n.note ?? ''),
    createdAt: n.createdAt ? new Date(String(n.createdAt)) : new Date(),
    updatedAt: n.updatedAt ? new Date(String(n.updatedAt)) : new Date(),
  }
}

function sanitizeActiveSession(s: Record<string, unknown>): ActiveSessionState {
  return {
    id: 1,
    programId: Number(s.programId ?? 0),
    sessionIndex: Number(s.sessionIndex ?? 0),
    phase: String(s.phase ?? 'warmup') as SessionPhase,
    currentExerciseIdx: Number(s.currentExerciseIdx ?? 0),
    exerciseStatuses: Array.isArray(s.exerciseStatuses) ? s.exerciseStatuses as ExerciseStatus[] : [],
    sessionStartTime: s.sessionStartTime ? new Date(String(s.sessionStartTime)) : new Date(),
    warmupChecked: Array.isArray(s.warmupChecked) ? s.warmupChecked.map(Number) : [],
    draftSets: Array.isArray(s.draftSets) ? s.draftSets as ActiveSessionState['draftSets'] : [],
    restTimerEndTime: typeof s.restTimerEndTime === 'number' ? s.restTimerEndTime : null,
    updatedAt: s.updatedAt ? new Date(String(s.updatedAt)) : new Date(),
  }
}

function sanitizeRehabHistory(r: Record<string, unknown>): Omit<RehabHistoryEntry, 'id'> {
  return {
    exerciseName: String(r.exerciseName ?? ''),
    doneAt: r.doneAt ? new Date(String(r.doneAt)) : new Date(),
  }
}

export async function exportData(userId: number): Promise<string> {
  const profile = await db.userProfiles.get(userId)
  if (!profile) throw new Error('Profil utilisateur introuvable')

  const conditions = await db.healthConditions.where('userId').equals(userId).toArray()
  const equipment = await db.gymEquipment.where('userId').equals(userId).toArray()
  const exercises = await db.exercises.toArray()
  const programs = await db.workoutPrograms.where('userId').equals(userId).toArray()
  const sessions = await db.workoutSessions.where('userId').equals(userId).toArray()
  const exerciseNotes = await db.exerciseNotes.where('userId').equals(userId).toArray()
  const notebookEntries = await db.notebookEntries.where('userId').equals(userId).toArray()
  const painReports = await db.painReports.where('userId').equals(userId).toArray()
  const activeSession = await db.activeSession.get(1) ?? null
  const rehabHistory = await db.rehabHistory.toArray()

  return JSON.stringify({
    version: 4,
    exportedAt: new Date().toISOString(),
    profile,
    conditions,
    equipment,
    exercises,
    programs,
    sessions,
    exerciseNotes,
    notebookEntries,
    painReports,
    activeSession,
    rehabHistory,
  }, null, 2)
}

export async function importData(json: string): Promise<number> {
  if (json.length > 10 * 1024 * 1024) {
    throw new Error('Fichier de backup trop volumineux (max 10MB)')
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Format JSON invalide')
  }

  if (!isValidBackupStructure(data)) {
    throw new Error('Structure de backup invalide')
  }

  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) {
    throw new Error('Version de backup non supportée')
  }

  const arrays = ['conditions', 'equipment', 'exercises', 'programs', 'sessions', 'exerciseNotes', 'notebookEntries', 'painReports', 'rehabHistory'] as const
  for (const key of arrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Format invalide pour ${key}`)
    }
  }

  return await db.transaction('rw',
    [db.userProfiles, db.healthConditions, db.gymEquipment,
     db.exercises, db.workoutPrograms, db.workoutSessions,
     db.exerciseNotes, db.notebookEntries, db.painReports,
     db.activeSession, db.rehabHistory],
    async () => {
      const clearOps: Promise<void>[] = [
        db.userProfiles.clear(),
        db.healthConditions.clear(),
        db.gymEquipment.clear(),
        db.workoutPrograms.clear(),
        db.workoutSessions.clear(),
        db.exerciseNotes.clear(),
        db.notebookEntries.clear(),
        db.painReports.clear(),
        db.activeSession.clear(),
        db.rehabHistory.clear(),
      ]
      // Only clear exercises when the backup actually contains them.
      // Old backups (v2) have none — keep the seeded catalog intact.
      if (data.exercises?.length) clearOps.push(db.exercises.clear())
      await Promise.all(clearOps)

      const profile = data.profile as Record<string, unknown>
      const profileData: Omit<UserProfile, 'id'> = {
        name: String(profile.name ?? ''),
        daysPerWeek: Number(profile.daysPerWeek ?? 3),
        minutesPerSession: Number(profile.minutesPerSession ?? 75),
        createdAt: profile.createdAt ? new Date(String(profile.createdAt)) : new Date(),
        updatedAt: profile.updatedAt ? new Date(String(profile.updatedAt)) : new Date(),
      }
      const userId = await db.userProfiles.add(profileData) as number

      if (data.conditions?.length) {
        await db.healthConditions.bulkAdd(
          (data.conditions as Record<string, unknown>[]).map(c => sanitizeCondition(c, userId))
        )
      }
      if (data.equipment?.length) {
        await db.gymEquipment.bulkAdd(
          (data.equipment as Record<string, unknown>[]).map(e => sanitizeEquipment(e, userId))
        )
      }
      // Build exerciseId map: backup_id → new_db_id (so all references stay consistent)
      const exerciseIdMap = new Map<number, number>()
      if (data.exercises?.length) {
        const rawExercises = data.exercises as Record<string, unknown>[]
        const backupIds = rawExercises.map(e => Number(e.id ?? 0))
        const sanitized = rawExercises.map(e => sanitizeExercise(e))
        const newIds = await db.exercises.bulkAdd(sanitized, { allKeys: true }) as number[]
        backupIds.forEach((bid, i) => { if (bid > 0) exerciseIdMap.set(bid, newIds[i]) })
      }
      const remapEx = (id: number) => exerciseIdMap.get(id) ?? id

      const programIdMap = new Map<number, number>()
      if (data.programs?.length) {
        for (const p of data.programs as Record<string, unknown>[]) {
          const oldId = Number(p.id ?? 0)
          const sanitized = sanitizeProgram(p, userId)
          // Remap exerciseIds inside each program session
          sanitized.sessions = sanitized.sessions.map(s => ({
            ...s,
            exercises: s.exercises.map(pe => ({ ...pe, exerciseId: remapEx(pe.exerciseId) })),
          }))
          const newId = await db.workoutPrograms.add(sanitized) as number
          if (oldId > 0) programIdMap.set(oldId, newId)
        }
      }
      if (data.sessions?.length) {
        await db.workoutSessions.bulkAdd(
          (data.sessions as Record<string, unknown>[]).map(s => {
            const sanitized = sanitizeSession(s, userId)
            const oldProgramId = Number((s as Record<string, unknown>).programId ?? 0)
            if (programIdMap.has(oldProgramId)) sanitized.programId = programIdMap.get(oldProgramId)!
            sanitized.exercises = sanitized.exercises.map(ex => ({ ...ex, exerciseId: remapEx(ex.exerciseId) }))
            return sanitized
          })
        )
      }
      if (data.exerciseNotes?.length) {
        await db.exerciseNotes.bulkAdd(
          (data.exerciseNotes as Record<string, unknown>[]).map(n => {
            const s = sanitizeExerciseNote(n, userId)
            s.exerciseId = remapEx(s.exerciseId)
            return s
          })
        )
      }
      if (data.notebookEntries?.length) {
        await db.notebookEntries.bulkAdd(
          (data.notebookEntries as Record<string, unknown>[]).map(e => {
            const s = sanitizeNotebookEntry(e, userId)
            s.exerciseId = remapEx(s.exerciseId)
            return s
          })
        )
      }
      if (data.painReports?.length) {
        await db.painReports.bulkAdd(
          (data.painReports as Record<string, unknown>[]).map(r => sanitizePainReport(r, userId))
        )
      }
      if (data.activeSession && typeof data.activeSession === 'object') {
        const s = sanitizeActiveSession(data.activeSession as Record<string, unknown>)
        const oldProgId = Number((data.activeSession as Record<string, unknown>).programId ?? 0)
        if (programIdMap.has(oldProgId)) s.programId = programIdMap.get(oldProgId)!
        s.exerciseStatuses = s.exerciseStatuses.map(es => ({ ...es, exerciseId: remapEx(es.exerciseId) }))
        await db.activeSession.put(s)
      }
      if (data.rehabHistory?.length) {
        await db.rehabHistory.bulkAdd(
          (data.rehabHistory as Record<string, unknown>[]).map(r => sanitizeRehabHistory(r))
        )
      }

      return userId
    }
  )
}
