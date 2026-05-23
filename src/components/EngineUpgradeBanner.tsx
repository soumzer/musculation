interface Props {
  fromVersion: number | undefined
  toVersion: number
  onDismiss: () => void
}

export default function EngineUpgradeBanner({ fromVersion, toVersion, onDismiss }: Props) {
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-emerald-600/95 text-white px-4 py-3 shadow-lg backdrop-blur">
      <div className="max-w-2xl mx-auto flex items-start gap-3">
        <div className="flex-1">
          <p className="font-bold text-sm">Programme mis à jour</p>
          <p className="text-xs text-emerald-50 mt-0.5">
            Ton programme a été automatiquement régénéré suite à une amélioration du moteur
            {fromVersion !== undefined ? ` (v${fromVersion} → v${toVersion})` : ''}.
            La structure des séances a évolué.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-emerald-50 hover:text-white text-xl leading-none px-2 -mt-1"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
    </div>
  )
}
