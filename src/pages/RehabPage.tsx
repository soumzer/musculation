import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { BodyZone, Exercise } from '../db/types'
import { generateRestDayRoutine, type RestDayExercise, type RestDayRoutine } from '../engine/rest-day'
import { recordRehabExercisesDone } from '../utils/rehab-rotation'
import ExerciseNotebook from '../components/session/ExerciseNotebook'
import { useWakeLock } from '../hooks/useWakeLock'
import { bodyZones } from '../constants/body-zones'

const ZONE_LABEL: Record<string, string> = Object.fromEntries(
  bodyZones.map(z => [z.zone, z.label]),
)

const REHAB_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

interface RehabResumeData {
  sequence: RestDayExercise[]
  currentIndex: number
  completed: Set<string>
}

/**
 * Look up a previously persisted rehab session in activeSession (singleton id=1)
 * and return its restorable state if it qualifies — i.e. flagged isRehab,
 * younger than 12h AND saved on the current calendar day. Stale rows are
 * cleared on the way out so they don't accumulate.
 */
async function tryRestoreRehabSession(): Promise<RehabResumeData | null> {
  const row = await db.activeSession.get(1)
  if (!row || !row.isRehab) return null
  const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)
  const now = new Date()
  const tooOld = now.getTime() - updatedAt.getTime() > REHAB_SESSION_MAX_AGE_MS
  const differentDay =
    updatedAt.getFullYear() !== now.getFullYear() ||
    updatedAt.getMonth() !== now.getMonth() ||
    updatedAt.getDate() !== now.getDate()
  if (tooOld || differentDay) {
    await db.activeSession.delete(1)
    return null
  }
  if (!row.rehabSequence || row.rehabSequence.length === 0) return null
  return {
    // RestDayRehabExercise mirrors RestDayExercise structurally — safe cast.
    sequence: row.rehabSequence as unknown as RestDayExercise[],
    currentIndex: row.currentExerciseIdx,
    completed: new Set(row.rehabCompletedNames ?? []),
  }
}

async function persistRehabProgress(
  sequence: RestDayExercise[],
  currentIndex: number,
  completed: Set<string>,
): Promise<void> {
  await db.activeSession.put({
    id: 1,
    programId: 0,
    sessionIndex: 0,
    phase: 'exercises',
    currentExerciseIdx: currentIndex,
    exerciseStatuses: [],
    sessionStartTime: new Date(),
    warmupChecked: [],
    draftSets: [],
    restTimerEndTime: null,
    updatedAt: new Date(),
    isRehab: true,
    rehabSequence: sequence,
    rehabCompletedNames: [...completed],
  })
}

async function clearRehabSession(): Promise<void> {
  const row = await db.activeSession.get(1)
  if (row?.isRehab) await db.activeSession.delete(1)
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_DISABLED = 'w-full py-4 rounded-2xl font-bold text-lg bg-zinc-800 text-zinc-600 cursor-not-allowed'
const CTA_SECONDARY = 'w-full py-4 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200'
const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden'

// ---------------------------------------------------------------------------
// External video pool (rotated across sessions)
// ---------------------------------------------------------------------------

const EXTERNAL_VIDEOS = [
  { id: 'full_body', label: 'Full body stretching', duration: '10 min' },
  { id: 'lower_back_hips', label: 'Lower back & hips mobility', duration: '7 min' },
  { id: 'neck_shoulders', label: 'Neck & shoulders release', duration: '8 min' },
  { id: 'knee', label: 'Knee rehab routine', duration: '6 min' },
  { id: 'ankles_feet', label: 'Ankles & feet mobility', duration: '5 min' },
]

function getNextVideoIndex(): number {
  const lastIdx = parseInt(localStorage.getItem('rehab_video_idx') ?? '-1', 10)
  return (lastIdx + 1) % EXTERNAL_VIDEOS.length
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTimeBased(ex: RestDayExercise): boolean {
  return ex.durationSeconds != null && ex.durationSeconds > 0
}

/** Extract the first integer from a string like "12", "15-20", "30 sec". */
function parseRepsValue(reps: string | number): number {
  if (typeof reps === 'number') return reps
  const m = reps.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 10
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RehabPage() {
  const user = useLiveQuery(() => db.userProfiles.toCollection().first())

  const conditions = useLiveQuery(
    () => user?.id
      ? db.healthConditions.where('userId').equals(user.id).and(c => c.isActive).toArray()
      : [],
    [user?.id],
  )

  const activePainReports = useLiveQuery(
    () => user?.id
      ? db.painReports.where('userId').equals(user.id).filter(r => r.accentDaysRemaining > 0).toArray()
      : [],
    [user?.id],
  )

  const accentZones = useMemo(
    () => activePainReports?.length ? [...new Set(activePainReports.map(r => r.zone))] : [],
    [activePainReports],
  )

  // Active zones for the contraindication warning in ExerciseNotebook.
  const activeZones = useMemo<string[]>(
    () => (conditions ?? []).map(c => c.bodyZone),
    [conditions],
  )

  // Catalog map (name → Exercise) so we can hand a full Exercise record to
  // ExerciseNotebook for each rehab exo. Some rehab-protocol exos may not
  // exist in the catalog — those fall back to a synthetic exercise object.
  const exerciseCatalog = useLiveQuery(() => db.exercises.toArray(), [])
  const exerciseByName = useMemo(() => {
    const map = new Map<string, Exercise>()
    for (const ex of exerciseCatalog ?? []) map.set(ex.name.toLowerCase(), ex)
    return map
  }, [exerciseCatalog])

  const rehabHistoryMap = useLiveQuery(async () => {
    const rows = await db.rehabHistory.toArray()
    const map: Record<string, number> = {}
    for (const row of rows) {
      const ts = row.doneAt instanceof Date ? row.doneAt.getTime() : new Date(row.doneAt).getTime()
      map[row.exerciseName] = ts
    }
    return map
  }, [])

  // Routine generated ONCE per mount — the rotation only re-applies the next
  // time the user navigates back to Rehab. Lock is gated on conditions.length>0
  // so the sync `[]` from a still-loading user query doesn't freeze us empty.
  const [routine, setRoutine] = useState<RestDayRoutine | null>(null)
  const routineGenerated = useRef(false)
  const restoreAttempted = useRef(false)

  // Phase state machine
  const [phase, setPhase] = useState<'intro' | 'exo' | 'finished'>('intro')
  const [currentIndex, setCurrentIndex] = useState(0)
  // Nombre d'exos complétés, figé à la fin de la routine pour l'écran final
  // (completedRef est un ref — interdit de le lire pendant le render).
  const [finishedCount, setFinishedCount] = useState(0)

  // L'écran reste allumé pendant la routine (tenues chronométrées mains libres)
  useWakeLock(phase === 'exo')

  const [videoIdx] = useState(() => getNextVideoIndex())
  const [videoDone, setVideoDone] = useState(false)
  const video = EXTERNAL_VIDEOS[videoIdx]

  const completedRef = useRef<Set<string>>(new Set())

  // 1️⃣ Try to restore a persisted rehab session from activeSession. Runs once
  // at mount, BEFORE the routine generation effect — if a valid same-day
  // session is found, we use its frozen sequence (skipping regeneration) and
  // jump straight into the 'exo' phase at the saved index.
  useEffect(() => {
    if (restoreAttempted.current) return
    restoreAttempted.current = true
    void (async () => {
      const resume = await tryRestoreRehabSession()
      if (!resume) return
      // Build a synthetic routine that holds the saved sequence in `exercises`.
      // saRoutine is intentionally null because the saved sequence already
      // includes SA exos in order (the original flatten).
      setRoutine({
        exercises: resume.sequence,
        saRoutine: null,
        totalMinutes: 0,
        variant: 'all',
      })
      completedRef.current = resume.completed
      setCurrentIndex(resume.currentIndex)
      setPhase('exo')
      routineGenerated.current = true // prevent regeneration in the next effect
    })()
  }, [])

  useEffect(() => {
    if (routineGenerated.current) return
    if (conditions === undefined || rehabHistoryMap === undefined) return
    // Génération différée d'un tick : pas de setState synchrone dans l'effect
    // (même pattern que la restauration au-dessus), et la garde est revérifiée
    // au cas où la restauration aurait gagné la course entre-temps.
    void (async () => {
      await Promise.resolve()
      if (routineGenerated.current) return
      if (conditions.length === 0) {
        setRoutine(null)
        return
      }
      routineGenerated.current = true
      setRoutine(generateRestDayRoutine(conditions, 'all', accentZones, rehabHistoryMap))
    })()
  }, [conditions, accentZones, rehabHistoryMap])

  // Linear sequence: SA exercises (when present) then the regular routine.
  const sequence = useMemo<RestDayExercise[]>(
    () => routine ? [...(routine.saRoutine ?? []), ...routine.exercises] : [],
    [routine],
  )

  const userId = user?.id
  const finalizeSession = useCallback(async () => {
    if (!userId) return
    const names = [...completedRef.current]
    if (names.length > 0) await recordRehabExercisesDone(names)
    const reports = await db.painReports
      .where('userId').equals(userId)
      .and(r => r.accentDaysRemaining > 0)
      .toArray()
    for (const report of reports) {
      await db.painReports.update(report.id!, {
        accentDaysRemaining: Math.max(0, report.accentDaysRemaining - 1),
      })
    }
    if (videoDone) localStorage.setItem('rehab_video_idx', String(videoIdx))
    // Clear the persisted in-progress state — session is done.
    await clearRehabSession()
  }, [userId, videoDone, videoIdx])

  const advance = useCallback(async () => {
    const cur = sequence[currentIndex]
    if (cur) completedRef.current.add(cur.name)
    const nextIndex = currentIndex + 1
    if (nextIndex < sequence.length) {
      setCurrentIndex(nextIndex)
      // Persist progress so a refresh / app close mid-routine resumes here.
      await persistRehabProgress(sequence, nextIndex, completedRef.current)
    } else {
      await finalizeSession()
      setFinishedCount(completedRef.current.size)
      setPhase('finished')
    }
  }, [sequence, currentIndex, finalizeSession])

  const handleStart = useCallback(async () => {
    setCurrentIndex(0)
    completedRef.current = new Set()
    setPhase('exo')
    // Persist the frozen sequence at session start so refresh from index 0
    // restores the same routine the user just saw.
    await persistRehabProgress(sequence, 0, new Set())
  }, [sequence])

  const handleSkip = useCallback(async (_zone: BodyZone) => {
    // The skip side-effects (pain report, optional new condition) were
    // already persisted by useNotebook.skipExercise before this callback ran.
    // We just navigate to the next exo.
    void _zone
    await advance()
  }, [advance])

  const handleContinue = useCallback(() => {
    completedRef.current = new Set()
    setCurrentIndex(0)
    setVideoDone(false)
    setPhase('intro')
  }, [])

  // ===== RENDER =====

  if (!user || conditions === undefined) {
    return <LoadingScreen />
  }

  // No conditions: just a single video to tick, save → 'finished'.
  if (conditions.length === 0 && phase !== 'finished') {
    return (
      <div className="flex flex-col h-[var(--content-h)]">
        <div className="flex-1 px-5 pt-8">
          <h1 className="text-2xl font-black text-white mb-1">Rehab</h1>
          <p className="text-zinc-400 text-sm mb-6">Aucune condition de santé active.</p>
          <VideoCheckbox video={video} checked={videoDone} onToggle={() => setVideoDone(v => !v)} />
        </div>
        <div className="flex-shrink-0 px-5 pb-6">
          <button
            onClick={async () => {
              if (videoDone) localStorage.setItem('rehab_video_idx', String(videoIdx))
              setPhase('finished')
            }}
            disabled={!videoDone}
            className={videoDone ? CTA : CTA_DISABLED}
          >
            Enregistrer
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const count = finishedCount
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-2xl font-black text-white mb-1">
          {count > 0 ? 'Session enregistrée' : 'Routine terminée'}
        </p>
        {count > 0 && (
          <p className="text-zinc-400 mb-6">{count} exercice{count > 1 ? 's' : ''} de rehab</p>
        )}
        {conditions.length > 0 && (
          <button onClick={handleContinue} className={CTA_SECONDARY}>
            Continuer avec d&apos;autres exercices
          </button>
        )}
      </div>
    )
  }

  if (!routine) {
    return <LoadingScreen />
  }

  if (phase === 'exo') {
    if (currentIndex >= sequence.length) return null
    const cur = sequence[currentIndex]
    const catalogEx = exerciseByName.get(cur.name.toLowerCase())
    const timed = isTimeBased(cur)
    const exoForNotebook = {
      exerciseId: catalogEx?.id ?? 0,
      exerciseName: cur.name,
      // For rehab, the rehab-context notes are more relevant than the
      // muscu-flavoured catalog instructions.
      instructions: cur.notes,
      category: (catalogEx?.category ?? 'rehab') as 'compound' | 'isolation' | 'rehab' | 'mobility' | 'core',
      primaryMuscles: catalogEx?.primaryMuscles ?? [],
      isRehab: true,
      contraindications: catalogEx?.contraindications ?? [],
    }
    const target = {
      sets: cur.sets,
      reps: timed ? (cur.durationSeconds ?? 30) : parseRepsValue(cur.reps),
      restSeconds: cur.restSeconds ?? 60,
      intensity: 'rehab' as const,
      isTimeBased: timed,
    }
    return (
      <ExerciseNotebook
        key={`${cur.name}-${currentIndex}`}
        exercise={exoForNotebook}
        target={target}
        exerciseIndex={currentIndex}
        totalExercises={sequence.length}
        userId={user.id!}
        activeZones={activeZones}
        exerciseCatalog={[]}
        swapOptions={[]}
        onNext={advance}
        onSkip={handleSkip}
        onSwap={() => {}}
        onPrev={currentIndex > 0 ? () => setCurrentIndex(currentIndex - 1) : undefined}
        onNextNav={currentIndex < sequence.length - 1 ? () => setCurrentIndex(currentIndex + 1) : undefined}
      />
    )
  }

  // Phase 'intro' — start screen with full exo list.
  return (
    <div className="flex flex-col h-[var(--content-h)]">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">
        <h1 className="text-2xl font-black text-white mb-1">Rehab</h1>
        <p className="text-zinc-400 text-sm mb-4">Routine du jour — {sequence.length} exo{sequence.length > 1 ? 's' : ''} • ~{routine.totalMinutes} min</p>

        <div className="mb-3">
          <VideoCheckbox video={video} checked={videoDone} onToggle={() => setVideoDone(v => !v)} />
        </div>

        {sequence.length > 0 && (
          <div className="space-y-2">
            {sequence.map((ex, idx) => (
              <ExoIntroRow key={`${ex.name}-${idx}`} exercise={ex} index={idx} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6 pt-3 bg-zinc-950">
        <button
          onClick={() => { void handleStart() }}
          disabled={sequence.length === 0}
          className={sequence.length > 0 ? CTA : CTA_DISABLED}
        >
          Commencer la routine
        </button>
      </div>
    </div>
  )
}

function ExoIntroRow({ exercise, index }: { exercise: RestDayExercise; index: number }) {
  const timed = exercise.durationSeconds != null && exercise.durationSeconds > 0
  const repsLabel = timed
    ? `${exercise.durationSeconds}s`
    : (typeof exercise.reps === 'string' ? exercise.reps : `${exercise.reps} reps`)
  const zoneLabel = exercise.targetZone ? ZONE_LABEL[exercise.targetZone] ?? exercise.targetZone : null
  return (
    <div className={`${CARD} p-4 flex items-center gap-3`}>
      <span className="text-zinc-600 text-xs font-bold tabular-nums w-6">{index + 1}.</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{exercise.name}</p>
        <p className="text-zinc-500 text-xs mt-0.5">{exercise.sets} × {repsLabel}</p>
      </div>
      {zoneLabel && (
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 flex-shrink-0">
          {zoneLabel}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small render helpers
// ---------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-[var(--content-h)]">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function VideoCheckbox({
  video,
  checked,
  onToggle,
}: {
  video: { label: string; duration: string }
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full ${CARD} px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-all duration-150`}
    >
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${checked ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {video.label}
        </p>
        <p className="text-zinc-600 text-xs mt-0.5">{video.duration}</p>
      </div>
    </button>
  )
}
