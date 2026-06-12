import { useState, useRef } from 'react'
import { useOnboarding } from '../hooks/useOnboarding'
import { importData } from '../utils/backup'
import StepBody from '../components/onboarding/StepBody'
import StepHealthConditions from '../components/onboarding/StepHealthConditions'
import StepGymEquipment from '../components/onboarding/StepGymEquipment'
import StepSchedule from '../components/onboarding/StepSchedule'

const CTA_BACK = 'flex-1 py-4 rounded-2xl font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 active:scale-95 transition-all duration-200'

const STEP_LABELS = ['Profil', 'Santé', 'Matériel', 'Planning', 'Prêt']

export default function OnboardingPage() {
  const onboarding = useOnboarding()
  const { state, totalSteps } = onboarding

  const steps: Record<number, React.ReactNode> = {
    1: <StepBody {...onboarding} />,
    2: <StepHealthConditions {...onboarding} />,
    3: <StepGymEquipment {...onboarding} />,
    4: <StepSchedule {...onboarding} />,
    5: <FinalStep {...onboarding} />,
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  async function handleRestore(file: File) {
    setRestoreError(null)
    setRestoring(true)
    try {
      const json = await file.text()
      await importData(json)
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Erreur lors de la restauration")
    } finally {
      setRestoring(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleRestore(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="h-[var(--app-h)] bg-zinc-950 text-white px-5 pt-10 flex flex-col overflow-hidden">
      {/* Step dots */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1
          const isDone = stepNum < state.step
          const isCurrent = stepNum === state.step
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                isDone ? 'bg-emerald-500' :
                isCurrent ? 'bg-white scale-125' :
                'bg-zinc-800 border border-zinc-700'
              }`} />
              <span className={`text-[9px] uppercase tracking-wider ${
                isCurrent ? 'text-white font-semibold' : 'text-zinc-600'
              }`}>
                {STEP_LABELS[i]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto overscroll-none">{steps[state.step]}</div>

      {/* Restore button — step 1 only */}
      {state.step === 1 && (
        <div className="flex-shrink-0 pt-2 pb-4 space-y-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="w-full py-3 rounded-2xl text-zinc-500 text-sm font-medium active:scale-95 transition-all duration-200 disabled:opacity-50"
          >
            {restoring ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                Restauration...
              </span>
            ) : (
              'Restaurer une sauvegarde'
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={onFileChange}
            className="hidden"
          />
          {restoreError && (
            <p className="text-sm text-red-400 text-center">{restoreError}</p>
          )}
        </div>
      )}
    </div>
  )
}

function FinalStep({ prevStep, submit }: ReturnType<typeof useOnboarding>) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await submit()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-3">Tout est pret !</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Ton programme sera genere automatiquement en fonction de tes reponses.
        </p>
      </div>

      <div className="flex-shrink-0 pb-6 space-y-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={prevStep}
            disabled={submitting}
            className={`${CTA_BACK} disabled:opacity-40`}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200 disabled:opacity-40`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generation...
              </span>
            ) : 'Terminer'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
