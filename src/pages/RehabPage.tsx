import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { NotebookEntry, NotebookSet } from '../db/types'
import { generateRestDayRoutine, type RestDayExercise } from '../engine/rest-day'
import { recordRehabExercisesDone } from '../utils/rehab-rotation'
import { useRestTimer } from '../hooks/useRestTimer'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_DISABLED = 'w-full py-4 rounded-2xl font-bold text-lg bg-zinc-800 text-zinc-600 cursor-not-allowed'
const CTA_SECONDARY = 'w-full py-4 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200'
const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden'

const INTENSITY_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  very_light: { label: 'Tres leger', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  light: { label: 'Leger', bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  moderate: { label: 'Modere', bg: 'bg-amber-500/15', text: 'text-amber-400' },
}

// ---------------------------------------------------------------------------
// Constants & helpers
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

function isTimeBased(ex: RestDayExercise): boolean {
  return ex.durationSeconds != null && ex.durationSeconds > 0
}

interface ExerciseLogState {
  sets: NotebookSet[]
  weightInput: string
  repsInput: string
  expanded: boolean
  /** Nombre de séries validées pour un exercice chronométré. */
  timedDone: number
}

const EMPTY_LOG: ExerciseLogState = { sets: [], weightInput: '0', repsInput: '', expanded: false, timedDone: 0 }

// ---------------------------------------------------------------------------
// Shared exercise card component (used for both SA and regular)
// ---------------------------------------------------------------------------

function RehabExerciseCard({
  exercise,
  log,
  lastPerf,
  accentBorder,
  onToggleExpand,
  onIncTimed,
  onDecTimed,
  onUpdateLog,
  onAddSet,
  onRemoveLastSet,
}: {
  exercise: RestDayExercise
  log: ExerciseLogState
  lastPerf?: NotebookEntry
  accentBorder?: boolean
  onToggleExpand: () => void
  onIncTimed: () => void
  onDecTimed: () => void
  onUpdateLog: (patch: Partial<ExerciseLogState>) => void
  onAddSet: () => void
  onRemoveLastSet: () => void
}) {
  const timeBased = isTimeBased(exercise)
  const timedComplete = timeBased && log.timedDone >= exercise.sets
  const hasData = timeBased ? timedComplete : log.sets.length > 0
  const ist = INTENSITY_LABELS[exercise.intensity]
  const timer = useRestTimer(exercise.durationSeconds ?? 0)

  // Chaque fin de décompte valide une série.
  useEffect(() => {
    if (timeBased && timer.remaining === 0 && log.timedDone < exercise.sets) onIncTimed()
  }, [timer.remaining]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${CARD} ${accentBorder ? 'border-l-2 border-l-amber-500' : ''}`}>
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-zinc-800/50 transition-colors"
      >
        {/* Done dot */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
          hasData ? 'bg-emerald-500 text-white' : 'border-2 border-zinc-700'
        }`}>
          {hasData && '\u2713'}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${hasData ? 'text-zinc-500' : 'text-white'}`}>
            {exercise.name}
          </p>
          {exercise.conditionName && (
            <p className="text-zinc-600 text-xs mt-0.5 truncate">{exercise.conditionName}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-zinc-600 text-xs">{exercise.sets}&times;{exercise.reps}</span>
            {ist && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ist.bg} ${ist.text}`}>
                {ist.label}
              </span>
            )}
            {!timeBased && log.sets.length > 0 && (
              <span className="text-emerald-400 text-xs">{log.sets.length} serie{log.sets.length > 1 ? 's' : ''}</span>
            )}
            {timeBased && log.timedDone > 0 && (
              <span className="text-emerald-400 text-xs">{log.timedDone}/{exercise.sets} series</span>
            )}
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-zinc-600 transition-transform duration-200 ${log.expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {log.expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
          {exercise.notes && (
            <p className="text-zinc-400 text-sm leading-relaxed">{exercise.notes}</p>
          )}

          {/* Last performance */}
          {lastPerf && !timeBased && (
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Derniere fois</p>
              <p className="text-white text-sm">
                {lastPerf.sets.map(s => `${s.weightKg > 0 ? s.weightKg + 'kg' : 'PDC'} \u00d7 ${s.reps}`).join(' \u00b7 ')}
              </p>
            </div>
          )}

          {timeBased ? (
            <div className="space-y-2.5">
              {/* Minuteur de tenue */}
              <div className="bg-zinc-800/50 rounded-xl p-3 flex items-center gap-3">
                <span className={`text-2xl font-mono font-bold tabular-nums ${
                  timer.remaining === 0 ? 'text-emerald-400' : 'text-white'
                }`}>
                  {timer.formatTime()}
                </span>
                <div className="flex gap-2 ml-auto">
                  {timer.isRunning ? (
                    <button
                      onClick={timer.pause}
                      className="bg-zinc-800 text-white rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={timer.start}
                      className="bg-emerald-500 text-white font-semibold rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                    >
                      Demarrer
                    </button>
                  )}
                  <button
                    onClick={timer.reset}
                    className="bg-zinc-800 text-zinc-400 rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Progression des séries */}
              <div className="flex items-center gap-3 rounded-xl px-4 py-3 border bg-zinc-800 border-zinc-700">
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  timedComplete ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                }`}>
                  {timedComplete && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${timedComplete ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {log.timedDone} / {exercise.sets} série{exercise.sets > 1 ? 's' : ''}
                </span>
                <div className="flex gap-2 ml-auto">
                  {log.timedDone > 0 && (
                    <button
                      onClick={onDecTimed}
                      className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-400 text-lg flex items-center justify-center active:scale-95 transition-all duration-200"
                    >
                      &minus;
                    </button>
                  )}
                  {log.timedDone < exercise.sets && (
                    <button
                      onClick={onIncTimed}
                      className="w-8 h-8 rounded-lg bg-emerald-500 text-white text-lg font-bold flex items-center justify-center active:scale-95 transition-all duration-200"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Logged sets */}
              {log.sets.length > 0 && (
                <div className="space-y-1.5">
                  {log.sets.map((s, si) => (
                    <div key={si} className="flex items-center gap-2 bg-zinc-800/50 rounded-xl px-3 py-2.5">
                      <span className="text-zinc-600 text-xs w-6 tabular-nums">S{si + 1}</span>
                      <span className="text-white text-sm font-medium">{s.weightKg > 0 ? `${s.weightKg} kg` : 'PDC'}</span>
                      <span className="text-zinc-600 text-sm">&times;</span>
                      <span className="text-white text-sm font-medium">{s.reps}</span>
                      {si === log.sets.length - 1 && (
                        <button onClick={onRemoveLastSet} className="ml-auto text-zinc-600 active:text-red-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1 bg-zinc-800 rounded-xl px-3 py-2.5">
                  <input
                    type="number" inputMode="decimal" min={0} step={0.5} placeholder="0"
                    value={log.weightInput}
                    onChange={e => onUpdateLog({ weightInput: e.target.value })}
                    className="w-14 bg-transparent text-white text-sm text-right outline-none placeholder-zinc-600"
                  />
                  <span className="text-zinc-600 text-xs">kg</span>
                </div>
                <span className="text-zinc-700">&times;</span>
                <div className="flex-1 flex items-center gap-1 bg-zinc-800 rounded-xl px-3 py-2.5">
                  <input
                    type="number" inputMode="numeric" min={1} placeholder="reps"
                    value={log.repsInput}
                    onChange={e => onUpdateLog({ repsInput: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddSet() } }}
                    className="w-14 bg-transparent text-white text-sm text-right outline-none placeholder-zinc-600"
                  />
                  <span className="text-zinc-600 text-xs">reps</span>
                </div>
                <button onClick={onAddSet} className="bg-emerald-500 text-white rounded-xl px-3 py-2.5 active:scale-95 transition-all duration-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
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
    [user?.id]
  )

  const activePainReports = useLiveQuery(
    () => user?.id
      ? db.painReports.where('userId').equals(user.id).filter(r => r.accentDaysRemaining > 0).toArray()
      : [],
    [user?.id]
  )

  const rehabHistory = useLiveQuery(
    () => user?.id
      ? db.notebookEntries.where('sessionIntensity').equals('rehab')
          .filter(e => e.userId === user.id! && !e.skipped && e.sets.length > 0).toArray()
      : [],
    [user?.id]
  )

  const lastRehabPerf = useMemo(() => {
    const map = new Map<string, NotebookEntry>()
    if (!rehabHistory) return map
    for (const entry of rehabHistory) {
      const existing = map.get(entry.exerciseName)
      if (!existing || new Date(entry.date).getTime() > new Date(existing.date).getTime()) {
        map.set(entry.exerciseName, entry)
      }
    }
    return map
  }, [rehabHistory])

  const accentZones = useMemo(
    () => activePainReports?.length ? [...new Set(activePainReports.map(r => r.zone))] : [],
    [activePainReports]
  )

  const rehabHistoryMap = useLiveQuery(async () => {
    const rows = await db.rehabHistory.toArray()
    const map: Record<string, number> = {}
    for (const row of rows) {
      const ts = row.doneAt instanceof Date ? row.doneAt.getTime() : new Date(row.doneAt).getTime()
      map[row.exerciseName] = ts
    }
    return map
  }, [])

  const [refreshKey, setRefreshKey] = useState(0)

  const routine = useMemo(
    () => conditions && conditions.length > 0 && rehabHistoryMap
      ? generateRestDayRoutine(conditions, 'all', accentZones, rehabHistoryMap)
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conditions, accentZones, rehabHistoryMap, refreshKey]
  )

  const [videoIdx] = useState(() => getNextVideoIndex())
  const [videoDone, setVideoDone] = useState(false)
  const video = EXTERNAL_VIDEOS[videoIdx]

  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [exerciseLogs, setExerciseLogs] = useState<Record<number, ExerciseLogState>>({})
  const [saLogs, setSaLogs] = useState<Record<number, ExerciseLogState>>({})

  const getLog = useCallback((index: number): ExerciseLogState => exerciseLogs[index] ?? EMPTY_LOG, [exerciseLogs])
  const getSaLog = useCallback((index: number): ExerciseLogState => saLogs[index] ?? EMPTY_LOG, [saLogs])

  const makeUpdater = (setter: typeof setExerciseLogs) => ({
    update: (index: number, patch: Partial<ExerciseLogState>) =>
      setter(prev => ({ ...prev, [index]: { ...(prev[index] ?? EMPTY_LOG), ...patch } })),
    toggleExpand: (index: number) =>
      setter(prev => { const c = prev[index] ?? EMPTY_LOG; return { ...prev, [index]: { ...c, expanded: !c.expanded } } }),
    incTimed: (index: number, max: number) =>
      setter(prev => { const c = prev[index] ?? EMPTY_LOG; return { ...prev, [index]: { ...c, timedDone: Math.min(max, c.timedDone + 1) } } }),
    decTimed: (index: number) =>
      setter(prev => { const c = prev[index] ?? EMPTY_LOG; return { ...prev, [index]: { ...c, timedDone: Math.max(0, c.timedDone - 1) } } }),
    addSet: (index: number) =>
      setter(prev => {
        const c = prev[index] ?? EMPTY_LOG
        const weight = parseFloat(c.weightInput) || 0
        const reps = parseInt(c.repsInput) || 0
        if (reps <= 0) return prev
        return { ...prev, [index]: { ...c, sets: [...c.sets, { weightKg: weight, reps }], repsInput: '' } }
      }),
    removeLastSet: (index: number) =>
      setter(prev => {
        const c = prev[index]
        if (!c || c.sets.length === 0) return prev
        return { ...prev, [index]: { ...c, sets: c.sets.slice(0, -1) } }
      }),
  })

  const regular = makeUpdater(setExerciseLogs)
  const sa = makeUpdater(setSaLogs)

  const exercisesWithData = useMemo(() => {
    if (!routine) return 0
    let count = routine.exercises.filter((ex, idx) => {
      const log = getLog(idx)
      return isTimeBased(ex) ? log.timedDone > 0 : log.sets.length > 0
    }).length
    if (routine.saRoutine) {
      count += routine.saRoutine.filter((ex, idx) => {
        const log = getSaLog(idx)
        return isTimeBased(ex) ? log.timedDone > 0 : log.sets.length > 0
      }).length
    }
    return count
  }, [routine, exerciseLogs, saLogs, getLog, getSaLog])

  const canSave = exercisesWithData > 0 || videoDone

  const handleSave = useCallback(async () => {
    if (!user?.id || isSaving) return
    setIsSaving(true)
    try {
      const now = new Date()
      const completedNames: string[] = []
      let regularExercisesCompleted = 0

      const allExercises = await db.exercises.toArray()
      const nameToId = new Map<string, number>()
      for (const ex of allExercises) { if (ex.id !== undefined) nameToId.set(ex.name.toLowerCase(), ex.id) }
      const resolveId = (name: string) => nameToId.get(name.toLowerCase()) ?? 0

      // Save SA routine
      if (routine?.saRoutine) {
        for (let i = 0; i < routine.saRoutine.length; i++) {
          const ex = routine.saRoutine[i]
          const log = getSaLog(i)
          const timeBased = isTimeBased(ex)
          if (timeBased && log.timedDone === 0) continue
          if (!timeBased && log.sets.length === 0) continue
          await db.notebookEntries.add({
            userId: user.id!, exerciseId: resolveId(ex.name), exerciseName: ex.name,
            date: now, sessionIntensity: 'rehab',
            sets: timeBased
              ? Array.from({ length: log.timedDone }, () => ({ weightKg: 0, reps: ex.durationSeconds ?? 1 }))
              : log.sets.filter(s => s.reps > 0),
            skipped: false,
          })
          completedNames.push(ex.name)
        }
      }

      // Save regular exercises
      for (let i = 0; i < (routine?.exercises.length ?? 0); i++) {
        const ex = routine!.exercises[i]
        const log = getLog(i)
        const timeBased = isTimeBased(ex)
        if (timeBased && log.timedDone === 0) continue
        if (!timeBased && log.sets.length === 0) continue
        await db.notebookEntries.add({
          userId: user.id!, exerciseId: resolveId(ex.name), exerciseName: ex.name,
          date: now, sessionIntensity: 'rehab',
          sets: timeBased
            ? Array.from({ length: log.timedDone }, () => ({ weightKg: 0, reps: ex.durationSeconds ?? 1 }))
            : log.sets.filter(s => s.reps > 0),
          skipped: false,
        })
        completedNames.push(ex.name)
        regularExercisesCompleted++
      }

      if (completedNames.length > 0) await recordRehabExercisesDone(completedNames)

      if (regularExercisesCompleted > 0) {
        const reports = await db.painReports.where('userId').equals(user.id!).and(r => r.accentDaysRemaining > 0).toArray()
        for (const report of reports) {
          await db.painReports.update(report.id!, { accentDaysRemaining: Math.max(0, report.accentDaysRemaining - 1) })
        }
      }

      localStorage.setItem('rehab_video_idx', String(videoIdx))
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }, [user, routine, isSaving, getLog, getSaLog, videoIdx])

  const handleContinue = useCallback(() => {
    setExerciseLogs({})
    setSaLogs({})
    setVideoDone(false)
    setSaved(false)
    setRefreshKey(k => k + 1)
  }, [])

  // ===== RENDER =====

  if (!user || conditions === undefined) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // --- Saved confirmation (no conditions) ---
  if (saved && conditions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-2xl font-black text-white mb-1">Routine terminee</p>
        <p className="text-zinc-400">Bien joue ! Reviens demain.</p>
      </div>
    )
  }

  // --- No conditions: video only ---
  if (conditions.length === 0) {
    return (
      <div className="flex flex-col h-[var(--content-h)]">
        <div className="flex-1 px-5 pt-8">
          <h1 className="text-2xl font-black text-white mb-1">Rehab</h1>
          <p className="text-zinc-400 text-sm mb-6">Aucune condition de sante active.</p>

          <VideoCheckbox video={video} checked={videoDone} onToggle={() => setVideoDone(d => !d)} />
        </div>
        <div className="flex-shrink-0 px-5 pb-6">
          <button
            onClick={async () => { localStorage.setItem('rehab_video_idx', String(videoIdx)); setSaved(true) }}
            disabled={!videoDone || isSaving}
            className={videoDone && !isSaving ? CTA : CTA_DISABLED}
          >
            Enregistrer
          </button>
        </div>
      </div>
    )
  }

  // --- Saved confirmation (with conditions) ---
  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-2xl font-black text-white mb-1">Session enregistree</p>
        <p className="text-zinc-400 mb-6">{exercisesWithData} exercice{exercisesWithData > 1 ? 's' : ''} de rehab</p>
        <button onClick={handleContinue} className={CTA_SECONDARY}>
          Continuer avec d'autres exercices
        </button>
      </div>
    )
  }

  // --- Main rehab view ---
  const otherRehabAvailable = routine && routine.exercises.length > 0

  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      {/* Video */}
      <div className="px-5 pt-6 pb-2">
        <VideoCheckbox video={video} checked={videoDone} onToggle={() => setVideoDone(d => !d)} />
      </div>

      {routine && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 text-center px-5 pt-4 pb-3">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Jour de repos</p>
            <h2 className="text-2xl font-black text-white">~{routine.totalMinutes} min</h2>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto px-5 space-y-2.5 pb-4">
            {/* SA section */}
            {routine.saRoutine && routine.saRoutine.length > 0 && (
              <>
                <p className="text-amber-400 text-xs font-bold uppercase tracking-wider pt-1">Routine Spondylarthrite</p>
                {routine.saRoutine.map((exercise, index) => (
                  <RehabExerciseCard
                    key={`sa-${exercise.name}`}
                    exercise={exercise}
                    log={getSaLog(index)}
                    lastPerf={lastRehabPerf.get(exercise.name)}
                    accentBorder
                    onToggleExpand={() => sa.toggleExpand(index)}
                    onIncTimed={() => sa.incTimed(index, exercise.sets)}
                    onDecTimed={() => sa.decTimed(index)}
                    onUpdateLog={patch => sa.update(index, patch)}
                    onAddSet={() => sa.addSet(index)}
                    onRemoveLastSet={() => sa.removeLastSet(index)}
                  />
                ))}
                {otherRehabAvailable && (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-wider pt-3">Autres exercices</p>
                )}
              </>
            )}

            {/* Regular section */}
            {otherRehabAvailable && routine.exercises.map((exercise, index) => (
              <RehabExerciseCard
                key={exercise.name}
                exercise={exercise}
                log={getLog(index)}
                lastPerf={lastRehabPerf.get(exercise.name)}
                onToggleExpand={() => regular.toggleExpand(index)}
                onIncTimed={() => regular.incTimed(index, exercise.sets)}
                onDecTimed={() => regular.decTimed(index)}
                onUpdateLog={patch => regular.update(index, patch)}
                onAddSet={() => regular.addSet(index)}
                onRemoveLastSet={() => regular.removeLastSet(index)}
              />
            ))}
          </div>

          {/* Save */}
          <div className="flex-shrink-0 px-5 pt-3 pb-6">
            <button
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className={canSave && !isSaving ? CTA : CTA_DISABLED}
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement...
                </span>
              ) : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Video checkbox
// ---------------------------------------------------------------------------

function VideoCheckbox({ video, checked, onToggle }: {
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
