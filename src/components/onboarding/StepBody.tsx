import type { useOnboarding } from '../../hooks/useOnboarding'

type Props = ReturnType<typeof useOnboarding>

export default function StepBody({ state, updateBody, nextStep }: Props) {
  const { body } = state

  const setField = <K extends keyof typeof body>(key: K, value: (typeof body)[K]) => {
    updateBody({ ...body, [key]: value })
  }

  const canProceed = body.name.trim().length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Ton profil</h2>
          <p className="text-zinc-400 text-sm">On commence par les bases.</p>
        </div>

        <div>
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Nom / Prenom</label>
          <input
            type="text"
            value={body.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="Ton nom"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 text-base"
          />
        </div>
      </div>

      <div className="flex-shrink-0 pt-4 pb-6">
        <button
          type="button"
          onClick={nextStep}
          disabled={!canProceed}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Suivant
        </button>
      </div>
    </div>
  )
}
