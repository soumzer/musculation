import { useState } from 'react'
import type { useOnboarding } from '../../hooks/useOnboarding'
import EquipmentPicker from '../equipment/EquipmentPicker'
import { TAG_TYPES } from '../../data/equipment-options'
import type { ContextId } from '../../data/equipment-contexts'

type Props = ReturnType<typeof useOnboarding>

export default function StepGymEquipment({ state, updateEquipment, nextStep, prevStep }: Props) {
  const currentTags = state.equipment.map((e) => e.name)
  const [phase, setPhase] = useState<'context' | 'refine'>(
    currentTags.length > 0 ? 'refine' : 'context',
  )
  const [contextId, setContextId] = useState<ContextId | null>(
    currentTags.length > 0 ? 'home_gym' : null,
  )

  const handleChange = (tags: string[]) => {
    updateEquipment(
      tags.map((tag) => ({
        name: tag,
        type: TAG_TYPES[tag] ?? 'other',
        isAvailable: true,
        notes: '',
      })),
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-5 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Équipement</h2>
          <p className="text-zinc-400 text-sm">
            {phase === 'context'
              ? "Choisis ton contexte d'entraînement."
              : 'Coche le materiel dont tu disposes.'}
          </p>
        </div>

        <EquipmentPicker
          phase={phase}
          setPhase={setPhase}
          contextId={contextId}
          setContextId={setContextId}
          selectedTags={currentTags}
          onChange={handleChange}
        />
      </div>

      <div className="flex gap-3 pt-4 pb-6 flex-shrink-0">
        <button
          type="button"
          onClick={() => (phase === 'refine' ? setPhase('context') : prevStep())}
          className="flex-1 py-4 rounded-2xl font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 active:scale-95 transition-all duration-200"
        >
          Retour
        </button>
        {phase === 'refine' && (
          <button
            type="button"
            onClick={nextStep}
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200"
          >
            Suivant
          </button>
        )}
      </div>
    </div>
  )
}
