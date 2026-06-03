import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDashboardData, type ExerciseHistory, type SessionVolume } from '../hooks/useDashboardData'
import { useNextSession } from '../hooks/useNextSession'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const intensityStyle: Record<string, { stroke: string; bg: string; text: string; label: string; letter: string }> = {
  heavy:    { stroke: '#6366f1', bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Force', letter: 'F' },
  volume:   { stroke: '#10b981', bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Volume', letter: 'V' },
  moderate: { stroke: '#f59e0b', bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Modere', letter: 'M' },
}

const trendConfig = {
  up:   { color: 'text-emerald-400', arrow: '\u2191' },
  same: { color: 'text-zinc-500', arrow: '\u2014' },
  down: { color: 'text-red-400', arrow: '\u2193' },
} as const

function formatDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Exercise row
// ---------------------------------------------------------------------------

function ExerciseRow({ exercise }: { exercise: ExerciseHistory }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-zinc-800/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{exercise.exerciseName}</p>
          <p className="text-zinc-600 text-xs mt-0.5">
            {formatDate(exercise.lastDate)} — {exercise.entries.length} entree{exercise.entries.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          {exercise.currentWeightKg > 0 && (
            <span className="text-white text-sm font-bold tabular-nums">{exercise.currentWeightKg}kg</span>
          )}
          {exercise.trend && (
            <span className={`text-sm ${trendConfig[exercise.trend].color}`}>
              {trendConfig[exercise.trend].arrow}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-zinc-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5 border-t border-zinc-800 pt-3">
          {exercise.bestWeightKg > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-zinc-600 text-xs uppercase tracking-wider">Record</span>
              <span className="text-emerald-400 text-xs font-bold">{exercise.bestWeightKg}kg</span>
            </div>
          )}
          {exercise.entries.map((entry, i) => {
            const d = entry.date instanceof Date ? entry.date : new Date(entry.date)
            if (entry.skipped) {
              return (
                <div key={entry.id ?? i} className="flex items-center gap-2 text-xs text-zinc-700">
                  <span className="w-12 flex-shrink-0">{formatDate(d)}</span>
                  <span>skip ({entry.skipZone})</span>
                </div>
              )
            }
            const ist = entry.sessionIntensity ? intensityStyle[entry.sessionIntensity] : null
            return (
              <div key={entry.id ?? i} className="flex items-start gap-2 text-xs">
                <span className="text-zinc-600 w-12 flex-shrink-0 tabular-nums">{formatDate(d)}</span>
                {ist && (
                  <span className={`font-bold w-3 flex-shrink-0 ${ist.text}`}>{ist.letter}</span>
                )}
                <span className="text-zinc-300 break-words min-w-0 flex-1">
                  {entry.sets.map(s => `${s.weightKg}kg\u00d7${s.reps}`).join(' \u00b7 ')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tonnage chart
// ---------------------------------------------------------------------------

function TonnageChart({ sessionVolumes }: { sessionVolumes: SessionVolume[] }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<{ key: string; idx: number } | null>(null)
  const [sessionFilter, setSessionFilter] = useState<string | null>(null) // null = all

  // Drop volumes we couldn't tag with a session name — they're either old data
  // from a previous program structure or ad-hoc days that don't map to anything
  // in the current program. Showing them as '?' was more confusing than useful.
  const identifiedVolumes = useMemo(
    () => sessionVolumes.filter(sv => sv.sessionName !== undefined),
    [sessionVolumes],
  )

  // Unique session names with counts. Sorted by the program's natural order
  // (Lower 1 → Upper 1 → Lower 2 → Upper 2…) when known, falling back to
  // count for names without a known order.
  const sessionNames = useMemo(() => {
    const counts = new Map<string, number>()
    const orders = new Map<string, number>()
    for (const sv of identifiedVolumes) {
      const n = sv.sessionName!
      counts.set(n, (counts.get(n) ?? 0) + 1)
      if (sv.sessionOrder !== undefined && !orders.has(n)) {
        orders.set(n, sv.sessionOrder)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => {
        const oa = orders.get(a[0])
        const ob = orders.get(b[0])
        if (oa !== undefined && ob !== undefined) {
          // Group sessions by pair (orders 1-2, 3-4…), and within each pair
          // surface Upper before Lower per user preference.
          const tierA = Math.floor((oa - 1) / 2)
          const tierB = Math.floor((ob - 1) / 2)
          if (tierA !== tierB) return tierA - tierB
          const aIsUpper = /upper/i.test(a[0])
          const bIsUpper = /upper/i.test(b[0])
          if (aIsUpper !== bIsUpper) return aIsUpper ? -1 : 1
          return oa - ob
        }
        if (oa !== undefined) return -1
        if (ob !== undefined) return 1
        return b[1] - a[1]
      })
      .map(([name, count]) => ({ name, count }))
  }, [identifiedVolumes])

  const filteredVolumes = useMemo(() => {
    if (sessionFilter === null) return identifiedVolumes
    return identifiedVolumes.filter(sv => sv.sessionName === sessionFilter)
  }, [identifiedVolumes, sessionFilter])

  const recent = filteredVolumes.slice(0, 12).reverse()
  const allTonnages = recent.map(s => s.tonnageKg)
  // Y axis starts at 0 (honest scale — small fluctuations look small).
  // Headroom of 10% above max so the top point isn't glued to the frame.
  const maxT = recent.length > 0 ? Math.max(...allTonnages) * 1.1 : 0
  const minT = 0
  const range = maxT - minT || 1

  const W = 300
  const H = expanded ? 180 : 100
  const PAD_X = 4
  const PAD_Y = 8

  const xAt = (i: number) => PAD_X + (i / Math.max(recent.length - 1, 1)) * (W - PAD_X * 2)
  const yAt = (val: number) => PAD_Y + (1 - (val - minT) / range) * (H - PAD_Y * 2)

  // Single chronologically-ordered series — intensity is no longer color-coded
  // because the session filter does the slicing job and color was misleading
  // (made the per-session line tiny + confused tooltips).
  const dataPoints = recent.map((sv, i) => ({ x: xAt(i), y: yAt(sv.tonnageKg), sv }))

  // 3-session moving average — only when ≥3 points so the trend is meaningful.
  const trendPoints = recent.length >= 3
    ? recent.map((_, i) => {
        const start = Math.max(0, i - 2)
        const window = recent.slice(start, i + 1)
        const avg = window.reduce((sum, s) => sum + s.tonnageKg, 0) / window.length
        return { x: xAt(i), y: yAt(avg) }
      })
    : []

  const selectedInfo = selected ? dataPoints[selected.idx] : null

  // Reset selection when filter changes — its idx is now stale.
  useEffect(() => { setSelected(null) }, [sessionFilter])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-zinc-600 text-xs uppercase tracking-wider">Tonnage par seance</p>
        <button
          onClick={() => { setExpanded(e => !e); setSelected(null) }}
          className="text-zinc-600 text-xs active:text-zinc-400 transition-colors"
        >
          {expanded ? 'Reduire' : 'Agrandir'}
        </button>
      </div>

      {/* Filter chips */}
      {sessionNames.length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
          <button
            onClick={() => setSessionFilter(null)}
            className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
              sessionFilter === null
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
            }`}
          >
            Toutes
          </button>
          {sessionNames.map(({ name, count }) => {
            const label = name
            const isActive = sessionFilter === name
            return (
              <button
                key={name}
                onClick={() => setSessionFilter(name)}
                className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                }`}
              >
                {label} <span className={isActive ? 'text-zinc-700' : 'text-zinc-600'}>({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state for current filter */}
      {recent.length === 0 ? (
        <div className="text-zinc-600 text-xs py-6 text-center">
          Aucune séance pour ce filtre
        </div>
      ) : (
        <>
      {/* Selected point tooltip */}
      {selectedInfo && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-white font-bold">{selectedInfo.sv.tonnageKg.toLocaleString()}kg</span>
          <span className="text-zinc-500">
            {selectedInfo.sv.sessionName ?? 'Séance non identifiée'} — {formatDate(selectedInfo.sv.date)}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        className={`w-full transition-all duration-300 ${expanded ? 'h-52' : 'h-28'}`}
        onClick={() => setSelected(null)}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          if (!expanded && (pct === 0.25 || pct === 0.75)) return null
          const y = PAD_Y + (1 - pct) * (H - PAD_Y * 2)
          const val = Math.round(minT + pct * range)
          return (
            <g key={pct}>
              <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#27272a" strokeWidth="0.5" />
              <text x={W - PAD_X} y={y - 2} textAnchor="end" fill="#3f3f46" fontSize="7">
                {val >= 1000 ? `${(val / 1000).toFixed(1)}t` : `${val}kg`}
              </text>
            </g>
          )
        })}

        {/* 3-session moving average trendline (dashed, behind the data lines) */}
        {trendPoints.length >= 2 && (
          <polyline
            points={trendPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data line + dots (single series in chronological order) */}
        {dataPoints.length > 1 && (
          <polyline
            points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {dataPoints.map((p, j) => (
          <circle
            key={j}
            cx={p.x}
            cy={p.y}
            r={selected?.idx === j ? 5 : 3}
            fill="#10b981"
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setSelected({ key: 'data', idx: j }) }}
          />
        ))}

        {/* X-axis dates */}
        {recent.map((sv, i) => {
          const x = PAD_X + (i / Math.max(recent.length - 1, 1)) * (W - PAD_X * 2)
          if (recent.length > 6 && i % 2 !== 0 && i !== recent.length - 1) return null
          return (
            <text key={i} x={x} y={H + 12} textAnchor="middle" fill="#3f3f46" fontSize="7">
              {formatDate(sv.date)}
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-zinc-500 text-[10px] font-medium">Tonnage</span>
        </div>
        {trendPoints.length >= 2 && (
          <div className="flex items-center gap-1.5">
            <svg width="14" height="3" className="overflow-visible">
              <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#a1a1aa" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="text-zinc-500 text-[10px] font-medium">Moyenne 3 séances</span>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const user = useLiveQuery(() => db.userProfiles.toCollection().first())
  const userId = user?.id
  const data = useDashboardData(userId)
  const nextSession = useNextSession(userId)

  // Reorder exercises: those that appear in the upcoming session float to the
  // top, the rest stay in their existing recency order.
  const orderedExercises = useMemo(() => {
    if (!data.exercises.length) return data.exercises
    const upcomingIds = new Set(
      nextSession?.nextSession?.exercises.map(e => e.exerciseId) ?? [],
    )
    if (upcomingIds.size === 0) return data.exercises
    const priority: ExerciseHistory[] = []
    const rest: ExerciseHistory[] = []
    for (const ex of data.exercises) {
      if (upcomingIds.has(ex.exerciseId)) priority.push(ex)
      else rest.push(ex)
    }
    return [...priority, ...rest]
  }, [data.exercises, nextSession?.nextSession])

  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-8 pb-4">
        <h1 className="text-2xl font-black text-white">Historique</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {data.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data.hasData ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-zinc-600 text-4xl mb-3">—</p>
            <p className="text-white font-semibold mb-1">Aucune donnee</p>
            <p className="text-zinc-400 text-sm">
              Complete ta premiere seance pour voir l'historique.
            </p>
          </div>
        ) : (
          <>
            {data.sessionVolumes.length > 0 && (
              <TonnageChart sessionVolumes={data.sessionVolumes} />
            )}

            <div className="space-y-2">
              {orderedExercises.map(ex => (
                <ExerciseRow key={ex.exerciseId} exercise={ex} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
