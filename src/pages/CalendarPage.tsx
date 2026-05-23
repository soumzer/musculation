import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { WorkoutSession, NotebookEntry } from '../db/types'

// ---------------------------------------------------------------------------
// Design tokens & constants
// ---------------------------------------------------------------------------

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-4'

const MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]
const MONTHS_SHORT = [
  'jan', 'fev', 'mars', 'avr', 'mai', 'juin',
  'juil', 'aout', 'sept', 'oct', 'nov', 'dec',
]
const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

type DayStatus = 'muscu' | 'rehab'

const STATUS_CELL: Record<DayStatus, string> = {
  muscu: 'bg-emerald-500/15 text-emerald-400',
  rehab: 'bg-indigo-500/15 text-indigo-400',
}

interface DayData {
  sessions: WorkoutSession[]
  rehabDone: NotebookEntry[]
  // Fallback when session was done but "Terminer" was never clicked
  muscuEntries: NotebookEntry[]
  inferredSessionName?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d))

function dayStatus(d?: DayData): DayStatus | null {
  if (!d) return null
  if (d.sessions.length > 0 || d.muscuEntries.length > 0) return 'muscu'
  if (d.rehabDone.length > 0) return 'rehab'
  return null
}

function sessionTonnage(s: WorkoutSession): number {
  let t = 0
  for (const ex of s.exercises) {
    for (const set of ex.sets) {
      t += (set.actualWeightKg ?? 0) * (set.actualReps ?? 0)
    }
  }
  return Math.round(t)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const user = useLiveQuery(() => db.userProfiles.toCollection().first())
  const userId = user?.id

  const allSessions = useLiveQuery(
    () => (userId ? db.workoutSessions.where('userId').equals(userId).toArray() : []),
    [userId],
  )
  const allRehab = useLiveQuery(
    () => (userId
      ? db.notebookEntries.where('sessionIntensity').equals('rehab').filter(e => e.userId === userId).toArray()
      : []),
    [userId],
  )
  // Muscu notebook entries — fallback for sessions where "Terminer" was never clicked
  const allMuscuEntries = useLiveQuery(
    () => (userId
      ? db.notebookEntries
          .where('userId').equals(userId)
          .filter(e => e.sessionIntensity !== 'rehab' && !e.skipped && e.sets.length > 0)
          .toArray()
      : []),
    [userId],
  )
  // Active program — used to infer session name from notebook entries
  const activeProgram = useLiveQuery(
    () => (userId
      ? db.workoutPrograms.where('userId').equals(userId).filter(p => p.isActive).first()
      : undefined),
    [userId],
  )

  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState<number | null>(null)

  const shiftMonth = (delta: number) => {
    setSelected(null)
    setView(v => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  // Build day -> data map for the visible month
  const monthMap = useMemo(() => {
    const map = new Map<number, DayData>()
    const get = (day: number): DayData => {
      let d = map.get(day)
      if (!d) {
        d = { sessions: [], rehabDone: [], muscuEntries: [] }
        map.set(day, d)
      }
      return d
    }
    const sessionDays = new Set<number>()
    for (const s of allSessions ?? []) {
      if (!s.completedAt) continue
      const d = toDate(s.completedAt)
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        get(d.getDate()).sessions.push(s)
        sessionDays.add(d.getDate())
      }
    }
    // Fallback: mark muscu days from notebook entries when no session record exists
    // Group by calendar day first
    const muscuByDay = new Map<number, NotebookEntry[]>()
    for (const e of allMuscuEntries ?? []) {
      const d = toDate(e.date)
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        if (!sessionDays.has(d.getDate())) {
          const dayNum = d.getDate()
          if (!muscuByDay.has(dayNum)) muscuByDay.set(dayNum, [])
          muscuByDay.get(dayNum)!.push(e)
        }
      }
    }
    for (const [dayNum, entries] of muscuByDay) {
      const dayData = get(dayNum)
      dayData.muscuEntries = entries
      // Infer session name by matching exerciseIds against active program sessions
      if (activeProgram) {
        const doneIds = new Set(entries.map(e => e.exerciseId))
        let bestName: string | undefined
        let bestScore = 0
        for (const s of activeProgram.sessions) {
          const sIds = new Set(s.exercises.map(pe => pe.exerciseId))
          let score = 0
          for (const id of doneIds) { if (sIds.has(id)) score++ }
          if (score > bestScore) { bestScore = score; bestName = s.name }
        }
        if (bestScore >= 2) dayData.inferredSessionName = bestName
      }
    }
    for (const e of allRehab ?? []) {
      if (e.skipped || e.sets.length === 0) continue
      const d = toDate(e.date)
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        get(d.getDate()).rehabDone.push(e)
      }
    }
    return map
  }, [allSessions, allRehab, allMuscuEntries, activeProgram, view])

  // Loading
  if (!user || allSessions === undefined || allRehab === undefined || allMuscuEntries === undefined) {
    return (
      <div className="flex items-center justify-center h-[var(--content-h)]">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Grid layout — Monday-first
  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day

  const selectedData = selected !== null ? monthMap.get(selected) : undefined
  const showSummary = !!selectedData && dayStatus(selectedData) !== null

  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      {/* Header — month navigation */}
      <div className="flex-shrink-0 px-5 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Mois precedent"
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 active:scale-90 transition-all duration-150"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-xl font-black text-white">
            {MONTHS[view.month]} {view.year}
          </h1>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Mois suivant"
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 active:scale-90 transition-all duration-150"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto px-5">
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-zinc-600 text-xs font-medium">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`b${idx}`} />
            const status = dayStatus(monthMap.get(day))
            const isSel = selected === day
            return (
              <button
                key={day}
                onClick={() => setSelected(day)}
                className={`aspect-square rounded-xl flex items-center justify-center text-sm font-semibold active:scale-90 transition-all duration-150 ${
                  status ? STATUS_CELL[status] : 'text-zinc-400'
                } ${
                  isSel
                    ? 'ring-2 ring-inset ring-white/60'
                    : isToday(day)
                      ? 'ring-1 ring-inset ring-zinc-600'
                      : ''
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-5">
          <LegendDot className="bg-emerald-500" label="Muscu" />
          <LegendDot className="bg-indigo-500" label="Rehab" />
        </div>
      </div>

      {/* Day summary — only when the tapped day has activity */}
      {showSummary && selected !== null && (
        <div className="flex-shrink-0 px-5 pt-3 pb-6">
          <DaySummary data={selectedData!} label={`${selected} ${MONTHS_SHORT[view.month]}`} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${className}`} />
      <span className="text-zinc-500 text-xs">{label}</span>
    </div>
  )
}

function DaySummary({ data, label }: { data: DayData; label: string }) {
  // --- Muscu day (with full session record) ---
  if (data.sessions.length > 0) {
    const s = data.sessions[0]
    const done = s.exercises.filter(e => e.status === 'completed')
    const tonnage = sessionTonnage(s)
    return (
      <div className={CARD}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-white font-bold truncate">{s.sessionName}</p>
          </div>
          {tonnage > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-emerald-400 font-bold tabular-nums">{tonnage.toLocaleString()} kg</p>
              <p className="text-zinc-600 text-[10px] uppercase tracking-wider">Tonnage</p>
            </div>
          )}
        </div>
        {done.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {done.map((e, i) => (
              <span key={i} className="text-xs text-zinc-300 bg-zinc-800 rounded-lg px-2 py-1">
                {e.exerciseName}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- Muscu day (fallback: only notebook entries, no session record) ---
  if (data.muscuEntries.length > 0) {
    const exerciseNames = [...new Set(data.muscuEntries.map(e => e.exerciseName))]
    const sessionLabel = data.inferredSessionName ?? 'Séance'
    return (
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-white font-bold">{sessionLabel}</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 flex-shrink-0">
            {exerciseNames.length} exercice{exerciseNames.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {exerciseNames.map((n, i) => (
            <span key={i} className="text-xs text-zinc-300 bg-zinc-800 rounded-lg px-2 py-1">{n}</span>
          ))}
        </div>
      </div>
    )
  }

  // --- Rehab day ---
  const names = [...new Set(data.rehabDone.map(e => e.exerciseName))]
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">{label}</p>
          <p className="text-white font-bold">Rehab</p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400 flex-shrink-0">
          {names.length} exercice{names.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n, i) => (
          <span key={i} className="text-xs text-zinc-300 bg-zinc-800 rounded-lg px-2 py-1">{n}</span>
        ))}
      </div>
    </div>
  )
}
