import type { useOnboarding } from '../../hooks/useOnboarding'

type Props = ReturnType<typeof useOnboarding>

const daysOptions = [2, 3, 4, 5, 6]

const SPLIT_HINT: Record<number, string> = {
  2: 'Full Body',
  3: 'Full Body',
  4: 'Upper / Lower',
  5: 'Push / Pull / Legs',
  6: 'Push / Pull / Legs',
}

export default function StepSchedule({ state, updateSchedule, nextStep, prevStep }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Planning</h2>
          <p className="text-zinc-400 text-sm">Combien de jours tu peux t'entrainer ?</p>
        </div>

        <div>
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-3">
            Jours par semaine
          </label>
          <div className="flex gap-2">
            {daysOptions.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => updateSchedule(d, 75)}
                className={`flex-1 py-4 rounded-2xl text-center font-bold text-lg active:scale-95 transition-all duration-200 ${
                  state.daysPerWeek === d
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Split hint */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Programme</p>
          <p className="text-white font-semibold">{SPLIT_HINT[state.daysPerWeek] ?? 'Full Body'}</p>
          <p className="text-zinc-400 text-xs mt-1">Seances de ~75 min</p>
        </div>
      </div>

      <div className="flex-shrink-0 pt-4 pb-6">
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
      </div>
    </div>
  )
}
