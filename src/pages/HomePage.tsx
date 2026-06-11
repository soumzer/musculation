import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useNextSession } from '../hooks/useNextSession'
import { useActiveSession } from '../hooks/useActiveSession'
import { daysSinceLastBackup } from '../utils/backup'
import type { NotebookEntry } from '../db/types'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const INTENSITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  heavy:    { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Force' },
  volume:   { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Volume' },
  moderate: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Modere' },
}

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_SECONDARY = 'w-full py-4 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HomePage() {
  const user = useLiveQuery(() => db.userProfiles.toCollection().first())
  const info = useNextSession(user?.id)
  const activeSession = useActiveSession()
  const navigate = useNavigate()

  // Active session exercise names (must be before early returns — Rules of Hooks)
  const activeExerciseNames = useLiveQuery(async () => {
    if (!activeSession) return null
    const ids = activeSession.exerciseStatuses.map(s => s.exerciseId)
    const exercises = await db.exercises.where('id').anyOf(ids).toArray()
    const nameMap = new Map(exercises.map(e => [e.id!, e.name]))
    return activeSession.exerciseStatuses.map(s => ({
      name: nameMap.get(s.exerciseId) ?? `Exercice #${s.exerciseId}`,
      status: s.status,
    }))
  }, [activeSession])

  // Last perf per exercise for the preview card — filtered by the upcoming
  // session's intensity so a Force preview shows last-Force perfs (not the
  // last Volume perfs which would mislead set/rep expectations). Matching is
  // done by exerciseId (stable across renames) — previously matched by name
  // and lost history whenever an exercise got renamed (e.g. Développé couché
  // machine → Chest press).
  const lastPerfs = useLiveQuery(async () => {
    if (!user?.id || !info?.preview) return null
    const ids = new Set(info.preview.exercises.map(e => e.exerciseId).filter(id => id > 0))
    if (ids.size === 0) return new Map<number, NotebookEntry>()
    const previewIntensity = info.preview.intensity
    const entries = await db.notebookEntries
      .where('userId').equals(user.id)
      .filter(e =>
        !e.skipped
        && e.sets.length > 0
        && ids.has(e.exerciseId)
        && (previewIntensity === undefined || e.sessionIntensity === previewIntensity),
      )
      .toArray()
    // Most recent per exercise id
    const map = new Map<number, NotebookEntry>()
    for (const e of entries) {
      const existing = map.get(e.exerciseId)
      const d = e.date instanceof Date ? e.date : new Date(e.date)
      if (!existing || d > (existing.date instanceof Date ? existing.date : new Date(existing.date))) {
        map.set(e.exerciseId, e)
      }
    }
    return map
  }, [user?.id, info?.preview])

  // --- Loading ---
  if (!user || info === undefined) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // --- No program ---
  if (info.status === 'no_program') {
    return (
      <div className="flex flex-col items-center justify-center h-[var(--content-h)] px-6 text-center">
        <p className="text-3xl font-black text-white mb-2">Aucun programme</p>
        <p className="text-zinc-400 mb-8">Configure ton profil pour commencer.</p>
        <button onClick={() => navigate('/profile')} className={CTA}>
          Aller au profil
        </button>
      </div>
    )
  }

  // --- Editing window ---
  if (info.status === 'editing_window') {
    return (
      <div className="flex flex-col h-[var(--content-h)] px-5 pt-8">
        <div className="flex-1">
          <p className="text-zinc-400 text-sm mb-1">Seance terminee</p>
          <p className="text-3xl font-black text-white mb-3">{info.lastSessionName}</p>
        </div>
        <div className="flex-shrink-0 pb-6 flex flex-col gap-3">
          <button
            onClick={() => navigate(`/session?programId=${info.programId}&sessionIndex=${info.nextSessionIndex}`)}
            className={CTA}
          >
            {info.nextSessionName ?? 'Seance suivante'}
          </button>
          <button
            onClick={() => navigate(`/session?programId=${info.programId}&sessionIndex=${info.lastSessionIndex}`)}
            className={CTA_SECONDARY}
          >
            Modifier la seance
          </button>
        </div>
      </div>
    )
  }

  // --- Rehab day ---
  if (info.status === 'rehab_day') {
    return <RehabDayCard
      activeZones={info.activeZones ?? []}
      nextSessionName={info.nextSessionName ?? ''}
      userId={user.id!}
    />
  }

  // --- Active session (resume) ---
  if (activeSession) {
    const doneCount = activeSession.exerciseStatuses.filter(s => s.status !== 'pending').length
    const totalCount = activeSession.exerciseStatuses.length
    const sessionName = info.status === 'ready' ? info.nextSessionName : info.lastSessionName ?? 'Seance'

    return (
      <div className="flex flex-col h-[var(--content-h)] px-5 pt-8">
        <div className="flex-1 overflow-y-auto">
          <p className="text-zinc-400 text-sm mb-1">Seance en cours</p>
          <p className="text-3xl font-black text-white mb-1">{sessionName}</p>
          <p className="text-zinc-600 text-sm mb-5">{doneCount}/{totalCount} exercices</p>

          {activeExerciseNames && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
              {activeExerciseNames.map((ex, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    ex.status === 'done' ? 'bg-emerald-500 text-white' :
                    ex.status === 'skipped' ? 'bg-red-500/20 text-red-400' :
                    'border border-zinc-700 text-zinc-700'
                  }`}>
                    {ex.status === 'done' ? '\u2713' : ex.status === 'skipped' ? '/' : ''}
                  </div>
                  <span className={`text-sm ${ex.status === 'pending' ? 'text-white' : 'text-zinc-500'}`}>
                    {ex.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 pb-6">
          <button
            onClick={() => navigate(`/session?programId=${activeSession.programId}&sessionIndex=${activeSession.sessionIndex}`)}
            className={CTA}
          >
            Reprendre la seance
          </button>
        </div>
      </div>
    )
  }

  // --- Ready — main screen ---
  const programName = info.program?.name ?? 'Programme'
  const sessions = info.program?.sessions ?? []
  const intensity = info.nextSession?.intensity
  const style = intensity ? INTENSITY_STYLE[intensity] : null

  // Determine which sessions are completed (for week dots)
  // We use the preview session index to know where we are in the cycle

  return (
    <div className="flex flex-col h-[var(--content-h)] px-5 pt-8">
      <div className="flex-1 overflow-y-auto pb-4">

        {/* Header */}
        <p className="text-zinc-400 text-sm mb-1">{programName}</p>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-white">{info.nextSessionName}</h1>
          {style && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          )}
        </div>

        {info.deloadReminder && (
          <p className="text-amber-400 text-xs mt-1 mb-3">{info.deloadReminder}</p>
        )}

        <p className="text-zinc-600 text-sm mb-5">~ {info.estimatedMinutes} min</p>

        <BackupReminder userId={user.id!} />

        {/* Week dots */}
        {sessions.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-3">Cette semaine</p>
            <div className="flex justify-around">
              {sessions.map((s, idx) => {
                const isCurrent = idx === info.nextSessionIndex
                const isDone = idx < (info.nextSessionIndex ?? 0)
                const sessionIntensity = s.intensity
                const dotStyle = sessionIntensity ? INTENSITY_STYLE[sessionIntensity] : null
                return (
                  <button
                    key={idx}
                    onClick={() => navigate(`/edit-order?programId=${info.programId}&sessionIndex=${idx}`)}
                    className="flex flex-col items-center gap-1.5 active:scale-90 transition-all duration-150"
                  >
                    <div className={`w-4 h-4 rounded-full transition-all ${
                      isDone ? 'bg-emerald-500' :
                      isCurrent ? 'border-2 border-emerald-500 bg-transparent' :
                      'bg-zinc-800 border border-zinc-700'
                    }`} />
                    <span className={`text-[10px] leading-tight text-center max-w-[56px] ${
                      isCurrent ? 'text-white font-semibold' : 'text-zinc-600'
                    }`}>
                      {s.name.replace(/ — .*/, '')}
                    </span>
                    {dotStyle && (
                      <span className={`text-[9px] font-bold ${dotStyle.text}`}>
                        {dotStyle.label[0]}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Exercise preview with last perfs */}
        {info.preview && info.preview.exercises.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-600 text-xs uppercase tracking-wider">Au programme</p>
              <button
                onClick={() => navigate(`/edit-order?programId=${info.programId}&sessionIndex=${info.nextSessionIndex}`)}
                className="text-zinc-500 text-xs active:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Réorganiser
              </button>
            </div>
            <div className="space-y-3">
              {info.preview.exercises.map((ex, idx) => {
                const perf = lastPerfs?.get(ex.exerciseId)
                const bestSet = perf?.sets.reduce((best, s) => s.weightKg > best.weightKg ? s : best, perf.sets[0])
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{ex.name}</p>
                      <p className="text-zinc-600 text-xs">
                        {ex.sets} x {ex.isTimeBased ? `${ex.targetReps}s` : ex.targetReps}
                      </p>
                    </div>
                    {bestSet && bestSet.weightKg > 0 ? (
                      <span className="text-zinc-400 text-sm flex-shrink-0 ml-3">
                        {bestSet.weightKg}kg x {bestSet.reps}
                      </span>
                    ) : (
                      <span className="text-zinc-700 text-xs flex-shrink-0 ml-3">--</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* CTA — always visible */}
      <div className="flex-shrink-0 pb-6">
        <button
          onClick={() => navigate(`/session?programId=${info.programId}&sessionIndex=${info.nextSessionIndex}`)}
          className={CTA}
        >
          Commencer la seance
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Backup reminder — visible quand les données ne sont plus protégées
// ---------------------------------------------------------------------------

function BackupReminder({ userId }: { userId: number }) {
  const navigate = useNavigate()
  // Lu une fois au montage — la page est remontée à chaque navigation, et la
  // valeur exacte au jour près n'a pas d'importance pour un rappel.
  const [daysSince] = useState<number | null>(() => daysSinceLastBackup())
  const entryCount = useLiveQuery(
    () => db.notebookEntries.where('userId').equals(userId).count(),
    [userId]
  )

  // Pas de rappel tant qu'il n'y a presque rien à perdre, ni si backup récent.
  const overdue = daysSince === null || daysSince > 30
  if (entryCount === undefined || entryCount < 5 || !overdue) return null

  return (
    <button
      onClick={() => navigate('/profile')}
      className="w-full bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 mb-4 text-left active:scale-[0.98] transition-all duration-150"
    >
      <p className="text-amber-400 text-sm font-semibold">
        {daysSince === null
          ? 'Tes données ne sont pas sauvegardées'
          : `Dernière sauvegarde il y a ${daysSince} jours`}
      </p>
      <p className="text-zinc-500 text-xs mt-0.5">
        Tout vit sur ce téléphone — exporte un backup depuis le Profil →
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Rehab Day Card
// ---------------------------------------------------------------------------

const ZONE_LABELS: Record<string, string> = {
  neck: 'Cou', shoulder_left: 'Epaule G', shoulder_right: 'Epaule D',
  elbow_left: 'Coude G', elbow_right: 'Coude D',
  wrist_left: 'Poignet G', wrist_right: 'Poignet D',
  upper_back: 'Haut du dos', lower_back: 'Bas du dos',
  hip_left: 'Hanche G', hip_right: 'Hanche D',
  knee_left: 'Genou G', knee_right: 'Genou D',
  ankle_left: 'Cheville G', ankle_right: 'Cheville D',
  foot_left: 'Pied G', foot_right: 'Pied D',
}

function RehabDayCard({ activeZones, nextSessionName, userId }: {
  activeZones: string[]
  nextSessionName: string
  userId: number
}) {
  const navigate = useNavigate()
  const [cardioText, setCardioText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSkip = useCallback(async () => {
    setSaving(true)
    try {
      await db.notebookEntries.add({
        userId,
        exerciseId: 0,
        exerciseName: 'Rehab (skipped)',
        date: new Date(),
        sessionIntensity: 'rehab',
        sets: [],
        skipped: true,
      })
      if (cardioText.trim()) {
        await db.notebookEntries.add({
          userId,
          exerciseId: 0,
          exerciseName: 'Cardio',
          date: new Date(),
          sessionIntensity: 'rehab',
          sets: [{ weightKg: 0, reps: 1 }],
          skipped: false,
        })
      }
    } finally {
      setSaving(false)
    }
  }, [userId, cardioText])

  const handleGoRehab = useCallback(async () => {
    if (cardioText.trim()) {
      await db.notebookEntries.add({
        userId,
        exerciseId: 0,
        exerciseName: 'Cardio',
        date: new Date(),
        sessionIntensity: 'rehab',
        sets: [{ weightKg: 0, reps: 1 }],
        skipped: false,
      })
    }
    navigate('/rehab')
  }, [userId, cardioText, navigate])

  return (
    <div className="flex flex-col h-[var(--content-h)] px-5 pt-8">
      <div className="flex-1 overflow-y-auto">
        <p className="text-zinc-400 text-sm mb-1">Jour de repos</p>
        <p className="text-3xl font-black text-white mb-5">Rehab & recuperation</p>

        {/* Active zones */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-3">Zones actives</p>
          <div className="flex flex-wrap gap-2">
            {activeZones.map(zone => (
              <span key={zone} className="text-sm px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {ZONE_LABELS[zone] ?? zone}
              </span>
            ))}
          </div>
        </div>

        <p className="text-zinc-600 text-sm mb-4">
          Prochaine seance : {nextSessionName}
        </p>

        {/* Cardio */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Cardio (optionnel)</p>
          <input
            type="text"
            value={cardioText}
            onChange={e => setCardioText(e.target.value)}
            placeholder="Ex: velo 30min intensite 5"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 text-sm"
          />
        </div>
      </div>

      <div className="flex-shrink-0 pb-6 space-y-3">
        <button onClick={handleGoRehab} disabled={saving} className={`${CTA} disabled:opacity-50`}>
          Faire le rehab
        </button>
        <button onClick={handleSkip} disabled={saving} className={`${CTA_SECONDARY} text-sm disabled:opacity-50`}>
          {saving ? 'Enregistrement...' : 'Passer et aller a la seance'}
        </button>
      </div>
    </div>
  )
}

