import { useState, useRef } from 'react'
import { exportData, importData } from '../../utils/backup'

export default function BackupSection({ userId }: { userId: number }) {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function clearMessages() {
    setStatus(null)
    setError(null)
  }

  async function handleExport() {
    clearMessages()
    try {
      const json = await exportData(userId)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `musculation-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatus('Backup exporte avec succes')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'export')
    }
  }

  async function handleImport(file: File) {
    clearMessages()
    setImporting(true)
    try {
      const json = await file.text()
      await importData(json)
      setStatus('Donnees restaurees avec succes')
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
        Exporter mes donnees
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

      {status && (
        <p className="text-sm text-emerald-400">{status}</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
