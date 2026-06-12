import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import BackupSection from '../components/settings/BackupSection'
import { downloadBackup } from '../utils/backup'
import HealthConditionsManager from '../components/settings/HealthConditionsManager'
import EquipmentManager from '../components/settings/EquipmentManager'
import { useRegenerateProgram } from '../hooks/useRegenerateProgram'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-5'
const SECTION_LABEL = 'text-zinc-600 text-xs uppercase tracking-wider mb-3'
const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_SECONDARY = 'w-full py-3.5 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200'

const splitLabels: Record<string, string> = {
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
  push_pull_legs: 'Push / Pull / Legs',
  bodyweight: 'Poids de Corps',
  custom: 'Personnalisé',
}

// ---------------------------------------------------------------------------
// Training settings card
// ---------------------------------------------------------------------------

function TrainingSettings({
  userId,
  daysPerWeek,
  programType,
  programSessionCount,
  sessionCount,
  onRegenerate,
  isRegenerating,
}: {
  userId: number
  daysPerWeek: number
  programType?: string
  programSessionCount?: number
  sessionCount: number
  onRegenerate: () => Promise<{ success: boolean; error?: string }>
  isRegenerating: boolean
}) {
  const [editDays, setEditDays] = useState(daysPerWeek)
  const hasChanges = editDays !== daysPerWeek
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await db.userProfiles.update(userId, {
        daysPerWeek: editDays,
        updatedAt: new Date(),
      })
      await onRegenerate()
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const daysOptions = [2, 3, 4, 5, 6]

  return (
    <div className={CARD + ' space-y-4'}>
      <p className={SECTION_LABEL}>Entraînement</p>

      {/* Days per week */}
      <div>
        <p className="text-zinc-400 text-sm mb-2">Jours par semaine</p>
        <div className="flex gap-2">
          {daysOptions.map(d => (
            <button
              key={d}
              onClick={() => setEditDays(d)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition-all duration-200 ${
                editDays === d
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {d}x
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving || isRegenerating}
          className={`${CTA} disabled:opacity-50`}
        >
          {saving || isRegenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Mise à jour...
            </span>
          ) : 'Appliquer les changements'}
        </button>
      )}

      {/* Program info */}
      <div className="flex items-center justify-between">
        {programType && (
          <div>
            <p className="text-white text-sm font-semibold">
              {splitLabels[programType] ?? programType}
            </p>
            <p className="text-zinc-600 text-xs">{programSessionCount} séances</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-white text-sm font-semibold">{sessionCount}</p>
          <p className="text-zinc-600 text-xs">séance{sessionCount > 1 ? 's' : ''} complétée{sessionCount > 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// How it works modal
// ---------------------------------------------------------------------------

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const sections = [
    { title: 'Programme', text: 'Ton programme est généré automatiquement selon ton nombre de jours par semaine et ton équipement. Le split (Full Body, Upper/Lower, PPL) est choisi en fonction du nombre de séances. Chaque séance alterne entre Force, Volume et Modéré.' },
    { title: 'Conditions de santé', text: 'Les conditions de santé ne modifient pas le programme. Un bandeau orange s\'affiche sur les exercices qui touchent une zone sensible pour te rappeler d\'adapter la charge ou de skip.' },
    { title: 'Skip et questionnaire', text: 'Si un exercice te fait mal, tu peux le passer en indiquant la zone douloureuse. Un questionnaire identifie le problème et crée une condition de santé automatiquement.' },
    { title: 'Rééducation', text: 'La page Rehab propose des exercices de rééducation adaptés à tes conditions actives. Après un skip, les exercices de rehab pour la zone concernée sont mis en avant pendant 3-4 jours.' },
    { title: 'Carnet', text: 'Chaque exercice a un carnet qui enregistre tes séries (poids et répétitions). L\'historique est visible pour suivre ta progression. Le dernier poids utilisé est pré-rempli.' },
    { title: 'Données', text: 'Toutes tes données sont stockées localement sur ton appareil. Rien n\'est envoyé sur un serveur. Utilise la section Sauvegarde pour exporter/importer.' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 pb-8 space-y-4 animate-[slideUp_0.3s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        <h2 className="text-xl font-black text-white">Comment ça marche</h2>

        {sections.map(s => (
          <section key={s.title} className="space-y-1.5">
            <h3 className="text-sm font-semibold text-white">{s.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{s.text}</p>
          </section>
        ))}

        <button onClick={onClose} className={CTA_SECONDARY + ' mt-4'}>
          Compris
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const { regenerate, isRegenerating } = useRegenerateProgram()
  const user = useLiveQuery(() => db.userProfiles.toCollection().first())
  const program = useLiveQuery(
    () => user?.id
      ? db.workoutPrograms.where('userId').equals(user.id).and(p => p.isActive).first()
      : undefined,
    [user?.id]
  )
  const sessionCount = useLiveQuery(
    () => user?.id
      ? db.workoutSessions.where('userId').equals(user.id).count()
      : 0,
    [user?.id]
  )

  if (!user) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-8 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white">Profil</h1>
          <button
            onClick={() => setShowHowItWorks(true)}
            className="text-zinc-500 text-sm active:text-zinc-300 transition-colors"
          >
            Comment ça marche ?
          </button>
        </div>

        {/* User info */}
        <div className={CARD}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-400 text-lg font-black">
                {(user.name || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-white text-lg font-bold">{user.name || 'Utilisateur'}</p>
            </div>
          </div>
        </div>

        {/* Training settings */}
        <TrainingSettings
          userId={user.id!}
          daysPerWeek={user.daysPerWeek}
          programType={program?.type}
          programSessionCount={program?.sessions.length}
          sessionCount={sessionCount ?? 0}
          onRegenerate={() => regenerate(user.id!)}
          isRegenerating={isRegenerating}
        />

        {/* Health conditions manager */}
        <div className={CARD}>
          <HealthConditionsManager userId={user.id!} />
        </div>

        {/* Equipment manager */}
        <div className={CARD}>
          <EquipmentManager
            userId={user.id!}
            onRegenerate={() => regenerate(user.id!)}
            isRegenerating={isRegenerating}
          />
        </div>

        {/* Backup */}
        <BackupSection userId={user.id!} />

        {/* Reset */}
        <div className={CARD + ' space-y-3'}>
          <p className={SECTION_LABEL}>Zone de danger</p>
          <p className="text-zinc-400 text-sm">Supprime toutes les données et relance l'onboarding.</p>
          <button
            onClick={async () => {
              // Filet de sécurité : télécharger un backup avant la suppression
              // définitive (best effort — ne bloque pas si l'export échoue).
              try { await downloadBackup(user.id!, 'musculation-avant-reset') } catch { /* rien à sauvegarder */ }
              const typed = window.prompt(
                'Un backup de secours vient d\'être téléchargé.\n\nPour supprimer définitivement toutes tes données, tape SUPPRIMER :'
              )
              if (typed?.trim().toUpperCase() !== 'SUPPRIMER') return
              await db.delete()
              await db.open()
              localStorage.clear()
              window.location.href = import.meta.env.BASE_URL
            }}
            className="w-full py-3.5 rounded-2xl font-semibold border border-red-900/50 text-red-400 bg-red-950/30 active:scale-95 transition-all duration-200"
          >
            Tout supprimer et recommencer
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700 pt-2">
          Musculation · Données 100% locales
        </p>
      </div>

      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
    </div>
  )
}
