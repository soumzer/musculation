import { useCallback, useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db } from '../db'
import type { ProgramExercise } from '../db/types'

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_DISABLED = 'w-full py-4 rounded-2xl font-bold text-lg bg-zinc-800 text-zinc-600 cursor-not-allowed'

export default function EditSessionOrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const programId = Number(searchParams.get('programId') ?? 0)
  const sessionIndex = Number(searchParams.get('sessionIndex') ?? 0)

  const data = useLiveQuery(async () => {
    if (!programId) return null
    const program = await db.workoutPrograms.get(programId)
    if (!program) return null
    const exercises = await db.exercises.toArray()
    const exoById = new Map(exercises.map(e => [e.id!, e]))
    return { program, exoById, allExercises: exercises }
  }, [programId])

  // Local ordered list — initialised from the program once it loads.
  const [order, setOrder] = useState<ProgramExercise[] | null>(null)
  const [saving, setSaving] = useState(false)
  /** Row currently open in the swap sheet (its id from `items`), or null. */
  const [swapOpenId, setSwapOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!data || order !== null) return
    const session = data.program.sessions[sessionIndex]
    if (!session) return
    setOrder(session.exercises)
  }, [data, sessionIndex, order])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // dnd-kit needs a stable id per item. Use exerciseId + position to dedup if
  // the same exo appears twice in the same session (shouldn't happen but
  // defensive).
  const items = useMemo(() => (order ?? []).map((e, i) => ({
    id: `${e.exerciseId}-${i}`,
    pe: e,
  })), [order])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !order) return
    const oldIdx = items.findIndex(i => i.id === active.id)
    const newIdx = items.findIndex(i => i.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    setOrder(arrayMove(order, oldIdx, newIdx))
  }, [items, order])

  const handleSwap = useCallback((rowIdx: number, newExerciseId: number) => {
    if (!order) return
    setOrder(order.map((e, i) => i === rowIdx ? { ...e, exerciseId: newExerciseId } : e))
    setSwapOpenId(null)
  }, [order])

  const handleSave = useCallback(async () => {
    if (!order || !data || saving) return
    setSaving(true)
    try {
      const updatedSessions = data.program.sessions.map((s, i) =>
        i === sessionIndex
          ? { ...s, exercises: order.map((e, idx) => ({ ...e, order: idx + 1 })) }
          : s,
      )
      await db.workoutPrograms.update(programId, { sessions: updatedSessions })
      navigate(-1)
    } finally {
      setSaving(false)
    }
  }, [data, order, programId, sessionIndex, navigate, saving])

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const session = data.program.sessions[sessionIndex]
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <p className="text-red-400 text-lg font-bold mb-3">Séance introuvable</p>
        <button onClick={() => navigate('/')} className="text-zinc-400 underline">Retour</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[var(--content-h)] bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-8 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-500 active:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Réorganiser</p>
          <h1 className="text-xl font-black text-white truncate">{session.name}</h1>
        </div>
      </div>

      <p className="px-5 text-zinc-500 text-xs mb-4">
        Maintiens un exercice et glisse-le pour le déplacer.
      </p>

      {/* Sortable list */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {order && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const exo = data.exoById.get(item.pe.exerciseId)
                  return (
                    <SortableRow
                      key={item.id}
                      id={item.id}
                      index={idx}
                      name={exo?.name ?? `Exercice #${item.pe.exerciseId}`}
                      sets={item.pe.sets}
                      reps={item.pe.targetReps}
                      isTimeBased={item.pe.isTimeBased}
                      onTapSwap={() => setSwapOpenId(item.id)}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Swap sheet */}
      {swapOpenId && (() => {
        const rowIdx = items.findIndex(i => i.id === swapOpenId)
        if (rowIdx < 0 || !order) return null
        const currentExo = data.exoById.get(order[rowIdx].exerciseId)
        if (!currentExo) return null
        const usedIds = new Set(order.map(e => e.exerciseId))
        const candidates = computeSwapCandidates(currentExo, data.allExercises, usedIds)
        return (
          <SwapSheet
            currentName={currentExo.name}
            candidates={candidates}
            onClose={() => setSwapOpenId(null)}
            onSelect={(id) => handleSwap(rowIdx, id)}
          />
        )
      })()}

      {/* Save */}
      <div className="flex-shrink-0 px-5 pb-6 pt-3 bg-zinc-950">
        <button
          onClick={handleSave}
          disabled={!order || saving}
          className={!order || saving ? CTA_DISABLED : CTA}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer l’ordre'}
        </button>
      </div>
    </div>
  )
}

function SortableRow({
  id,
  index,
  name,
  sets,
  reps,
  isTimeBased,
  onTapSwap,
}: {
  id: string
  index: number
  name: string
  sets: number
  reps: number
  isTimeBased?: boolean
  onTapSwap: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2 ${
        isDragging ? 'border-emerald-500/40' : ''
      }`}
    >
      {/* Tap area for swap — covers the left + center of the card */}
      <button
        type="button"
        onClick={onTapSwap}
        className="flex items-center gap-3 px-4 py-4 flex-1 min-w-0 text-left active:bg-zinc-800/50 rounded-l-2xl transition-colors"
      >
        <span className="text-zinc-600 text-xs font-bold tabular-nums w-5 flex-shrink-0">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{name}</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {sets} × {isTimeBased ? `${reps}s` : `${reps} reps`}
          </p>
        </div>
      </button>
      {/* Drag handle — only this area starts a drag */}
      <div
        {...listeners}
        className="px-4 py-4 touch-none flex-shrink-0 cursor-grab active:cursor-grabbing"
        aria-label="Glisser pour réordonner"
      >
        <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Swap candidates — mirrors SessionPage's swap logic: curated alternatives
// first, then auto-matched (same category + ≥1 shared primary muscle).
// ---------------------------------------------------------------------------

interface SwapCandidate { exerciseId: number; name: string }

function computeSwapCandidates(
  current: { id?: number; name: string; alternatives?: string[]; primaryMuscles: string[]; category: string },
  allExercises: { id?: number; name: string; isRehab: boolean; primaryMuscles: string[]; category: string }[],
  usedIds: Set<number>,
): SwapCandidate[] {
  const result: SwapCandidate[] = []
  const seen = new Set<number>()
  const canShow = (e: typeof allExercises[number]) => {
    if (e.id === undefined) return false
    if (e.id === current.id) return false
    if (e.isRehab) return false
    if (usedIds.has(e.id)) return false
    if (seen.has(e.id)) return false
    return true
  }
  // 1. Curated alternatives by name
  const byNameLower = new Map(
    allExercises.filter(e => e.id !== undefined).map(e => [e.name.toLowerCase(), e]),
  )
  for (const altName of current.alternatives ?? []) {
    const e = byNameLower.get(altName.toLowerCase())
    if (e && canShow(e)) {
      seen.add(e.id!)
      result.push({ exerciseId: e.id!, name: e.name })
    }
  }
  // 2. Auto-match — same category + shared primary muscle
  const currentMuscles = new Set(current.primaryMuscles.map(m => m.toLowerCase()))
  for (const e of allExercises) {
    if (!canShow(e)) continue
    if (e.category !== current.category) continue
    const shares = e.primaryMuscles.some(m => currentMuscles.has(m.toLowerCase()))
    if (!shares) continue
    seen.add(e.id!)
    result.push({ exerciseId: e.id!, name: e.name })
  }
  return result
}

// ---------------------------------------------------------------------------
// Swap bottom sheet
// ---------------------------------------------------------------------------

function SwapSheet({
  currentName,
  candidates,
  onClose,
  onSelect,
}: {
  currentName: string
  candidates: SwapCandidate[]
  onClose: () => void
  onSelect: (newExerciseId: number) => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <p className="text-white font-black text-lg mb-1">Remplacer l’exercice</p>
        <p className="text-zinc-400 text-sm mb-4 truncate">{currentName}</p>
        {candidates.length === 0 ? (
          <p className="text-zinc-500 text-sm py-4 text-center">
            Aucune alternative disponible.
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map(c => (
              <button
                key={c.exerciseId}
                onClick={() => onSelect(c.exerciseId)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3.5 text-left text-sm text-white font-medium active:scale-[0.98] transition-all"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 text-zinc-500 text-sm font-medium"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
