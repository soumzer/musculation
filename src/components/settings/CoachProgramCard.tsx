import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WorkoutProgram } from '../../db/types'
import { useCoachProgram } from '../../hooks/useCoachProgram'
import { coachPrograms, getCoachProgramDef, type CoachProgramId } from '../../data/coach-program'

interface Props {
  userId: number
  /** Programme actif de l'utilisateur (coach ou automatique). */
  activeProgram: WorkoutProgram | undefined
  /** Appelé après une désactivation qui n'a trouvé aucun programme automatique à restaurer. */
  onNeedsRegenerate: () => Promise<{ success: boolean; error?: string }>
}

const SECTION_LABEL = 'text-zinc-600 text-xs uppercase tracking-wider mb-3'
const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200 disabled:opacity-50'
const CTA_SECONDARY = 'w-full py-3.5 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200 disabled:opacity-50'

function formatDate(d: Date | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Carte Profil : choisir / mettre à jour / quitter un programme coach fixe.
 * Quand un programme coach est actif, le générateur automatique est
 * verrouillé (voir useRegenerateProgram) — cette carte est le seul chemin
 * pour en sortir.
 */
export default function CoachProgramCard({ userId, activeProgram, onNeedsRegenerate }: Props) {
  const navigate = useNavigate()
  const { activate, deactivate, isWorking } = useCoachProgram()
  const [error, setError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [switching, setSwitching] = useState(false)

  const isCoachActive = activeProgram?.isCoach === true
  const activeDef = isCoachActive ? getCoachProgramDef(activeProgram?.coachId) : null
  const isOutdated = activeDef !== null && (activeProgram?.coachVersion ?? 0) < activeDef.version

  const handleActivate = async (coachId: CoachProgramId) => {
    setError(null)
    const result = await activate(userId, coachId)
    if (!result.success) setError(result.error ?? 'Erreur inconnue.')
    else setSwitching(false)
  }

  const handleDeactivate = async () => {
    setError(null)
    const result = await deactivate(userId)
    if (!result.success) { setError(result.error ?? 'Erreur inconnue.'); return }
    setConfirmOff(false)
    if (!result.restored) {
      const regen = await onNeedsRegenerate()
      if (!regen.success) setError(regen.error ?? 'Erreur inconnue.')
    }
  }

  const chooser = (
    <div className="space-y-2">
      {coachPrograms
        .filter((p) => !activeDef || p.id !== activeDef.id)
        .map((p) => (
          <button
            key={p.id}
            onClick={() => handleActivate(p.id)}
            disabled={isWorking}
            className="w-full text-left bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <p className="text-white font-bold">{p.owner}</p>
              <span className="text-emerald-400 text-xs font-bold">{p.sessions.length} séances</span>
            </div>
            <p className="text-zinc-400 text-xs mt-1">{p.summary}</p>
          </button>
        ))}
    </div>
  )

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <p className={SECTION_LABEL}>Programme coach</p>

      {activeDef ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-semibold">{activeDef.owner} · actif</p>
              <p className="text-zinc-600 text-xs">
                depuis le {formatDate(activeProgram?.startedAt)}
              </p>
            </div>
            <span className="text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              {activeDef.sessions.length} séances
            </span>
          </div>

          <ul className="space-y-1">
            {activeDef.sessions.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">
                  <span className="text-zinc-600 mr-2">J{i + 1}</span>{s.name}
                </span>
                <span className="text-zinc-600 text-xs">{s.durationMin} min</span>
              </li>
            ))}
          </ul>

          <p className="text-zinc-500 text-xs">
            Tant qu'il est actif, l'équipement et les jours par semaine ne régénèrent rien.
          </p>

          {isOutdated && (
            <button onClick={() => handleActivate(activeDef.id)} disabled={isWorking} className={CTA}>
              {isWorking ? 'Mise à jour…' : 'Mettre à jour le programme'}
            </button>
          )}

          <button onClick={() => navigate('/coach-rules')} className={CTA_SECONDARY}>
            Règles du programme
          </button>

          {switching ? (
            <div className="space-y-2">
              <p className="text-zinc-400 text-sm">Passer à quel programme ? Le compteur de semaines repart de zéro.</p>
              {chooser}
              <button onClick={() => setSwitching(false)} disabled={isWorking} className={CTA_SECONDARY}>
                Annuler
              </button>
            </div>
          ) : confirmOff ? (
            <div className="space-y-2">
              <p className="text-zinc-400 text-sm">
                Revenir au programme automatique ? Ton historique est conservé.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmOff(false)} disabled={isWorking} className={CTA_SECONDARY}>
                  Annuler
                </button>
                <button onClick={handleDeactivate} disabled={isWorking} className={CTA_SECONDARY + ' !text-red-400 !border-red-900/50'}>
                  {isWorking ? '…' : 'Confirmer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setSwitching(true)} disabled={isWorking} className={CTA_SECONDARY}>
                Changer de programme
              </button>
              <button onClick={() => setConfirmOff(true)} disabled={isWorking} className={CTA_SECONDARY}>
                Programme auto
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-zinc-400 text-sm">
            Programme fixe écrit par un coach. Il remplace le programme automatique — que tu retrouves en le désactivant.
          </p>
          {chooser}
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
