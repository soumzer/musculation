import { useState, useCallback, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { NotebookEntry, NotebookSet, BodyZone } from '../db/types'
import type { QuestionnaireResult } from '../components/onboarding/SymptomQuestionnaire'
const MAX_HISTORY = 3

function normalizeForMatching(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export interface SkipResult {
  /** True if a new HealthCondition was created via QCM */
  conditionCreated: boolean
}

export interface SaveResult {
  /** True if a new weight PR was set */
  isWeightPR: boolean
  /** The new best weight, if PR */
  prWeightKg?: number
}

export interface UseNotebookReturn {
  currentSets: NotebookSet[]
  history: NotebookEntry[]
  lastWeight: number | null
  isSaving: boolean
  addSet: (weightKg: number, reps: number) => void
  updateSet: (index: number, weightKg: number, reps: number) => void
  removeLastSet: () => void
  saveAndNext: () => Promise<SaveResult>
  skipExercise: (zone: BodyZone, questionnaireResult?: QuestionnaireResult) => Promise<SkipResult>
}

export function useNotebook(
  userId: number,
  exerciseId: number,
  exerciseName: string,
  sessionIntensity: 'heavy' | 'volume' | 'moderate' | 'rehab',
  onSkip: (zone: BodyZone) => void,
  initialDraftSets?: NotebookSet[],
  onDraftSetsChange?: (exerciseId: number, sets: NotebookSet[]) => void,
): UseNotebookReturn {
  const [currentSets, setCurrentSets] = useState<NotebookSet[]>(initialDraftSets ?? [])
  const [isSaving, setIsSaving] = useState(false)
  const [todayEntryId, setTodayEntryId] = useState<number | null>(null)
  const [loadedEntry, setLoadedEntry] = useState(false)

  // Load the recent entries for this exercise filtered to the current session's
  // intensity (Force history when in a Force session, etc.). Wider Dexie window
  // first so we don't miss a same-intensity entry just because more recent
  // opposite-intensity entries got in the way.
  const history = useLiveQuery(
    async () => {
      const entries = await db.notebookEntries
        .where('[userId+exerciseId]')
        .equals([userId, exerciseId])
        .reverse()
        .limit(20)
        .toArray()
      return entries
        .filter(e => e.sessionIntensity === sessionIntensity)
        .filter(e => e.sets.length > 0)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, MAX_HISTORY)
    },
    [userId, exerciseId, sessionIntensity],
    [] as NotebookEntry[]
  )

  // Reset state when exercise changes (defensive — component usually unmounts)
  useEffect(() => {
    setTodayEntryId(null)
    setLoadedEntry(false)
    setCurrentSets(initialDraftSets ?? [])
  }, [exerciseId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load recent entry for editing (re-open completed exercise within 10h window)
  useEffect(() => {
    if (loadedEntry || history.length === 0) return
    const cutoff = new Date(Date.now() - 10 * 60 * 60 * 1000)
    const todayEntry = history.find(e => {
      const d = e.date instanceof Date ? e.date : new Date(e.date)
      return d >= cutoff && !e.skipped && e.sets.length > 0
    })
    if (todayEntry?.id) {
      setCurrentSets(todayEntry.sets)
      setTodayEntryId(todayEntry.id)
    }
    setLoadedEntry(true)
  }, [history, loadedEntry])

  // Last weight from history. history is already filtered to the current
  // session's intensity (see the useLiveQuery above), so we just walk the most
  // recent non-skipped entry with sets.
  const lastWeight = (() => {
    const recent = history.find(e => !e.skipped && e.sets.length > 0)
    return recent ? recent.sets[0].weightKg : null
  })()

  // Notify parent of draft sets changes for session persistence
  useEffect(() => {
    onDraftSetsChange?.(exerciseId, currentSets)
  }, [currentSets]) // eslint-disable-line react-hooks/exhaustive-deps

  const addSet = useCallback((weightKg: number, reps: number) => {
    setCurrentSets(prev => [...prev, { weightKg, reps }])
  }, [])

  const updateSet = useCallback((index: number, weightKg: number, reps: number) => {
    setCurrentSets(prev => prev.map((s, i) => i === index ? { weightKg, reps } : s))
  }, [])

  const removeLastSet = useCallback(() => {
    setCurrentSets(prev => prev.slice(0, -1))
  }, [])

  const saveAndNext = useCallback(async (): Promise<SaveResult> => {
    if (isSaving) return { isWeightPR: false }
    setIsSaving(true)
    try {
      const validSets = currentSets.filter(s => s.reps > 0)

      // Detect weight PR: compare best weight vs historical best for SAME intensity
      let isWeightPR = false
      let prWeightKg: number | undefined
      if (validSets.length > 0) {
        const currentBest = Math.max(...validSets.map(s => s.weightKg))
        if (currentBest > 0) {
          const allEntries = await db.notebookEntries
            .where('[userId+exerciseId]')
            .equals([userId, exerciseId])
            .toArray()
          // Exclude today's entry if we're updating it
          const pastEntries = todayEntryId
            ? allEntries.filter(e => e.id !== todayEntryId)
            : allEntries
          // Only compare against entries with the same intensity
          const historicalBest = pastEntries
            .filter(e => !e.skipped && e.sets.length > 0 && e.sessionIntensity === sessionIntensity)
            .reduce((max, e) => Math.max(max, ...e.sets.map(s => s.weightKg)), 0)
          if (historicalBest > 0 && currentBest > historicalBest) {
            isWeightPR = true
            prWeightKg = currentBest
          }
        }
      }

      if (todayEntryId) {
        // Update existing entry instead of creating a duplicate
        await db.notebookEntries.update(todayEntryId, {
          sets: validSets,
          date: new Date(),
        })
      } else {
        const entry: NotebookEntry = {
          userId,
          exerciseId,
          exerciseName,
          date: new Date(),
          sessionIntensity,
          sets: validSets,
          skipped: false,
        }
        await db.notebookEntries.add(entry)
      }

      // Bodyweight progression: +1 set when all sets hit 20+ reps (cap 5)
      if (validSets.length > 0 && validSets.every(s => s.reps >= 20)) {
        const activeProgram = await db.workoutPrograms
          .where('userId').equals(userId)
          .filter(p => p.isActive && p.name.includes('Poids de Corps'))
          .first()

        if (activeProgram?.id !== undefined) {
          const updatedSessions = activeProgram.sessions.map(s => ({
            ...s,
            exercises: s.exercises.map(e =>
              e.exerciseId === exerciseId && e.sets < 5
                ? { ...e, sets: e.sets + 1 }
                : e,
            ),
          }))
          await db.workoutPrograms.update(activeProgram.id, { sessions: updatedSessions })
        }
      }

      setCurrentSets([])
      return { isWeightPR, prWeightKg }
    } finally {
      setIsSaving(false)
    }
  }, [userId, exerciseId, exerciseName, sessionIntensity, currentSets, isSaving, todayEntryId])

  const skipExercise = useCallback(async (zone: BodyZone, questionnaireResult?: QuestionnaireResult): Promise<SkipResult> => {
    if (isSaving) return { conditionCreated: false }
    setIsSaving(true)
    try {
      // Save skipped entry (include any sets entered before skip)
      const validSets = currentSets.filter(s => s.reps > 0)
      if (todayEntryId) {
        await db.notebookEntries.update(todayEntryId, {
          sets: validSets,
          skipped: true,
          skipZone: zone,
          date: new Date(),
        })
      } else {
        const entry: NotebookEntry = {
          userId,
          exerciseId,
          exerciseName,
          date: new Date(),
          sessionIntensity,
          sets: validSets,
          skipped: true,
          skipZone: zone,
        }
        await db.notebookEntries.add(entry)
      }

      // Create pain report with 3-4 days of rehab accentuation
      await db.painReports.add({
        userId,
        zone,
        date: new Date(),
        fromExerciseName: exerciseName,
        accentDaysRemaining: 3,
      })

      // Create HealthCondition from QCM result if a diagnosis was identified
      let conditionCreated = false
      if (questionnaireResult?.protocolConditionName) {
        const normalizedDiagnosis = normalizeForMatching(questionnaireResult.protocolConditionName)
        const existingCondition = await db.healthConditions
          .where('userId').equals(userId)
          .filter(c =>
            c.isActive &&
            c.bodyZone === zone &&
            normalizeForMatching(c.diagnosis) === normalizedDiagnosis
          )
          .first()

        if (!existingCondition) {
          await db.healthConditions.add({
            userId,
            bodyZone: zone,
            label: questionnaireResult.conditionName,
            diagnosis: questionnaireResult.protocolConditionName,
            since: new Date().toISOString().split('T')[0],
            notes: `Créée via QCM au skip de ${exerciseName}`,
            isActive: true,
            createdAt: new Date(),
          })
          conditionCreated = true
        }
      }

      setCurrentSets([])
      onSkip(zone)
      return { conditionCreated }
    } finally {
      setIsSaving(false)
    }
  }, [userId, exerciseId, exerciseName, sessionIntensity, currentSets, isSaving, onSkip, todayEntryId])

  // Objet mémoïsé : les consommateurs l'utilisent comme dépendance de
  // useCallback/useEffect — sans ça, chaque render casse leur mémoïsation.
  return useMemo(() => ({
    currentSets,
    history,
    lastWeight,
    isSaving,
    addSet,
    updateSet,
    removeLastSet,
    saveAndNext,
    skipExercise,
  }), [currentSets, history, lastWeight, isSaving, addSet, updateSet, removeLastSet, saveAndNext, skipExercise])
}
