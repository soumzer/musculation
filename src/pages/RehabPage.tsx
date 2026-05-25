import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { BodyZone, Exercise } from '../db/types'
import { generateRestDayRoutine, type RestDayExercise, type RestDayRoutine } from '../engine/rest-day'
import { recordRehabExercisesDone } from '../utils/rehab-rotation'
import ExerciseNotebook from '../components/session/ExerciseNotebook'

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

  useEffect(() => {
    if (routineGenerated.current) return
    if (conditions === undefined || rehabHistoryMap === undefined) return
    if (conditions.length === 0) {
      setRoutine(null)
      return
    }
    routineGenerated.current = true
    setRoutine(generateRestDayRoutine(conditions, 'all', accentZones, rehabHistoryMap))
  }, [conditions, accentZones, rehabHistoryMap])

  // Linear sequence: SA exercises (when present) then the regular routine.
  const sequence = useMemo<RestDayExercise[]>(
    () => routine ? [...(routine.saRoutine ?? []), ...routine.exercises] : [],
    [routine],
  )

  // Phase state machine
  const [phase, setPhase] = useState<'intro' | 'exo' | 'finished'>('intro')
  const [currentIndex, setCurrentIndex] = useState(0)

  const [videoIdx] = useState(() => getNextVideoIndex())
  const [videoDone, setVideoDone] = useState(false)
  const video = EXTERNAL_VIDEOS[videoIdx]

  const completedRef = useRef<Set<string>>(new Set())

  const finalizeSession = useCallback(async () => {
    if (!user?.id) return
    const names = [...completedRef.current]
    if (names.length > 0) await recordRehabExercisesDone(names)
    const reports = await db.painReports
      .where('userId').equals(user.id)
      .and(r => r.accentDaysRemaining > 0)
      .toArray()
    for (const report of reports) {
      await db.painReports.update(report.id!, {
        accentDaysRemaining: Math.max(0, report.accentDaysRemaining - 1),
      })
    }
    if (videoDone) localStorage.setItem('rehab_video_idx', String(videoIdx))
  }, [user?.id, videoDone, videoIdx])

  const advance = useCallback(async () => {
    const cur = sequence[currentIndex]
    if (cur) completedRef.current.add(cur.name)
    if (currentIndex + 1 < sequence.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      await finalizeSession()
      setPhase('finished')
    }
  }, [sequence, currentIndex, finalizeSession])

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
          <p className="text-zinc-400 text-sm mb-6">Aucune condition de sante active.</p>
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
    const count = completedRef.current.size
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-2xl font-black text-white mb-1">
          {count > 0 ? 'Session enregistree' : 'Routine terminee'}
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
      restSeconds: 60,
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
        fillerSuggestions={[]}
        swapOptions={[]}
        onNext={advance}
        onSkip={handleSkip}
        onSwap={() => {}}
      />
    )
  }

  // Phase 'intro' — start screen.
  return (
    <div className="flex flex-col h-[var(--content-h)]">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4 space-y-3">
        <h1 className="text-2xl font-black text-white mb-1">Rehab</h1>
        <p className="text-zinc-400 text-sm mb-2">Routine du jour</p>

        <VideoCheckbox video={video} checked={videoDone} onToggle={() => setVideoDone(v => !v)} />

        {sequence.length > 0 && (
          <div className={`${CARD} p-4`}>
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Programme rehab</p>
            <p className="text-3xl font-black text-white mb-1">
              {sequence.length} exercice{sequence.length > 1 ? 's' : ''}
            </p>
            <p className="text-zinc-500 text-sm">~{routine.totalMinutes} min</p>
            {routine.saRoutine && routine.saRoutine.length > 0 && (
              <p className="text-amber-400 text-xs mt-3">
                Inclut {routine.saRoutine.length} exo{routine.saRoutine.length > 1 ? 's' : ''} de la routine Spondylarthrite.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-5 pb-6">
        <button
          onClick={() => { setCurrentIndex(0); setPhase('exo') }}
          disabled={sequence.length === 0}
          className={sequence.length > 0 ? CTA : CTA_DISABLED}
        >
          Commencer la routine
        </button>
      </div>
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
