import { useState, useRef } from 'react'
import { importData, downloadBackup, readBackupDate, daysSinceLastBackup } from '../../utils/backup'

export default function BackupSection({ userId }: { userId: number }) {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [daysSince, setDaysSince] = useState<number | null>(() => daysSinceLastBackup())
  const fileInputRef = useRef<HTMLInputElement>(null)

  function clearMessages() {
    setStatus(null)
    setError(null)
  }

  async function handleExport() {
    clearMessages()
    try {
      await downloadBackup(userId)
      setStatus('Backup exporté avec succès')
      setDaysSince(daysSinceLastBackup())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'export')
    }
  }

  async function handleImport(file: File) {
    clearMessages()
    try {
      const json = await file.text()

      // Confirmation explicite : l'import remplace TOUT. On montre la date du
      // fichier pour éviter de restaurer un vieux backup par erreur.
      const backupDate = readBackupDate(json)
      const dateLabel = backupDate
        ? `du ${backupDate.toLocaleDateString('fr-FR')}`
        : 'de date inconnue'
      const confirmed = window.confirm(
        `Ce backup date ${dateLabel}.\n\nIl va REMPLACER toutes tes données actuelles (séances, carnet, programme).\n\nUne sauvegarde de tes données actuelles va d'abord être téléchargée par sécurité.\n\nContinuer ?`
      )
      if (!confirmed) return

      setImporting(true)

      // Filet de sécurité : exporter l'état actuel avant de l'écraser.
      // Best effort — sur un appareil vierge (pas de profil) il n'y a rien à sauver.
      try { await downloadBackup(userId, 'musculation-avant-import') } catch { /* rien à sauvegarder */ }

      await importData(json)
      setStatus('Données restaurées avec succès')
      setDaysSince(daysSinceLastBackup())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'import")
    } finally {
      setImporting(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImport(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-3">Sauvegarde</p>

      <button
        onClick={handleExport}
        className="w-full py-3.5 rounded-2xl font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 active:scale-95 transition-all duration-200"
      >
        Exporter mes données
      </button>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="w-full py-3.5 rounded-2xl font-semibold border border-zinc-700 text-zinc-300 active:scale-95 transition-all duration-200 disabled:opacity-50"
      >
        {importing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            Import en cours...
          </span>
        ) : (
          'Importer un backup'
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onFileChange}
        className="hidden"
      />

      <p className={`text-xs ${daysSince !== null && daysSince > 30 ? 'text-amber-400' : daysSince === null ? 'text-amber-400' : 'text-zinc-600'}`}>
        {daysSince === null
          ? 'Aucune sauvegarde effectuée — pense à exporter tes données.'
          : daysSince === 0
            ? 'Dernière sauvegarde : aujourd\'hui'
            : `Dernière sauvegarde : il y a ${daysSince} jour${daysSince > 1 ? 's' : ''}`}
      </p>

      {status && (
        <p className="text-sm text-emerald-400">{status}</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
