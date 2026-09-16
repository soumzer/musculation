import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotebook, type SaveResult } from '../../hooks/useNotebook'
import { useRestTimer } from '../../hooks/useRestTimer'
import { SkipModal, OccupiedOverlay } from './ExerciseNotebook'
import { formatReps, formatRestLabel } from '../../utils/format-prescription'
import { deloadWeight } from '../../utils/coach-week'
import { doubleProgression } from '../../utils/double-progression'
import { suggestFillerFromCatalog, type FillerSuggestion } from '../../engine/filler'
import type { BodyZone, Exercise, NotebookSet, PerSide } from '../../db/types'
import type { SwapOption } from '../../utils/swap-options'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupersetMember {
  /** Index de l'exo dans la séance. */
  index: number
  /** « A1 », « A2 »… */
  label: string
  exercise: {
    exerciseId: number
    exerciseName: string
    instructions: string
    category: 'compound' | 'isolation' | 'rehab' | 'mobility' | 'core'
    primaryMuscles: string[]
    contraindications: string[]
  }
  target: {
    sets: number
    reps: number
    repsMax?: number
    restSeconds: number
    isTimeBased?: boolean
    perSide?: PerSide
    cue?: string
    deload?: boolean
    /** Incrément de la double progression (+2,5 haltères, +5 machines). */
    increment?: number
  }
  status: 'pending' | 'done' | 'skipped'
  swapOptions: SwapOption[]
  initialDraftSets?: NotebookSet[]
}

export interface SupersetNotebookProps {
  /** Lettre du groupe : « A ». */
  group: string
  members: SupersetMember[]
  totalExercises: number
  intensity: 'heavy' | 'volume' | 'moderate' | 'rehab'
  userId: number
  activeZones: string[]
  exerciseCatalog: Exercise[]
  /** Repos du groupe (après le dernier exo). */
  restSeconds: number
  /** Gainage à faire pendant le repos (programme coach). */
  restHint?: { name: string; detail: string }
  initialRestTimerEndTime?: number | null
  onDraftSetsChange?: (exerciseId: number, sets: NotebookSet[]) => void
  onRestTimerChange?: (endTime: number | null) => void
  /** Tous les exos du groupe sont enregistrés → la séance les marque faits. */
  onGroupDone: () => void
  onSkipAt: (index: number, zone: BodyZone) => void
  onSwapAt: (index: number, newExerciseId: number) => void
}

interface MemberApi {
  save: () => Promise<SaveResult>
  hasSets: () => boolean
}

// ---------------------------------------------------------------------------
// Design tokens (mêmes que ExerciseNotebook)
// ---------------------------------------------------------------------------

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-4'
const SECTION_LABEL = 'text-zinc-600 text-xs uppercase tracking-wider'

function tapFeedback() {
  try { navigator.vibrate?.(10) } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Un exo du superset : carnet compact (historique, séries, saisie)
// ---------------------------------------------------------------------------

function MemberBlock({
  member,
  userId,
  intensity,
  activeZones,
  isLast,
  nextLabel,
  restSeconds,
  onSetLogged,
  onSkip,
  onSwap,
  onDraftSetsChange,
  register,
}: {
  member: SupersetMember
  userId: number
  intensity: SupersetNotebookProps['intensity']
  activeZones: string[]
  isLast: boolean
  nextLabel: string | null
  restSeconds: number
  onSetLogged: (index: number) => void
  onSkip: (zone: BodyZone) => void
  onSwap: (newExerciseId: number) => void
  onDraftSetsChange?: (exerciseId: number, sets: NotebookSet[]) => void
  register: (index: number, api: MemberApi | null) => void
}) {
  const { exercise, target } = member
  const notebook = useNotebook(
    userId,
    exercise.exerciseId,
    exercise.exerciseName,
    intensity,
    onSkip,
    member.initialDraftSets,
    onDraftSetsChange,
    { deload: target.deload },
  )

  const progression = target.increment !== undefined && !target.isTimeBased
    ? doubleProgression(notebook.lastEntry, { sets: target.sets, reps: target.reps, repsMax: target.repsMax }, target.increment)
    : null

  // Le parent enregistre tout le groupe d'un coup (bouton OK) : on lui donne
  // une poignée vers ce carnet, rafraîchie à chaque changement de séries.
  useEffect(() => {
    register(member.index, {
      save: notebook.saveAndNext,
      hasSets: () => notebook.currentSets.length > 0,
    })
    return () => register(member.index, null)
  }, [member.index, notebook.saveAndNext, notebook.currentSets.length, register])

  const [showSkipModal, setShowSkipModal] = useState(false)
  const [showSwap, setShowSwap] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [inputWeight, setInputWeight] = useState('')
  const [weightTouched, setWeightTouched] = useState(false)
  const [inputReps, setInputReps] = useState('')
  const prefillWeight = target.deload
    ? null
    : progression?.kind === 'increase' && progression.weightKg !== null
      ? progression.weightKg
      : notebook.lastWeight
  const effectiveWeight = weightTouched || inputWeight !== ''
    ? inputWeight
    : (prefillWeight !== null ? String(prefillWeight) : '')

  const hasContraindication = activeZones.length > 0 &&
    exercise.contraindications.some((z) => activeZones.includes(z))

  const handleAddSet = useCallback(() => {
    const w = parseFloat(effectiveWeight)
    const r = parseInt(inputReps, 10)
    if (isNaN(w) || w < 0 || !r || r <= 0) return
    notebook.addSet(w, r)
    tapFeedback()
    setInputWeight(String(w))
    setWeightTouched(true)
    setInputReps('')
    onSetLogged(member.index)
  }, [effectiveWeight, inputReps, notebook, onSetLogged, member.index])

  const handleHoldDone = useCallback(() => {
    notebook.addSet(0, target.reps)
    tapFeedback()
    onSetLogged(member.index)
  }, [notebook, target.reps, onSetLogged, member.index])

  if (member.status === 'skipped') {
    return (
      <div className={`${CARD} mb-3 opacity-60`}>
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-xs font-bold">{member.label}</span>
          <span className="text-zinc-500 text-sm line-through">{exercise.exerciseName}</span>
          <span className="text-red-400 text-xs ml-auto">Skippé</span>
        </div>
      </div>
    )
  }

  const lastEntry = notebook.history.find((e) => !e.skipped && e.sets.length > 0)
  const setsLeft = target.sets - notebook.currentSets.length
  const repsLabel = formatReps({ targetReps: target.reps, targetRepsMax: target.repsMax, isTimeBased: target.isTimeBased, perSide: target.perSide })

  return (
    <div className={`${CARD} mb-3`}>
      {showSkipModal && (
        <SkipModal
          onSelect={(zone, result) => { setShowSkipModal(false); notebook.skipExercise(zone, result) }}
          onCancel={() => setShowSkipModal(false)}
        />
      )}

      {/* Titre */}
      <div className="flex items-start gap-2">
        <span className="text-emerald-400 text-xs font-black mt-1 w-6 flex-shrink-0">{member.label}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold leading-tight">{exercise.exerciseName}</p>
          <p className="text-zinc-400 text-xs mt-1">
            {target.sets} x {repsLabel}
            {isLast
              ? ` · repos ${formatRestLabel(restSeconds)} après`
              : nextLabel ? ` · enchaîne ${nextLabel}` : ''}
          </p>
          {target.cue && <p className="text-amber-400/90 text-xs mt-0.5">{target.cue}</p>}
          {progression && !target.deload && (
            <p className={`text-xs mt-0.5 ${progression.kind === 'increase' ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}`}>
              {progression.kind === 'increase' ? '↑ ' : ''}{progression.message}
            </p>
          )}
          {target.deload && !target.isTimeBased && (
            <p className="text-amber-400 text-xs mt-0.5">
              Allégé : {deloadWeight(notebook.lastWeight) !== null
                ? `~${deloadWeight(notebook.lastWeight)} kg (70 % de ${notebook.lastWeight})`
                : '70 % de ta charge habituelle'}
            </p>
          )}
        </div>
      </div>

      {hasContraindication && (
        <p className="text-amber-400 text-xs mt-2">Zone sensible — adapte la charge ou skip si douleur.</p>
      )}

      {/* Actions secondaires */}
      <div className="flex items-center gap-3 mt-2 ml-8">
        {exercise.instructions && (
          <button onClick={() => setShowDescription((d) => !d)} className="text-zinc-500 text-xs underline">
            {showDescription ? 'Masquer' : 'Description'}
          </button>
        )}
        {member.swapOptions.length > 0 && (
          <button onClick={() => setShowSwap((v) => !v)} className="text-zinc-500 text-xs underline">
            {showSwap ? 'Fermer' : 'Changer'}
          </button>
        )}
        <button onClick={() => setShowSkipModal(true)} className="text-zinc-500 text-xs underline">
          Skip
        </button>
      </div>

      {showDescription && exercise.instructions && (
        <p className="text-zinc-400 text-xs leading-relaxed mt-2 ml-8">{exercise.instructions}</p>
      )}

      {showSwap && member.swapOptions.length > 0 && (
        <div className="mt-2 ml-8 space-y-1.5">
          <p className={SECTION_LABEL}>Alternatives</p>
          {member.swapOptions.map((alt) => (
            <button
              key={alt.exerciseId}
              onClick={() => { onSwap(alt.exerciseId); setShowSwap(false) }}
              className="w-full text-left text-sm text-white bg-zinc-800 rounded-xl px-3 py-2 active:scale-[0.98] transition-all duration-150"
            >
              {alt.name}
            </button>
          ))}
        </div>
      )}

      {/* Dernière fois */}
      {lastEntry && (
        <p className="text-zinc-500 text-xs mt-2 ml-8">
          Dernière fois : <span className="text-zinc-300">{lastEntry.sets.map((s) => target.isTimeBased ? `${s.reps}s` : `${s.weightKg}kg × ${s.reps}`).join(' · ')}</span>
        </p>
      )}

      {/* Séries faites */}
      <div className="mt-3 ml-8 space-y-1.5">
        {notebook.currentSets.map((set, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-emerald-400 w-6 tabular-nums">S{i + 1}</span>
            {target.isTimeBased ? (
              <span className="text-white font-medium">Tenu {set.reps}s{target.perSide ? `/${target.perSide}` : ''}</span>
            ) : (
              <>
                <span className="text-white font-medium">{set.weightKg}kg</span>
                <span className="text-zinc-500">x</span>
                <span className="text-white font-medium">{set.reps}</span>
                {set.reps >= target.reps && <span className="text-emerald-400 text-xs ml-auto">OK</span>}
              </>
            )}
          </div>
        ))}

        {/* Saisie de la prochaine série */}
        {setsLeft > 0 && (
          target.isTimeBased ? (
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-6 text-sm tabular-nums">S{notebook.currentSets.length + 1}</span>
              <button
                onClick={handleHoldDone}
                className="flex-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl py-2 text-sm font-semibold active:scale-[0.98] transition-all duration-150"
              >
                ✓ Tenu {target.reps}s{target.perSide ? ` / ${target.perSide}` : ''}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-6 text-sm tabular-nums">S{notebook.currentSets.length + 1}</span>
              <input
                type="number"
                inputMode="decimal"
                value={effectiveWeight}
                onChange={(e) => { setInputWeight(e.target.value); setWeightTouched(true) }}
                placeholder="kg"
                className="w-20 bg-zinc-800 text-white text-center rounded-xl px-2 py-2 text-sm outline-none placeholder-zinc-600"
              />
              <span className="text-zinc-500 text-sm">x</span>
              <input
                type="number"
                inputMode="numeric"
                value={inputReps}
                onChange={(e) => setInputReps(e.target.value)}
                placeholder="reps"
                className="w-16 bg-zinc-800 text-white text-center rounded-xl px-2 py-2 text-sm outline-none placeholder-zinc-600"
              />
              <button
                onClick={handleAddSet}
                disabled={!effectiveWeight || !inputReps}
                className="ml-auto bg-emerald-500 text-white rounded-xl px-3.5 py-2 text-lg font-bold active:scale-95 transition-all duration-200 disabled:opacity-30"
              >
                +
              </button>
            </div>
          )
        )}

        {notebook.currentSets.length > 0 && (
          <button onClick={notebook.removeLastSet} className="text-zinc-500 text-xs underline">
            Supprimer dernière série
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Écran superset : A1 + A2 ensemble, timer de repos partagé
// ---------------------------------------------------------------------------

export default function SupersetNotebook({
  group,
  members,
  totalExercises,
  intensity,
  userId,
  activeZones,
  exerciseCatalog,
  restSeconds,
  restHint,
  initialRestTimerEndTime,
  onDraftSetsChange,
  onRestTimerChange,
  onGroupDone,
  onSkipAt,
  onSwapAt,
}: SupersetNotebookProps) {
  const timer = useRestTimer(restSeconds, initialRestTimerEndTime)
  useEffect(() => {
    onRestTimerChange?.(timer.endTime)
  }, [timer.endTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const apis = useRef(new Map<number, MemberApi>())
  const register = useCallback((index: number, api: MemberApi | null) => {
    if (api) apis.current.set(index, api)
    else apis.current.delete(index)
  }, [])

  const [prFlash, setPrFlash] = useState<{ weightKg: number; name: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showOccupied, setShowOccupied] = useState(false)
  const [shownFillerNames, setShownFillerNames] = useState<Set<string>>(new Set())
  const [displayedFillers, setDisplayedFillers] = useState<FillerSuggestion[]>([])

  const active = members.filter((m) => m.status !== 'skipped')
  const lastActive = active[active.length - 1]
  const first = members[0]
  const last = members[members.length - 1]

  // Une série sur le DERNIER exo du groupe lance le repos ; sur les autres,
  // on enchaîne sans timer.
  const handleSetLogged = useCallback((index: number) => {
    if (lastActive && index === lastActive.index && restSeconds > 0) {
      timer.reset()
      timer.start()
    }
  }, [lastActive, restSeconds, timer])

  const saveMembers = useCallback(async (onlyWithSets: boolean) => {
    let pr: { weightKg: number; name: string } | null = null
    for (const m of members) {
      if (m.status === 'skipped') continue
      const api = apis.current.get(m.index)
      if (!api) continue
      if (onlyWithSets && !api.hasSets()) continue
      const result = await api.save()
      if (result.isWeightPR && result.prWeightKg) pr = { weightKg: result.prWeightKg, name: m.exercise.exerciseName }
    }
    return pr
  }, [members])

  const handleSave = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const pr = await saveMembers(false)
      if (pr) {
        setPrFlash(pr)
        setTimeout(() => { setPrFlash(null); onGroupDone() }, 2000)
      } else {
        onGroupDone()
      }
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, saveMembers, onGroupDone])

  // « Suivant » : comme dans le carnet simple, les séries saisies sont
  // enregistrées silencieusement avant d'avancer.
  const handlePass = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await saveMembers(true)
      onGroupDone()
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, saveMembers, onGroupDone])

  const openOccupied = useCallback(() => {
    const muscles = [...new Set(members.flatMap((m) => m.exercise.primaryMuscles))]
    const fresh = suggestFillerFromCatalog({
      sessionMuscles: muscles,
      completedFillers: [...shownFillerNames],
      exerciseCatalog,
    })
    setDisplayedFillers(fresh)
    if (fresh.length > 0) {
      setShownFillerNames((prev) => {
        const next = new Set(prev)
        for (const f of fresh) next.add(f.name)
        return next
      })
    }
    setShowOccupied(true)
  }, [members, exerciseCatalog, shownFillerNames])

  return (
    <div key={members.map((m) => m.exercise.exerciseId).join('-')} className="flex flex-col h-[var(--content-h)] overflow-hidden bg-zinc-950 text-white">
      {showOccupied && (
        <OccupiedOverlay suggestions={displayedFillers} onClose={() => setShowOccupied(false)} />
      )}

      <div className="flex-1 overflow-auto px-4 pt-3 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={handlePass} className="text-zinc-500 text-sm active:text-zinc-300 transition-colors py-2 pr-3">
            Suivant ›
          </button>
          <span className="text-zinc-600 text-sm tabular-nums">{first.index + 1}-{last.index + 1}/{totalExercises}</span>
        </div>

        <div className="mb-3">
          <h1 className="text-xl font-black text-white">Superset {group}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {members.map((m) => m.label).join(' → ')} sans repos, {formatRestLabel(restSeconds)} après {last.label}
          </p>
        </div>

        {members.map((m, i) => (
          <MemberBlock
            key={m.exercise.exerciseId}
            member={m}
            userId={userId}
            intensity={intensity}
            activeZones={activeZones}
            isLast={lastActive?.index === m.index}
            nextLabel={members[i + 1]?.label ?? null}
            restSeconds={restSeconds}
            onSetLogged={handleSetLogged}
            onSkip={(zone) => onSkipAt(m.index, zone)}
            onSwap={(id) => onSwapAt(m.index, id)}
            onDraftSetsChange={onDraftSetsChange}
            register={register}
          />
        ))}

        {/* Repos partagé */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-2`}>Repos après {last.label}</p>
          <div className="flex items-center gap-4">
            <span className={`text-3xl font-mono font-bold tabular-nums ${timer.remaining === 0 && !timer.isRunning ? 'text-emerald-400' : 'text-white'}`}>
              {timer.formatTime()}
            </span>
            <div className="flex gap-2">
              {timer.isRunning ? (
                <button onClick={timer.pause} className="bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm active:scale-95 transition-all duration-200">
                  Pause
                </button>
              ) : (
                <button onClick={timer.start} className="bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm active:scale-95 transition-all duration-200">
                  Lancer
                </button>
              )}
              <button onClick={timer.reset} className="bg-zinc-800 text-zinc-400 rounded-xl px-3 py-2 text-sm active:scale-95 transition-all duration-200">
                Reset
              </button>
            </div>
          </div>
          {restHint && (
            <p className="text-zinc-400 text-xs mt-2">
              Pendant le repos : <span className="text-white font-medium">{restHint.name}</span> · {restHint.detail}
            </p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-[var(--nav-h)] left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 py-3 flex gap-3">
        <button
          onClick={openOccupied}
          className="bg-zinc-800 text-zinc-300 rounded-xl py-3 px-4 text-sm flex-shrink-0 active:scale-95 transition-all duration-200"
        >
          Occupée
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 bg-emerald-500 text-white font-bold rounded-xl py-3 text-lg active:scale-95 transition-all duration-200 disabled:opacity-50"
        >
          OK
        </button>
      </div>

      {prFlash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-[fadeIn_0.2s_ease-out]">
          <div className="text-center animate-[scaleIn_0.3s_ease-out]">
            <p className="text-5xl font-black text-amber-400 mb-2">RECORD !</p>
            <p className="text-2xl text-white font-bold">{prFlash.weightKg} kg</p>
            <p className="text-zinc-400 mt-1">{prFlash.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}
