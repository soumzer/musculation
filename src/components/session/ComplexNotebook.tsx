import { useCallback, useEffect, useState } from 'react'
import { useNotebook } from '../../hooks/useNotebook'
import { useRestTimer } from '../../hooks/useRestTimer'
import { SkipModal } from './ExerciseNotebook'
import type { QuestionnaireResult } from '../onboarding/SymptomQuestionnaire'
import type { BodyZone, NotebookSet } from '../../db/types'
import { formatRestLabel } from '../../utils/format-prescription'

/**
 * Écran d'un complexe enchaîné en continu (Iron Cardio du programme kettlebell).
 *
 * Rien à voir avec des séries : un chrono tourne pendant toute la durée du
 * palier et l'utilisateur tape « +1 tour » à chaque tour terminé, en alternant
 * le bras. Ce qui est enregistré, c'est **la charge et le nombre de tours** —
 * le tour est l'indicateur de progression du programme.
 *
 * Stockage : une seule « série » `{ weightKg: charge, reps: tours }`, pour
 * rester sur le carnet existant sans migration de la base.
 */
export interface ComplexNotebookProps {
  exercise: {
    exerciseId: number
    exerciseName: string
    instructions: string
  }
  target: {
    /** Durée du palier, en secondes. */
    durationSeconds: number
    restSeconds: number
    intensity: 'heavy' | 'volume' | 'moderate' | 'rehab'
    /** Consigne courte du coach. */
    cue?: string
    /** Palier courant : « 14 kg — 18 min ». */
    ladderLabel?: string
    /** Charge imposée par le palier — pré-remplie dans le champ. */
    ladderWeightKg?: number
  }
  exerciseIndex: number
  totalExercises: number
  userId: number
  initialDraftSets?: NotebookSet[]
  /** Chrono en cours au moment où l'app a été rechargée. */
  initialChronoEndTime?: number | null
  onDraftSetsChange?: (exerciseId: number, sets: NotebookSet[]) => void
  onChronoChange?: (endTime: number | null) => void
  onNext: () => void
  onSkip: (zone: BodyZone) => void
}

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-4'
const SECTION_LABEL = 'text-zinc-600 text-xs uppercase tracking-wider'

/** Petite vibration de confirmation (Android ; iOS l'ignore). */
function tapFeedback() {
  try { navigator.vibrate?.(10) } catch { /* ignore */ }
}

/** Le tour 1 se fait à gauche, le 2 à droite, etc. */
function sideOfRound(round: number): 'Gauche' | 'Droite' {
  return round % 2 === 1 ? 'Gauche' : 'Droite'
}

export default function ComplexNotebook({
  exercise,
  target,
  exerciseIndex,
  totalExercises,
  userId,
  initialDraftSets,
  initialChronoEndTime,
  onDraftSetsChange,
  onChronoChange,
  onNext,
  onSkip,
}: ComplexNotebookProps) {
  const notebook = useNotebook(
    userId,
    exercise.exerciseId,
    exercise.exerciseName,
    target.intensity,
    onSkip,
    initialDraftSets,
    onDraftSetsChange,
  )

  // Le chrono tourne sur l'horloge réelle : il reprend où il en était après un
  // passage en arrière-plan ou un rechargement en pleine séance.
  const chrono = useRestTimer(target.durationSeconds, initialChronoEndTime)

  useEffect(() => {
    onChronoChange?.(chrono.endTime)
  }, [chrono.endTime]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showSkipModal, setShowSkipModal] = useState(false)
  const [showDescription, setShowDescription] = useState(false)

  // Source de vérité unique : l'unique « série » du carnet. Elle est aussi ce
  // que la persistance de séance sauvegarde, donc un rechargement en pleine
  // séance ne perd ni la charge ni les tours.
  const entry = notebook.currentSets[0]
  const rounds = entry?.reps ?? 0

  // L'historique arrive de façon asynchrone : la charge affichée est dérivée,
  // pas figée au premier rendu, sinon le pré-remplissage ne se voit jamais.
  // `typed` (non nul) = l'utilisateur a touché le champ, il garde la main.
  const [typed, setTyped] = useState<string | null>(null)
  const weightInput = typed ?? (entry?.weightKg
    ? String(entry.weightKg)
    // Le palier fait foi : juste après être monté, c'est SA charge qu'on veut,
    // pas celle de la séance précédente.
    : target.ladderWeightKg !== undefined ? String(target.ladderWeightKg)
    : notebook.lastWeight ? String(notebook.lastWeight) : '')
  const weightKg = Math.max(0, parseFloat(weightInput) || 0)

  const write = useCallback((w: number, r: number) => {
    if (notebook.currentSets.length === 0) notebook.addSet(w, r)
    else notebook.updateSet(0, w, r)
  }, [notebook])

  const handleWeightChange = useCallback((value: string) => {
    setTyped(value)
    const w = parseFloat(value)
    write(isNaN(w) || w < 0 ? 0 : w, rounds)
  }, [write, rounds])

  const addRound = useCallback(() => {
    write(weightKg, rounds + 1)
    tapFeedback()
  }, [write, weightKg, rounds])

  const removeRound = useCallback(() => {
    if (rounds <= 0) return
    write(weightKg, rounds - 1)
  }, [write, weightKg, rounds])

  const handleSave = useCallback(async () => {
    await notebook.saveAndNext()
    onNext()
  }, [notebook, onNext])

  /** « Suivant » : on n'écrase jamais ce qui a déjà été saisi. */
  const handlePass = useCallback(async () => {
    if (rounds > 0) await notebook.saveAndNext()
    onNext()
  }, [notebook, rounds, onNext])

  const handleSkip = useCallback(async (zone: BodyZone, result?: QuestionnaireResult) => {
    setShowSkipModal(false)
    await notebook.skipExercise(zone, result)
  }, [notebook])

  const minutes = Math.round(target.durationSeconds / 60)
  const history = notebook.history.filter(e => !e.skipped && e.sets.length > 0).slice(0, 3)

  return (
    <div className="flex flex-col h-[var(--content-h)]">
      {showSkipModal && (
        <SkipModal onSelect={handleSkip} onCancel={() => setShowSkipModal(false)} />
      )}

      <div className="flex-1 overflow-auto px-4 pt-3 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={handlePass} className="text-zinc-500 text-sm active:text-zinc-300 transition-colors py-2 pr-3">
            Suivant ›
          </button>
          <span className="text-zinc-600 text-sm tabular-nums">{exerciseIndex + 1}/{totalExercises}</span>
        </div>

        <div className="mb-3">
          <h1 className="text-xl font-black text-white">{exercise.exerciseName}</h1>
          <p className="text-zinc-400 text-sm mt-1.5">
            {minutes} min au chrono — repos {formatRestLabel(target.restSeconds)}
          </p>
          {target.ladderLabel && (
            <p className="text-emerald-400 text-xs mt-1.5 font-semibold">Palier : {target.ladderLabel}</p>
          )}
          {target.cue && <p className="text-amber-400/90 text-xs mt-1.5">{target.cue}</p>}
          <button
            onClick={() => setShowDescription(v => !v)}
            className="text-zinc-500 text-sm underline mt-2 active:text-emerald-400 transition-colors"
          >
            {showDescription ? 'Masquer' : 'Voir description'}
          </button>
          {showDescription && (
            <p className="text-zinc-400 text-sm mt-2 leading-relaxed">{exercise.instructions}</p>
          )}
        </div>

        {/* Charge */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-2`}>Kettlebell</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={weightInput}
              onChange={e => handleWeightChange(e.target.value)}
              placeholder="kg"
              className="w-24 bg-zinc-800 text-white text-center rounded-xl px-2 py-2.5 text-lg font-bold outline-none placeholder-zinc-600"
            />
            <span className="text-zinc-500 text-sm">kg</span>
          </div>
        </div>

        {/* Chrono */}
        <div className={`${CARD} mb-3`}>
          <p className={`${SECTION_LABEL} mb-2`}>Chrono</p>
          <div className="flex items-center gap-3">
            <span className={`text-4xl font-black tabular-nums ${
              chrono.remaining === 0 ? 'text-emerald-400' : 'text-white'
            }`}>
              {chrono.formatTime()}
            </span>
            <button
              onClick={chrono.isRunning ? chrono.pause : chrono.start}
              className={`ml-auto rounded-xl px-5 py-2.5 font-bold active:scale-95 transition-all duration-200 ${
                chrono.isRunning ? 'bg-zinc-800 text-zinc-300' : 'bg-emerald-500 text-white'
              }`}
            >
              {chrono.isRunning ? 'Pause' : 'Démarrer'}
            </button>
            <button
              onClick={chrono.reset}
              className="bg-zinc-800 text-zinc-400 rounded-xl px-4 py-2.5 text-sm active:scale-95 transition-all duration-200"
            >
              Reset
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            Pose la kettlebell si besoin — le chrono continue.
          </p>
        </div>

        {/* Tours */}
        <div className={`${CARD} mb-3`}>
          <div className="flex items-center justify-between mb-3">
            <p className={SECTION_LABEL}>Tours</p>
            <span className="text-zinc-500 text-xs">
              Prochain tour : <span className="text-white font-bold">{sideOfRound(rounds + 1)}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-5xl font-black text-white tabular-nums w-20">{rounds}</span>
            <button
              onClick={addRound}
              className="flex-1 bg-emerald-500 text-white font-black rounded-2xl py-5 text-xl active:scale-95 transition-all duration-200"
            >
              +1 tour
            </button>
            <button
              onClick={removeRound}
              disabled={rounds === 0}
              className="bg-zinc-800 text-zinc-400 rounded-xl px-4 py-5 text-lg active:scale-95 transition-all duration-200 disabled:opacity-30"
            >
              −1
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            1 tour = 1 clean + 1 press + 1 squat. Tu changes de bras à chaque tour.
          </p>
        </div>

        {/* Historique */}
        {history.length > 0 && (
          <div className={CARD}>
            <p className={`${SECTION_LABEL} mb-2`}>Dernières fois</p>
            <div className="space-y-1.5">
              {history.map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    {new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className="text-zinc-300">
                    {e.sets[0].weightKg > 0 ? `${e.sets[0].weightKg} kg · ` : ''}
                    <span className="text-white font-semibold">{e.sets[0].reps} tours</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barre du bas */}
      <div className="fixed bottom-[var(--nav-h)] left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 py-3 flex gap-3">
        <button
          onClick={() => setShowSkipModal(true)}
          className="bg-zinc-800 text-zinc-300 rounded-xl py-3 px-4 text-sm flex-shrink-0 active:scale-95 transition-all duration-200"
        >
          / Skip
        </button>
        <button
          onClick={handleSave}
          disabled={notebook.isSaving}
          className="flex-1 bg-emerald-500 text-white font-bold rounded-xl py-3 text-lg active:scale-95 transition-all duration-200 disabled:opacity-50"
        >
          OK
        </button>
      </div>
    </div>
  )
}
