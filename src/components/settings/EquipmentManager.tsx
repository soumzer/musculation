import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import EquipmentPicker from '../equipment/EquipmentPicker'
import { TAG_TYPES } from '../../data/equipment-options'
import type { ContextId } from '../../data/equipment-contexts'

interface Props {
  userId: number
  onRegenerate: () => Promise<{ success: boolean; error?: string }>
  isRegenerating: boolean
}

export default function EquipmentManager({ userId, onRegenerate, isRegenerating }: Props) {
  const equipment = useLiveQuery(
    () => db.gymEquipment.where('userId').equals(userId).toArray(),
    [userId],
  )

  // Editing an existing setup → open straight on the current selection,
  // shown as a free "Home Gym" checklist. "Changer" re-opens the presets.
  const [phase, setPhase] = useState<'context' | 'refine'>('refine')
  const [contextId, setContextId] = useState<ContextId | null>('home_gym')
  const [equipmentChanged, setEquipmentChanged] = useState(false)
  const [regenerateResult, setRegenerateResult] = useState<{ success: boolean; error?: string } | null>(null)

  if (equipment === undefined) return null

  const currentTags = equipment.map((e) => e.name)

  const handleChange = async (tags: string[]) => {
    // Replace the user's equipment set with the new tag list.
    const existing = await db.gymEquipment.where('userId').equals(userId).toArray()
    await db.gymEquipment.bulkDelete(
      existing.map((e) => e.id).filter((id): id is number => id !== undefined),
    )
    if (tags.length > 0) {
      await db.gymEquipment.bulkAdd(
        tags.map((tag) => ({
          userId,
          name: tag,
          type: TAG_TYPES[tag] ?? 'other',
          isAvailable: true,
          notes: '',
        })),
      )
    }
    setEquipmentChanged(true)
    setRegenerateResult(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-600 text-xs uppercase tracking-wider">Équipement</p>

      <EquipmentPicker
        phase={phase}
        setPhase={setPhase}
        contextId={contextId}
        setContextId={setContextId}
        selectedTags={currentTags}
        onChange={handleChange}
        tone="card"
      />

      {/* Regeneration banner */}
      {equipmentChanged && !regenerateResult?.success && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 space-y-2">
          <p className="text-sm text-white">
            Ton equipement a change. Veux-tu regenerer ton programme ?
          </p>
          {regenerateResult?.error && (
            <p className="text-sm text-red-400">{regenerateResult.error}</p>
          )}
          <button
            type="button"
            disabled={isRegenerating}
            onClick={async () => {
              setRegenerateResult(null)
              const result = await onRegenerate()
              setRegenerateResult(result)
              if (result.success) setEquipmentChanged(false)
            }}
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm active:scale-95 transition-all duration-200 disabled:opacity-50"
          >
            {isRegenerating ? 'Regeneration en cours...' : 'Regenerer le programme'}
          </button>
        </div>
      )}

      {/* Success feedback */}
      {regenerateResult?.success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-sm text-emerald-400">Programme regenere avec succes !</p>
        </div>
      )}
    </div>
  )
}
