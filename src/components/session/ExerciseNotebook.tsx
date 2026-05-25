import { useState, useCallback, useEffect, useRef } from 'react'
import { useNotebook } from '../../hooks/useNotebook'
import { useRestTimer } from '../../hooks/useRestTimer'
import { useExerciseNote } from '../../hooks/useExerciseNote'
import { generateWarmupSets } from '../../engine/warmup'
import SymptomQuestionnaire from '../onboarding/SymptomQuestionnaire'
import type { QuestionnaireResult } from '../onboarding/SymptomQuestionnaire'
import type { BodyZone, NotebookSet } from '../../db/types'
import type { FillerSuggestion } from '../../engine/filler'

export interface SwapOption {
  exerciseId: number
  name: string
}

export interface ExerciseNotebookProps {
  exercise: {
    exerciseId: number
    exerciseName: string
    instructions: string
    category: 'compound' | 'isolation' | 'rehab' | 'mobility' | 'core'
    primaryMuscles: string[]
    isRehab: boolean
    contraindications: string[]
  }
  /** Active painful zones from user's health conditions */
  activeZones: string[]
  target: {
    sets: number
    reps: number
    restSeconds: number
    intensity: 'heavy' | 'volume' | 'moderate' | 'rehab'
    isTimeBased?: boolean
  }
  exerciseIndex: number
  totalExercises: number
  userId: number
  fillerSuggestions: FillerSuggestion[]
  swapOptions: SwapOption[]
  initialDraftSets?: NotebookSet[]
  initialRestTimerEndTime?: number | null
  onDraftSetsChange?: (exerciseId: number, sets: NotebookSet[]) => void
  onRestTimerChange?: (endTime: number | null) => void
  onNext: () => void
  onSkip: (zone: BodyZone) => void
  onSwap: (newExerciseId: number) => void
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const INTENSITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  heavy: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Force' },
  volume: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Volume' },
  moderate: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Modere' },
}

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-4'
const SECTION_LABEL = 'text-zinc-600 text-xs uppercase tracking-wider'

import { bodyZones as BODY_ZONES } from '../../constants/body-zones'

export default function ExerciseNotebook({
  exercise,
  target,
  exerciseIndex,
  totalExercises,
  userId,
  activeZones,
  fillerSuggestions,
  swapOptions,
  initialDraftSets,
  initialRestTimerEndTime,
  onDraftSetsChange,
  onRestTimerChange,
  onNext,
  onSkip,
  onSwap,
}: ExerciseNotebookProps) {
  const notebook = useNotebook(
    userId,
    exercise.exerciseId,
    exercise.exerciseName,
    target.intensity,
    onNext,
    onSkip,
    initialDraftSets,
    onDraftSetsChange,
  )

  const timer = useRestTimer(target.restSeconds, initialRestTimerEndTime)

  // Hold timer for isTimeBased exos (planks, etc.) — countdown of target.reps
  // seconds. Auto-validates a set when it reaches 0. Idle (0s) for non-timed
  // exos; harmless because the timed-mode effects gate on target.isTimeBased.
  const holdTimer = useRestTimer(target.isTimeBased ? target.reps : 0)
  const holdValidatedRef = useRef(false)

  // Notify parent when rest timer state changes
  useEffect(() => {
    onRestTimerChange?.(timer.endTime)
  }, [timer.endTime]) // eslint-disable-line react-hooks/exhaustive-deps
  const exerciseNote = useExerciseNote(userId, exercise.exerciseId)

  const [showDescription, setShowDescription] = useState(exercise.isRehab)
  const [showSkipModal, setShowSkipModal] = useState(false)
  const [showOccupied, setShowOccupied] = useState(false)
  const [showSwap, setShowSwap] = useState(false)
  const [workingWeight, setWorkingWeight] = useState<string>('')
  const [prFlash, setPrFlash] = useState<{ weightKg: number } | null>(null)

  // Check if exercise touches a painful zone
  const hasContraindication = activeZones.length > 0 &&
    exercise.contraindications.some(z => activeZones.includes(z))

  // Warmup sets for compounds
  const isCompound = exercise.category === 'compound'
  const ww = parseFloat(workingWeight) || 0
  const warmupSets = isCompound && ww > 0 ? generateWarmupSets(ww) : []

  // Set input state
  const [inputWeight, setInputWeight] = useState('')
  const [inputReps, setInputReps] = useState('')

  // Pre-fill weight from last session when history loads
  useEffect(() => {
    if (notebook.lastWeight !== null && inputWeight === '') {
      setInputWeight(String(notebook.lastWeight))
    }
  }, [notebook.lastWeight])

  const handleSave = useCallback(async () => {
    const result = await notebook.saveAndNext()
    if (result.isWeightPR && result.prWeightKg) {
      setPrFlash({ weightKg: result.prWeightKg })
      setTimeout(() => {
        setPrFlash(null)
        onNext()
      }, 2000)
    } else {
      onNext()
    }
  }, [notebook, onNext])

  const handleAddSet = useCallback(() => {
    const w = parseFloat(inputWeight)
    const r = parseInt(inputReps, 10)
    if (isNaN(w) || w < 0 || !r || r <= 0) return
    notebook.addSet(w, r)
    try { navigator.vibrate?.(10) } catch { /* ignore */ }
    // Keep weight, clear reps for next set
    setInputReps('')
    // Start rest timer after logging a set
    timer.reset()
    timer.start()
  }, [inputWeight, inputReps, notebook, timer])

  // Timed exos: when the hold countdown reaches 0, auto-log a set with
  // {weightKg:0, reps:duration} and trigger the inter-set rest. A ref prevents
  // double-firing on the same cycle (the effect would otherwise re-run on
  // subsequent renders where remaining stays at 0).
  useEffect(() => {
    if (!target.isTimeBased) return
    if (holdTimer.isRunning) {
      // New cycle started — clear the validated flag so the next hit at 0 fires.
      holdValidatedRef.current = false
      return
    }
    if (holdTimer.remaining !== 0) return
    if (holdValidatedRef.current) return
    if (notebook.currentSets.length >= target.sets) return
    holdValidatedRef.current = true
    notebook.addSet(0, target.reps)
    try { navigator.vibrate?.(10) } catch { /* ignore */ }
    // Start rest unless that was the final set
    if (notebook.currentSets.length + 1 < target.sets) {
      timer.reset()
      timer.start()
    }
  }, [holdTimer.remaining, holdTimer.isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Timed exos: after the inter-set rest finishes, reset the hold timer so
  // the next set starts from the full duration.
  useEffect(() => {
    if (!target.isTimeBased) return
    if (timer.isRunning) return
    if (timer.remaining !== 0) return
    if (notebook.currentSets.length === 0) return
    if (notebook.currentSets.length >= target.sets) return
    holdTimer.reset()
  }, [timer.remaining, timer.isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  const intensityInfo = INTENSITY_COLORS[target.intensity]

  return (
    <div key={exercise.exerciseId} className="flex flex-col h-[var(--content-h)] overflow-hidden bg-zinc-950 text-white">
      {/* Skip modal */}
      {showSkipModal && (
        <SkipModal
          onSelect={(zone, result) => { setShowSkipModal(false); notebook.skipExercise(zone, result) }}
          onCancel={() => setShowSkipModal(false)}
        />
      )}

      {/* Occupied overlay */}
      {showOccupied && (
        <OccupiedOverlay
          suggestions={fillerSuggestions}
          onClose={() => setShowOccupied(false)}
        />
      )}

      <div className="flex-1 overflow-auto px-4 pt-3 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={onNext} className="text-zinc-500 text-sm active:text-zinc-300 transition-colors">
            Passer
          </button>
          <span className="text-zinc-600 text-sm tabular-nums">{exerciseIndex + 1}/{totalExercises}</span>
        </div>

        {/* Exercise name + intensity badge */}
        <div className="mb-3">
          <h1 className="text-xl font-black text-white">{exercise.exerciseName}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-zinc-400 text-sm">
              {target.sets} x {target.isTimeBased ? `${target.reps}s` : `${target.reps} reps`} — repos {formatRestLabel(target.restSeconds)}
            </span>
            {exercise.isRehab ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                Rehab
              </span>
            ) : intensityInfo && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${intensityInfo.bg} ${intensityInfo.text}`}>
                {intensityInfo.label}
              </span>
            )}
          </div>
          {!exercise.isRehab && (
            <p className="text-zinc-600 text-xs mt-1.5">
              Increment: {isCompound ? '+2.5kg' : '+1.25kg'} quand reussi
            </p>
          )}
        </div>

        {/* Contraindication warning */}
        {hasContraindication && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-3">
            <p className="text-amber-400 text-sm">Attention — zone sensible. Adapte la charge ou skip si douleur.</p>
          </div>
        )}

        {/* Description toggle + swap button */}
        <div className="flex items-center gap-3 mb-3">
          {exercise.instructions && (
            <button
              onClick={() => setShowDescription(d => !d)}
              className="text-zinc-400 text-xs underline"
            >
              {showDescription ? 'Masquer description' : 'Voir description'}
            </button>
          )}
          {swapOptions.length > 0 && (
            <button
              onClick={() => setShowSwap(s => !s)}
              className="text-zinc-400 text-xs underline"
            >
              {showSwap ? 'Fermer' : 'Changer'}
            </button>
          )}
        </div>

        {/* Swap panel */}
        {showSwap && swapOptions.length > 0 && (
          <div className={`${CARD} mb-3 space-y-1.5`}>
            <p className={`${SECTION_LABEL} mb-1`}>Alternatives</p>
            {swapOptions.map((alt) => (
              <button
                key={alt.exerciseId}
                onClick={() => { onSwap(alt.exerciseId); setShowSwap(false) }}
                className="w-full text-left text-sm text-white bg-zinc-800 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-all duration-150"
              >
                {alt.name}
              </button>
            ))}
          </div>
        )}
        {showDescription && exercise.instructions && (
          <p className={`${CARD} text-zinc-400 text-sm leading-relaxed mb-3`}>
            {exercise.instructions}
          </p>
        )}

        {/* Warmup (compounds only) */}
        {isCompound && (
          <div className={`${CARD} mb-3`}>
            <p className={`${SECTION_LABEL} mb-2`}>Echauffement</p>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-zinc-400 text-sm">Poids travail:</span>
              <input
                type="number"
                inputMode="decimal"
                value={workingWeight}
                onChange={e => setWorkingWeight(e.target.value)}
                placeholder="kg"
                className="w-20 bg-zinc-800 text-white text-center rounded-xl px-2 py-2 text-sm outline-none placeholder-zinc-600"
              />
              <span className="text-zinc-500 text-sm">kg</span>
            </div>
            {warmupSets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {warmupSets.map((ws, i) => (
                  <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg">
                    {ws.weightKg > 0 ? `${ws.weightKg}kg` : ws.label} x {ws.reps}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History — last 3 sessions for this exercise */}
        {(() => {
          const pastEntries = notebook.history.filter(e => !e.skipped && e.sets.length > 0)
          if (pastEntries.length === 0) return null
          return (
            <div className={`${CARD} mb-3 space-y-2`}>
              <p className={SECTION_LABEL}>Historique</p>
              {pastEntries.map((entry, i) => {
                const d = entry.date instanceof Date ? entry.date : new Date(entry.date)
                const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
                const colors = entry.sessionIntensity ? INTENSITY_COLORS[entry.sessionIntensity] : null
                return (
                  <div key={entry.id ?? i} className="flex items-start gap-2 text-sm">
                    <span className="text-zinc-500 w-12 flex-shrink-0 tabular-nums">{dateStr}</span>
                    {colors && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${colors.bg} ${colors.text}`}>
                        {colors.label}
                      </span>
                    )}
                    <span className="text-white break-words min-w-0 flex-1">
                      {entry.sets.map(s => `${s.weightKg}kg × ${s.reps}`).join(' · ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Set input */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-3`}>Series</p>

          {/* Completed sets */}
          {notebook.currentSets.map((set, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 text-sm">
              <span className="text-emerald-400 w-6 tabular-nums">S{i + 1}</span>
              {target.isTimeBased ? (
                <span className="text-white font-medium">Tenu {set.reps}s</span>
              ) : (
                <>
                  <span className="text-white font-medium">{set.weightKg}kg</span>
                  <span className="text-zinc-500">x</span>
                  <span className="text-white font-medium">{set.reps}</span>
                  {set.reps >= target.reps && (
                    <span className="text-emerald-400 text-xs ml-auto">OK</span>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Input row for next set */}
          {notebook.currentSets.length < target.sets && (
            target.isTimeBased ? (
              // Hold timer block: countdown of target.reps seconds, auto-logs a set at 0.
              <div className="flex items-center gap-2 mt-3">
                <span className="text-zinc-500 w-6 text-sm tabular-nums">S{notebook.currentSets.length + 1}</span>
                <div className="bg-zinc-800/50 rounded-xl px-3 py-2 flex items-center gap-3 flex-1">
                  <span className={`text-xl font-mono font-bold tabular-nums ${
                    holdTimer.remaining === 0 ? 'text-emerald-400' : 'text-white'
                  }`}>
                    {holdTimer.formatTime()}
                  </span>
                  <div className="flex gap-2 ml-auto">
                    {holdTimer.isRunning ? (
                      <button
                        onClick={holdTimer.pause}
                        className="bg-zinc-800 text-white rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={holdTimer.start}
                        className="bg-emerald-500 text-white font-semibold rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                      >
                        Demarrer
                      </button>
                    )}
                    <button
                      onClick={holdTimer.reset}
                      className="bg-zinc-800 text-zinc-400 rounded-lg px-3 py-1.5 text-sm active:scale-95 transition-all duration-200"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-zinc-500 w-6 text-sm tabular-nums">S{notebook.currentSets.length + 1}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={inputWeight}
                  onChange={e => setInputWeight(e.target.value)}
                  placeholder="kg"
                  className="w-20 bg-zinc-800 text-white text-center rounded-xl px-2 py-2 text-sm outline-none placeholder-zinc-600"
                />
                <span className="text-zinc-500 text-sm">x</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={inputReps}
                  onChange={e => setInputReps(e.target.value)}
                  placeholder="reps"
                  className="w-16 bg-zinc-800 text-white text-center rounded-xl px-2 py-2 text-sm outline-none placeholder-zinc-600"
                />
                <button
                  onClick={handleAddSet}
                  disabled={!inputWeight || !inputReps}
                  className="ml-auto bg-emerald-500 text-white rounded-xl px-3.5 py-2 text-lg font-bold active:scale-95 transition-all duration-200 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            )
          )}

          {/* Remove last set */}
          {notebook.currentSets.length > 0 && (
            <button
              onClick={notebook.removeLastSet}
              className="text-zinc-500 text-xs mt-2 underline"
            >
              Supprimer derniere serie
            </button>
          )}
        </div>

        {/* Rest timer */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-2`}>Repos</p>
          <div className="flex items-center gap-4">
            <span className={`text-3xl font-mono font-bold tabular-nums ${timer.remaining === 0 && timer.isRunning === false && notebook.currentSets.length > 0 ? 'text-emerald-400' : 'text-white'}`}>
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
        </div>

        {/* Exercise note */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-2`}>Note</p>
          <textarea
            value={exerciseNote.note}
            onChange={e => exerciseNote.update(e.target.value)}
            onBlur={() => { if (exerciseNote.isDirty) exerciseNote.save(exerciseNote.note) }}
            placeholder="Ajouter une note..."
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 resize-none outline-none focus:border-zinc-600 placeholder-zinc-600"
          />
        </div>
      </div>

      {/* Bottom bar — fixed above BottomNav + safe area */}
      <div className="fixed bottom-[var(--nav-h)] left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 py-3 flex gap-3">
        <button
          onClick={() => setShowSkipModal(true)}
          className="bg-zinc-800 text-zinc-300 rounded-xl py-3 px-4 text-sm flex-shrink-0 active:scale-95 transition-all duration-200"
        >
          / Skip
        </button>
        <button
          onClick={() => setShowOccupied(true)}
          className="bg-zinc-800 text-zinc-300 rounded-xl py-3 px-4 text-sm flex-shrink-0 active:scale-95 transition-all duration-200"
        >
          Occupee
        </button>
        <button
          onClick={handleSave}
          disabled={notebook.isSaving}
          className="flex-1 bg-emerald-500 text-white font-bold rounded-xl py-3 text-lg active:scale-95 transition-all duration-200 disabled:opacity-50"
        >
          OK
        </button>
      </div>

      {/* PR celebration overlay */}
      {prFlash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-[fadeIn_0.2s_ease-out]">
          <div className="text-center animate-[scaleIn_0.3s_ease-out]">
            <p className="text-5xl font-black text-amber-400 mb-2">RECORD !</p>
            <p className="text-2xl text-white font-bold">{prFlash.weightKg} kg</p>
            <p className="text-zinc-400 mt-1">{exercise.exerciseName}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function SkipModal({ onSelect, onCancel }: { onSelect: (zone: BodyZone, result?: QuestionnaireResult) => void; onCancel: () => void }) {
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
      <div className="w-full bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 pb-8 max-h-[75vh] overflow-auto">
        {/* Handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        {selectedZone === null ? (
          <>
            <p className="text-white font-black text-lg mb-3">Ou as-tu eu mal ?</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {BODY_ZONES.map(({ zone, label }) => (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  className="bg-zinc-800 text-zinc-300 rounded-xl py-3 px-3 text-sm text-left active:scale-[0.98] transition-all duration-150"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onCancel}
              className="w-full py-4 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200"
            >
              Annuler
            </button>
          </>
        ) : (
          <SymptomQuestionnaire
            zone={selectedZone}
            onComplete={(result) => onSelect(selectedZone, result)}
            onCancel={() => setSelectedZone(null)}
          />
        )}
      </div>
    </div>
  )
}

function OccupiedOverlay({
  suggestions,
  onClose,
}: {
  suggestions: FillerSuggestion[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
      <div className="w-full bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 pb-8">
        {/* Handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <p className="text-white font-black text-lg mb-1">Machine occupee</p>
        <p className="text-zinc-400 text-sm mb-4">En attendant, essaie :</p>
        {suggestions.length > 0 ? (
          <div className="space-y-2 mb-4">
            {suggestions.slice(0, 3).map((s, i) => (
              <div key={i} className="bg-zinc-800 rounded-xl p-3">
                <p className="text-white text-sm font-medium">{s.name}</p>
                <p className="text-zinc-400 text-xs">
                  {s.sets}x{s.reps} — {s.duration}
                  {s.isRehab && <span className="text-emerald-400 ml-1">(rehab)</span>}
                </p>
                {s.notes && (
                  <p className="text-zinc-500 text-xs mt-1">{s.notes}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm mb-4">Pas de suggestion disponible. Etire-toi !</p>
        )}
        <button
          onClick={onClose}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200"
        >
          Machine libre
        </button>
      </div>
    </div>
  )
}

function formatRestLabel(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m${secs}s` : `${mins}min`
  }
  return `${seconds}s`
}
