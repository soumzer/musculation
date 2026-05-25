import { useState, useCallback, useMemo, useEffect, useRef, Component, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../db'
import ExerciseNotebook from '../components/session/ExerciseNotebook'
import { fixedWarmupRoutine } from '../data/warmup-routine'
import { selectCooldownExercises } from '../engine/cooldown'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import type { BodyZone, Exercise, ProgramSession, SessionPhase, ExerciseStatus, NotebookSet } from '../db/types'
import type { SwapOption } from '../components/session/ExerciseNotebook'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const INTENSITY: Record<string, { bar: string; text: string; label: string; letter: string }> = {
  heavy:    { bar: 'bg-indigo-500', text: 'text-indigo-400', label: 'Force', letter: 'F' },
  volume:   { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Volume', letter: 'V' },
  moderate: { bar: 'bg-amber-500', text: 'text-amber-400', label: 'Modere', letter: 'M' },
}

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_SECONDARY = 'w-full py-4 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200'

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------

function ElapsedTimer({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startTime.getTime()) / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span className="text-zinc-600 text-sm font-mono tabular-nums">
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session content loader
// ---------------------------------------------------------------------------

function SessionContent({ programId, sessionIndex }: { programId: number; sessionIndex: number }) {
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    const [program, user, allExercises] = await Promise.all([
      db.workoutPrograms.get(programId),
      db.userProfiles.toCollection().first(),
      db.exercises.toArray(),
    ])
    if (!user?.id || !program) return null

    const conditions = await db.healthConditions
      .where('userId').equals(user.id)
      .and(c => c.isActive)
      .toArray()

    return { program, user, allExercises, conditions }
  }, [programId])

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { program, user, allExercises, conditions } = data
  const programSession = program.sessions?.[sessionIndex]

  if (!programSession || !programSession.exercises?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
        <p className="text-red-400 text-lg font-bold mb-3">Seance introuvable</p>
        <button onClick={() => navigate('/')} className={CTA_SECONDARY}>
          Retour
        </button>
      </div>
    )
  }

  const nextSessionIndex = (sessionIndex + 1) % program.sessions.length
  const nextSessionName = program.sessions[nextSessionIndex]?.name ?? 'Séance suivante'

  return (
    <SessionRunner
      programSession={programSession}
      userId={user.id!}
      programId={programId}
      sessionIndex={sessionIndex}
      nextSessionIndex={nextSessionIndex}
      nextSessionName={nextSessionName}
      allExercises={allExercises}
      activeZones={conditions.map(c => c.bodyZone)}
    />
  )
}

// ---------------------------------------------------------------------------
// Session runner — all phases
// ---------------------------------------------------------------------------

function SessionRunner({
  programSession,
  userId,
  programId,
  sessionIndex,
  nextSessionIndex,
  nextSessionName,
  allExercises,
  activeZones,
}: {
  programSession: ProgramSession
  userId: number
  programId: number
  sessionIndex: number
  nextSessionIndex: number
  nextSessionName: string
  allExercises: Exercise[]
  activeZones: string[]
}) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<SessionPhase>('warmup')
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0)
  const [exerciseStatuses, setExerciseStatuses] = useState<ExerciseStatus[]>(() =>
    programSession.exercises.map(e => ({ exerciseId: e.exerciseId, status: 'pending' }))
  )
  const [sessionStartTime, setSessionStartTime] = useState(() => new Date())
  const [warmupChecked, setWarmupChecked] = useState<Set<number>>(() => new Set())
  const [recovered, setRecovered] = useState(false)

  // Session persistence
  const { saveSessionState, loadSessionState, clearSessionState } = useSessionPersistence()
  const restoredRef = useRef(false)
  const draftSetsRef = useRef<Map<number, NotebookSet[]>>(new Map())
  const restTimerEndTimeRef = useRef<number | null>(null)

  // Try to restore from activeSession table first
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    loadSessionState(programId, sessionIndex).then(saved => {
      if (saved) {
        setPhase(saved.phase)
        setCurrentExerciseIdx(saved.currentExerciseIdx)
        setExerciseStatuses(saved.exerciseStatuses)
        setSessionStartTime(saved.sessionStartTime instanceof Date ? saved.sessionStartTime : new Date(saved.sessionStartTime))
        setWarmupChecked(new Set(saved.warmupChecked))
        const map = new Map<number, NotebookSet[]>()
        for (const d of saved.draftSets) map.set(d.exerciseId, d.sets)
        draftSetsRef.current = map
        restTimerEndTimeRef.current = saved.restTimerEndTime ?? null
        setRecovered(true)
      }
    })
  }, [programId, sessionIndex, loadSessionState])

  // Recover session state from recent notebookEntries (within 10h editing window) — fallback
  const recentEntries = useLiveQuery(async () => {
    const cutoff = new Date(Date.now() - 10 * 60 * 60 * 1000)
    return db.notebookEntries
      .where('userId').equals(userId)
      .filter(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d >= cutoff
      })
      .toArray()
  }, [userId])

  useEffect(() => {
    if (!recentEntries || recovered) return
    const exerciseIds = programSession.exercises.map(e => e.exerciseId)
    const todayByExercise = new Map<number, typeof recentEntries[0]>()
    for (const entry of recentEntries) {
      if (exerciseIds.includes(entry.exerciseId)) {
        todayByExercise.set(entry.exerciseId, entry)
      }
    }

    if (todayByExercise.size > 0) {
      const newStatuses = programSession.exercises.map(e => {
        const entry = todayByExercise.get(e.exerciseId)
        if (entry) {
          return {
            exerciseId: e.exerciseId,
            status: entry.skipped ? 'skipped' as const : 'done' as const,
            skipZone: entry.skipZone,
          }
        }
        return { exerciseId: e.exerciseId, status: 'pending' as const }
      })
      setExerciseStatuses(newStatuses)
      setPhase('exercises')
    }
    setRecovered(true)
  }, [recentEntries, recovered, programSession.exercises])

  // Auto-save session state on changes (debounced)
  useEffect(() => {
    if (!restoredRef.current || phase === 'done') return
    saveSessionState({
      programId,
      sessionIndex,
      phase,
      currentExerciseIdx,
      exerciseStatuses,
      sessionStartTime,
      warmupChecked: [...warmupChecked],
      draftSets: [...draftSetsRef.current.entries()].map(([exerciseId, sets]) => ({ exerciseId, sets })),
      restTimerEndTime: restTimerEndTimeRef.current,
    })
  }, [phase, currentExerciseIdx, exerciseStatuses, warmupChecked, saveSessionState, programId, sessionIndex, sessionStartTime])

  // Warn before closing/reloading during active session
  useEffect(() => {
    if (phase === 'done') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // Draft sets change handler
  const handleDraftSetsChange = useCallback((exerciseId: number, sets: NotebookSet[]) => {
    draftSetsRef.current.set(exerciseId, sets)
    if (!restoredRef.current || phase === 'done') return
    saveSessionState({
      programId,
      sessionIndex,
      phase,
      currentExerciseIdx,
      exerciseStatuses,
      sessionStartTime,
      warmupChecked: [...warmupChecked],
      draftSets: [...draftSetsRef.current.entries()].map(([eid, s]) => ({ exerciseId: eid, sets: s })),
      restTimerEndTime: restTimerEndTimeRef.current,
    })
  }, [phase, currentExerciseIdx, exerciseStatuses, warmupChecked, saveSessionState, programId, sessionIndex, sessionStartTime])

  // Rest timer change handler
  const handleRestTimerChange = useCallback((endTime: number | null) => {
    restTimerEndTimeRef.current = endTime
    if (!restoredRef.current || phase === 'done') return
    saveSessionState({
      programId,
      sessionIndex,
      phase,
      currentExerciseIdx,
      exerciseStatuses,
      sessionStartTime,
      warmupChecked: [...warmupChecked],
      draftSets: [...draftSetsRef.current.entries()].map(([eid, s]) => ({ exerciseId: eid, sets: s })),
      restTimerEndTime: endTime,
    })
  }, [phase, currentExerciseIdx, exerciseStatuses, warmupChecked, saveSessionState, programId, sessionIndex, sessionStartTime])

  // Build exercise catalog lookup
  const exerciseMap = useMemo(() => {
    const map = new Map<number, Exercise>()
    for (const ex of allExercises) {
      if (ex.id !== undefined) map.set(ex.id, ex)
    }
    return map
  }, [allExercises])

  // Session muscles for cooldown
  const sessionMuscles = useMemo(() => {
    const muscles = new Set<string>()
    for (const pe of programSession.exercises) {
      const ex = exerciseMap.get(pe.exerciseId)
      if (ex) {
        for (const m of ex.primaryMuscles) muscles.add(m)
      }
    }
    return [...muscles]
  }, [programSession.exercises, exerciseMap])

  const cooldownExercises = useMemo(
    () => selectCooldownExercises(sessionMuscles, allExercises),
    [sessionMuscles, allExercises]
  )

  // Current exercise info
  const currentProgramExercise = programSession.exercises[currentExerciseIdx]
  const currentCatalogExercise = currentProgramExercise
    ? exerciseMap.get(currentProgramExercise.exerciseId)
    : undefined

  const handleNextExercise = useCallback(() => {
    setExerciseStatuses(prev => prev.map((s, i) =>
      i === currentExerciseIdx ? { ...s, status: 'done' as const } : s
    ))
    setPhase('exercises')
  }, [currentExerciseIdx])

  const handleSkipExercise = useCallback((zone: BodyZone) => {
    setExerciseStatuses(prev => prev.map((s, i) =>
      i === currentExerciseIdx ? { ...s, status: 'skipped' as const, skipZone: zone } : s
    ))
    setPhase('exercises')
  }, [currentExerciseIdx])

  const handleOpenExercise = useCallback((idx: number) => {
    setCurrentExerciseIdx(idx)
    setPhase('notebook')
  }, [])

  const allDone = exerciseStatuses.every(s => s.status !== 'pending')

  const handleFinishSession = useCallback(async () => {
    try {
      // Load recent notebook entries to populate session sets
      const cutoff = new Date(Date.now() - 10 * 60 * 60 * 1000)
      const exerciseIds = programSession.exercises.map(e => e.exerciseId)
      const recentEntries = await db.notebookEntries
        .where('[userId+exerciseId]')
        .anyOf(exerciseIds.map(id => [userId, id]))
        .filter(e => {
          const d = e.date instanceof Date ? e.date : new Date(e.date)
          return d >= cutoff
        })
        .toArray()
      const entryByExercise = new Map(recentEntries.map(e => [e.exerciseId, e]))

      await db.workoutSessions.add({
        userId,
        programId,
        sessionName: programSession.name,
        startedAt: sessionStartTime,
        completedAt: new Date(),
        exercises: programSession.exercises.map((pe, i) => {
          const entry = entryByExercise.get(pe.exerciseId)
          const sets: import('../db/types').SessionSet[] = entry && !entry.skipped
            ? entry.sets.map((s, si) => ({
                setNumber: si + 1,
                prescribedReps: pe.targetReps,
                prescribedWeightKg: 0,
                actualReps: s.reps,
                actualWeightKg: s.weightKg,
                painReported: false,
                restPrescribedSeconds: pe.restSeconds,
              }))
            : []
          return {
            exerciseId: pe.exerciseId,
            exerciseName: exerciseMap.get(pe.exerciseId)?.name ?? '',
            prescribedSets: pe.sets,
            prescribedReps: pe.targetReps,
            prescribedWeightKg: 0,
            sets,
            order: i + 1,
            status: exerciseStatuses[i]?.status === 'done' ? 'completed' as const : 'skipped' as const,
            skippedReason: exerciseStatuses[i]?.status === 'skipped' ? 'pain' as const : undefined,
          }
        }),
        endPainChecks: [],
        notes: '',
      })
      await clearSessionState()
      setPhase('done')
    } catch (error) {
      console.error('Failed to save session:', error)
      setPhase('done')
    }
  }, [userId, programId, programSession, sessionStartTime, exerciseStatuses, exerciseMap, clearSessionState])

  // Swap: curated alternatives first (preserved order), then auto-matched
  // candidates derived from primaryMuscles + category. The auto-match acts as
  // a safety net so a freshly added exercise is reachable even if no curated
  // alternatives field references it yet.
  const swapOptions: SwapOption[] = useMemo(() => {
    if (!currentCatalogExercise) return []
    const usedIds = new Set(programSession.exercises.map((e) => e.exerciseId))
    const seen = new Set<number>()
    const result: SwapOption[] = []

    const canShow = (e: typeof allExercises[number]): boolean => {
      if (e.id === undefined) return false
      if (e.id === currentCatalogExercise.id) return false
      if (e.isRehab) return false
      if (usedIds.has(e.id)) return false
      if (seen.has(e.id)) return false
      return true
    }

    // 1. Curated alternatives, in the order declared on the exercise.
    const altNames = currentCatalogExercise.alternatives ?? []
    const altNamesLower = altNames.map((n) => n.toLowerCase())
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
    const currentMuscles = new Set(currentCatalogExercise.primaryMuscles.map((m) => m.toLowerCase()))
    for (const e of allExercises) {
      if (!canShow(e)) continue
      if (e.category !== currentCatalogExercise.category) continue
      const shares = e.primaryMuscles.some((m) => currentMuscles.has(m.toLowerCase()))
      if (!shares) continue
      seen.add(e.id!)
      result.push({ exerciseId: e.id!, name: e.name })
    }

    return result
  }, [currentCatalogExercise, allExercises, programSession.exercises])

  const handleSwapExercise = useCallback(async (newExerciseId: number) => {
    const program = await db.workoutPrograms.get(programId)
    if (!program?.sessions) return
    const updatedSessions = program.sessions.map((s) => {
      if (s.name !== programSession.name) return s
      return {
        ...s,
        exercises: s.exercises.map((e, eIdx) =>
          eIdx === currentExerciseIdx ? { ...e, exerciseId: newExerciseId } : e,
        ),
      }
    })
    await db.workoutPrograms.update(programId, { sessions: updatedSessions })
    // Stay in notebook phase — useLiveQuery reloads the program and
    // ExerciseNotebook re-renders with the new exercise without unmounting,
    // so the rest timer keeps running.
  }, [programId, programSession.name, currentExerciseIdx])

  // Intensity style
  const intensityKey = programSession.intensity as 'heavy' | 'volume' | 'moderate' | undefined
  const style = intensityKey ? INTENSITY[intensityKey] : INTENSITY.volume
  const doneCount = exerciseStatuses.filter(s => s.status !== 'pending').length
  const totalCount = programSession.exercises.length

  // ===== RENDER PHASES =====

  // --- WARMUP ---
  if (phase === 'warmup') {
    return (
      <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
        <div className={`h-1 ${style.bar}`} />
        <div className="px-5 pt-6 flex-1 flex flex-col overflow-hidden">
          <div className="text-center mb-5">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Echauffement</p>
            <h2 className="text-2xl font-black text-white mb-1">{programSession.name}</h2>
            <div className="flex items-center justify-center gap-2">
              <p className="text-zinc-400 text-sm">Halteres legeres ou barre a vide</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.text} ${style.bar}/20`}>{style.letter}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5">
            {fixedWarmupRoutine.map((item, i) => (
              <button
                key={i}
                onClick={() => setWarmupChecked(prev => {
                  const next = new Set(prev)
                  next.has(i) ? next.delete(i) : next.add(i)
                  return next
                })}
                className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-left active:scale-[0.98] transition-all duration-150"
                style={{ touchAction: 'manipulation' }}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  warmupChecked.has(i) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                }`}>
                  {warmupChecked.has(i) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm flex-1 ${warmupChecked.has(i) ? 'text-zinc-600 line-through' : 'text-white'}`}>
                  {item.name}
                </span>
                <span className="text-zinc-600 text-xs">{item.reps}</span>
              </button>
            ))}
          </div>

          <div className="pt-4 pb-6 flex-shrink-0">
            <button onClick={() => setPhase('exercises')} className={CTA}>
              C'est parti
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- EXERCISES LIST ---
  if (phase === 'exercises') {
    return (
      <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
        <div className={`h-1 ${style.bar}`} />
        <div className="px-5 pt-6 flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-white">{programSession.name}</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.text} bg-zinc-800`}>{style.letter}</span>
              </div>
              <ElapsedTimer startTime={sessionStartTime} />
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                  style={{ width: `${(doneCount / totalCount) * 100}%` }}
                />
              </div>
              <span className="text-zinc-600 text-xs tabular-nums">{doneCount}/{totalCount}</span>
            </div>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {programSession.exercises.map((pe, idx) => {
              const catalog = exerciseMap.get(pe.exerciseId)
              const status = exerciseStatuses[idx]
              return (
                <button
                  key={pe.exerciseId}
                  onClick={() => handleOpenExercise(idx)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-all duration-150 border ${
                    status.status === 'done' ? 'bg-zinc-900/50 border-zinc-800/50' :
                    status.status === 'skipped' ? 'bg-red-950/30 border-red-900/30' :
                    'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  {/* Status dot */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    status.status === 'done' ? 'bg-emerald-500 text-white' :
                    status.status === 'skipped' ? 'bg-red-500/20 text-red-400' :
                    'border-2 border-zinc-700'
                  }`}>
                    {status.status === 'done' && '\u2713'}
                    {status.status === 'skipped' && '/'}
                  </div>

                  {/* Exercise info */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${status.status !== 'pending' ? 'text-zinc-500' : 'text-white'}`}>
                      {catalog?.name ?? `Exercise #${pe.exerciseId}`}
                    </p>
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {pe.sets} x {pe.isTimeBased ? `${pe.targetReps}s` : pe.targetReps} — {pe.restSeconds}s repos
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <div className="pt-4 pb-6 flex-shrink-0">
            {allDone ? (
              <button
                onClick={() => cooldownExercises.length > 0 ? setPhase('cooldown') : handleFinishSession()}
                className={CTA}
              >
                {cooldownExercises.length > 0 ? 'Cooldown' : 'Terminer la seance'}
              </button>
            ) : (
              <button
                onClick={() => {
                  const nextPending = exerciseStatuses.findIndex(s => s.status === 'pending')
                  if (nextPending >= 0) handleOpenExercise(nextPending)
                }}
                className={CTA}
              >
                Continuer
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- NOTEBOOK (exercise detail) ---
  if (phase === 'notebook' && currentProgramExercise && currentCatalogExercise) {
    const intensity = (programSession.intensity ?? 'volume') as 'heavy' | 'volume' | 'moderate'
    const drafts = draftSetsRef.current.get(currentProgramExercise.exerciseId)
    return (
      <ExerciseNotebook
        exercise={{
          exerciseId: currentProgramExercise.exerciseId,
          exerciseName: currentCatalogExercise.name,
          instructions: currentCatalogExercise.instructions,
          category: currentCatalogExercise.category as 'compound' | 'isolation' | 'rehab' | 'mobility' | 'core',
          primaryMuscles: currentCatalogExercise.primaryMuscles,
          isRehab: currentCatalogExercise.isRehab,
          contraindications: currentCatalogExercise.contraindications,
        }}
        activeZones={activeZones}
        target={{
          sets: currentProgramExercise.sets,
          reps: currentProgramExercise.targetReps,
          restSeconds: currentProgramExercise.restSeconds,
          intensity,
          isTimeBased: currentProgramExercise.isTimeBased,
        }}
        exerciseIndex={currentExerciseIdx}
        totalExercises={programSession.exercises.length}
        userId={userId}
        exerciseCatalog={allExercises}
        swapOptions={swapOptions}
        initialDraftSets={drafts}
        initialRestTimerEndTime={restTimerEndTimeRef.current}
        onDraftSetsChange={handleDraftSetsChange}
        onRestTimerChange={handleRestTimerChange}
        onNext={handleNextExercise}
        onSkip={handleSkipExercise}
        onSwap={handleSwapExercise}
      />
    )
  }

  // --- COOLDOWN ---
  if (phase === 'cooldown') {
    return (
      <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
        <div className={`h-1 ${style.bar}`} />
        <div className="px-5 pt-6 flex-1 flex flex-col overflow-hidden">
          <div className="text-center mb-5">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Cooldown</p>
            <h2 className="text-2xl font-black text-white">Etirements</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {cooldownExercises.map((ex, i) => (
              <div key={ex.id ?? i} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-white font-semibold text-sm">{ex.name}</p>
                <p className="text-zinc-400 text-sm mt-1.5 leading-relaxed">{ex.instructions}</p>
              </div>
            ))}
            {cooldownExercises.length === 0 && (
              <p className="text-zinc-600 text-center py-8">Pas d'etirements specifiques aujourd'hui.</p>
            )}
          </div>

          <div className="pt-4 pb-6 flex-shrink-0">
            <button onClick={handleFinishSession} className={CTA}>
              Terminer la seance
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- DONE ---
  if (phase === 'done') {
    return <DoneScreen
      exerciseStatuses={exerciseStatuses}
      sessionStartTime={sessionStartTime}
      userId={userId}
      currentSessionName={programSession.name}
      nextSessionName={nextSessionName}
      onStartNext={() => navigate(`/session?programId=${programId}&sessionIndex=${nextSessionIndex}`)}
      onModify={() => {
        // Reset to the first exercise — useNotebook will pre-load the recently
        // logged sets so the user can review/edit each entry as they go.
        setCurrentExerciseIdx(0)
        setExerciseStatuses(programSession.exercises.map(e => ({ exerciseId: e.exerciseId, status: 'pending' })))
        setPhase('exercises')
      }}
    />
  }

  return null
}

// ---------------------------------------------------------------------------
// Done screen
// ---------------------------------------------------------------------------

function DoneScreen({
  exerciseStatuses,
  sessionStartTime,
  userId,
  currentSessionName,
  nextSessionName,
  onStartNext,
  onModify,
}: {
  exerciseStatuses: ExerciseStatus[]
  sessionStartTime: Date
  userId: number
  currentSessionName: string
  nextSessionName: string
  onStartNext: () => void
  onModify: () => void
}) {
  const doneCount = exerciseStatuses.filter(s => s.status === 'done').length
  const duration = Math.round((Date.now() - sessionStartTime.getTime()) / 60000)

  const stats = useLiveQuery(async () => {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const exerciseIds = exerciseStatuses.map(s => s.exerciseId)
    const entries = await db.notebookEntries
      .where('userId').equals(userId)
      .filter(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d >= cutoff && !e.skipped && exerciseIds.includes(e.exerciseId)
      })
      .toArray()
    let tonnage = 0
    let setsCount = 0
    for (const entry of entries) {
      setsCount += entry.sets.length
      for (const s of entry.sets) tonnage += s.weightKg * s.reps
    }
    return { tonnage: Math.round(tonnage), setsCount }
  }, [userId, exerciseStatuses])

  return (
    <div className="flex flex-col h-[var(--content-h)] px-5 pt-8 pb-6 bg-zinc-950 overflow-y-auto">
      {/* Celebration header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-4xl font-black text-white mb-2 text-center">Belle séance 💪</h1>
        <p className="text-xl text-zinc-400 text-center">{currentSessionName}</p>
      </div>

      {/* Stats grid 2×2 */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <StatCard label="Durée" value={`${duration} min`} />
        <StatCard label="Exercices" value={String(doneCount)} />
        <StatCard
          label="Tonnage"
          value={stats ? (stats.tonnage > 0 ? `${stats.tonnage.toLocaleString()} kg` : '—') : '—'}
          accent={!!stats && stats.tonnage > 0}
        />
        <StatCard label="Séries" value={stats ? String(stats.setsCount) : '—'} />
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 mt-auto">
        <button onClick={onStartNext} className={CTA}>
          Commencer {nextSessionName}
        </button>
        <button onClick={onModify} className={CTA_SECONDARY}>
          Modifier la séance
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-600 text-[10px] uppercase tracking-wider font-bold mb-1.5">{label}</p>
      <p className={`text-3xl font-black ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

class SessionErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <p className="text-red-400 text-lg font-bold mb-2">Erreur de session</p>
          <p className="text-zinc-500 text-sm mb-6">{this.state.error.message}</p>
          <button
            onClick={() => { window.location.href = window.location.pathname.replace(/\/session.*/, '/') }}
            className={CTA_SECONDARY}
          >
            Retour
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function parseIntSafe(val: string | null, defaultVal: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (val === null) return defaultVal
  const num = parseInt(val, 10)
  if (!Number.isInteger(num) || num < min || num > max) return defaultVal
  return num
}

export default function SessionPage() {
  const [searchParams] = useSearchParams()
  const programId = parseIntSafe(searchParams.get('programId'), 1, 0, 10000)
  const sessionIndex = parseIntSafe(searchParams.get('sessionIndex'), 0, 0, 100)

  return (
    <div className="h-[var(--content-h)] overflow-hidden bg-zinc-950 text-white">
      <SessionErrorBoundary>
        <SessionContent programId={programId} sessionIndex={sessionIndex} />
      </SessionErrorBoundary>
    </div>
  )
}
