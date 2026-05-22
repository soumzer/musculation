import { useState } from 'react'
import type { useOnboarding } from '../../hooks/useOnboarding'
import type { BodyZone } from '../../db/types'
import { bodyZones } from '../../constants/body-zones'
import { getDiagnosesForZone } from '../../data/rehab-protocols'
import SymptomQuestionnaire, { type QuestionnaireResult } from './SymptomQuestionnaire'

type Props = ReturnType<typeof useOnboarding>

interface ConditionForm {
  bodyZone: BodyZone
  label: string
  diagnosis: string
  since: string
  notes: string
  editIndex?: number // Index of condition being edited (undefined = new)
}

const emptyForm = (zone: BodyZone, editIndex?: number): ConditionForm => ({
  bodyZone: zone,
  label: '',
  diagnosis: '',
  since: '',
  notes: '',
  editIndex,
})

export default function StepHealthConditions({ state, updateConditions, nextStep, prevStep }: Props) {
  const [expandedZone, setExpandedZone] = useState<BodyZone | null>(null)
  const [form, setForm] = useState<ConditionForm | null>(null)
  const [showQuestionnaire, setShowQuestionnaire] = useState<BodyZone | null>(null)

  const zonesWithConditions = new Set(state.conditions.map(c => c.bodyZone))

  // Clicking zone button opens form with dropdown
  const handleZoneTap = (zone: BodyZone) => {
    setExpandedZone(zone)
    setForm(emptyForm(zone))
  }

  // Start QCM for current zone
  const handleStartQCM = () => {
    if (expandedZone) {
      setShowQuestionnaire(expandedZone)
    }
  }

  // Clicking existing condition opens it for editing
  const handleEditCondition = (index: number) => {
    const existing = state.conditions[index]
    if (!existing) return
    setExpandedZone(existing.bodyZone)
    setForm({
      bodyZone: existing.bodyZone,
      label: existing.label,
      diagnosis: existing.diagnosis,
      since: existing.since,
      notes: existing.notes,
      editIndex: index,
    })
  }

  const handleQuestionnaireComplete = (result: QuestionnaireResult) => {
    // Pre-fill form with questionnaire result (new condition, no editIndex)
    setExpandedZone(result.zone)
    setForm({
      ...emptyForm(result.zone),
      label: result.conditionName,
      diagnosis: result.protocolConditionName,
    })
    setShowQuestionnaire(null)
  }

  const handleQuestionnaireCancel = () => {
    setShowQuestionnaire(null)
  }

  const handleSaveCondition = () => {
    if (!form) return
    // Auto-generate label from zone name if user left it empty
    const zoneName = bodyZones.find(z => z.zone === form.bodyZone)?.label ?? ''
    const label = form.label.trim() || `Douleur ${zoneName}`
    const { editIndex, ...conditionData } = form
    const newCondition = { ...conditionData, label, isActive: true }

    if (editIndex !== undefined) {
      // Update existing condition
      const updated = [...state.conditions]
      updated[editIndex] = newCondition
      updateConditions(updated)
    } else {
      // Add new condition
      updateConditions([...state.conditions, newCondition])
    }
    setExpandedZone(null)
    setForm(null)
  }

  const handleRemoveCondition = (index: number) => {
    updateConditions(state.conditions.filter((_, i) => i !== index))
    setExpandedZone(null)
    setForm(null)
  }

  const handleSkip = () => {
    updateConditions([])
    nextStep()
  }

  // Show questionnaire if active
  if (showQuestionnaire) {
    return (
      <SymptomQuestionnaire
        zone={showQuestionnaire}
        onComplete={handleQuestionnaireComplete}
        onCancel={handleQuestionnaireCancel}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Zones douloureuses</h2>
          <p className="text-sm text-zinc-400">
            Touche les zones ou tu as mal ou un probleme. Pas besoin de connaitre le nom medical.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {bodyZones.map(({ zone, label }) => (
            <button
              key={zone}
              type="button"
              onClick={() => handleZoneTap(zone)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium border active:scale-[0.98] transition-all duration-150 ${
                zonesWithConditions.has(zone)
                  ? 'bg-zinc-900 border-emerald-500/40 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              {label}
              {zonesWithConditions.has(zone) && (
                <span className="ml-1 text-xs text-emerald-400">
                  ({state.conditions.filter(c => c.bodyZone === zone).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {expandedZone && form && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-white">
              {bodyZones.find(z => z.zone === expandedZone)?.label}
            </h3>

            <div>
              <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">
                Qu'est-ce que tu as ?
              </label>
              <select
                value={form.diagnosis}
                onChange={e => {
                  const diagnosis = e.target.value
                  const label = diagnosis || `Douleur ${bodyZones.find(z => z.zone === form.bodyZone)?.label ?? ''}`
                  setForm({ ...form, diagnosis, label })
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-600"
              >
                <option value="">Je sais pas (rehab general)</option>
                {getDiagnosesForZone(form.bodyZone).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleStartQCM}
              className="w-full py-3 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 active:scale-[0.98] transition-all duration-150"
            >
              Faire le QCM pour trouver
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveCondition}
                className="flex-1 bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm active:scale-95 transition-all duration-200"
              >
                {form.editIndex !== undefined ? 'Modifier' : 'Ajouter'}
              </button>
              {form.editIndex !== undefined && (
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(form.editIndex!)}
                  className="px-4 py-3 rounded-xl text-sm font-semibold border border-red-900/50 text-red-400 bg-red-950/30 active:scale-95 transition-all duration-200"
                >
                  Supprimer
                </button>
              )}
              <button
                type="button"
                onClick={() => { setExpandedZone(null); setForm(null) }}
                className="px-4 py-3 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-300 active:scale-95 transition-all duration-200"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {state.conditions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm text-zinc-400">{state.conditions.length} condition{state.conditions.length > 1 ? 's' : ''} ajoutee{state.conditions.length > 1 ? 's' : ''}</h3>
            {state.conditions.map((c, index) => (
              <button
                key={`${c.bodyZone}-${index}`}
                type="button"
                onClick={() => handleEditCondition(index)}
                className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 active:scale-[0.98] transition-all duration-150"
              >
                <div className="text-left">
                  <span className="text-sm text-white">{c.label || bodyZones.find(z => z.zone === c.bodyZone)?.label}</span>
                  <span className="text-xs text-zinc-500 ml-2">({bodyZones.find(z => z.zone === c.bodyZone)?.label})</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 pt-2 pb-2 space-y-2">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={prevStep}
            className="flex-1 py-4 rounded-2xl font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 active:scale-95 transition-all duration-200"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={nextStep}
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200"
          >
            Suivant
          </button>
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="w-full text-center text-sm text-zinc-500 py-2"
        >
          Pas de probleme de sante
        </button>
      </div>
    </div>
  )
}
