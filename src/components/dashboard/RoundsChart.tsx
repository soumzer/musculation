import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'

/**
 * Tours du complexe au chrono, séance par séance (Iron Cardio).
 *
 * C'est l'indicateur de progression du programme kettlebell : à charge ET
 * durée égales, plus de tours = tu avances. L'écart avec la séance précédente
 * n'est donc affiché que si la charge et la durée n'ont pas bougé — sinon une
 * séance plus courte ou plus lourde ressemblerait à une régression.
 */
const W = 300
const H = 84
const PAD_X = 10
const PAD_Y = 12
const MAX_POINTS = 12

interface Point {
  date: Date
  rounds: number
  weightKg: number
  /** Durée faite, en secondes. Absente sur les séances d'avant le réglage libre. */
  seconds?: number
}

export default function RoundsChart({ userId }: { userId: number }) {
  const data = useLiveQuery(async () => {
    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter((p) => p.isActive)
      .first()
    if (!program?.isCoach) return null

    const complex = program.sessions.flatMap((s) => s.exercises).find((e) => e.continuousComplex)
    if (!complex) return null

    const exercise = await db.exercises.get(complex.exerciseId)
    const entries = await db.notebookEntries
      .where('[userId+exerciseId]').equals([userId, complex.exerciseId])
      .toArray()

    const points: Point[] = entries
      .filter((e) => !e.skipped && e.sets.length > 0 && e.sets[0].reps > 0)
      .map((e) => ({
        date: e.date instanceof Date ? e.date : new Date(e.date),
        rounds: e.sets[0].reps,
        weightKg: e.sets[0].weightKg,
        seconds: e.sets[0].seconds,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-MAX_POINTS)

    // Une courbe à un seul point n'apprend rien — on attend la deuxième séance.
    if (points.length < 2) return null
    return { name: (exercise?.name ?? 'Complexe').replace(/\s*\(.*\)$/, ''), points }
  }, [userId], undefined)

  if (!data) return null

  const { name, points } = data
  const max = Math.max(...points.map((p) => p.rounds))
  const last = points[points.length - 1]
  const previous = points[points.length - 2]
  const delta = last.rounds - previous.rounds
  // Comparable seulement à charge ET durée identiques.
  const comparable = last.weightKg === previous.weightKg && last.seconds === previous.seconds

  const x = (i: number) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2)
  const y = (rounds: number) => PAD_Y + (1 - rounds / max) * (H - PAD_Y * 2)
  const weights = [...new Set(points.map((p) => p.weightKg).filter((w) => w > 0))].sort((a, b) => a - b)
  const minutes = last.seconds !== undefined ? Math.round(last.seconds / 60) : null

  const formatDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-zinc-600 text-xs uppercase tracking-wider">{name} — tours</p>
        <p className="text-white text-sm font-bold tabular-nums">
          {last.rounds} tours
          {comparable && delta !== 0 && (
            <span className={`ml-2 text-xs font-semibold ${delta > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {delta > 0 ? '+' : '−'}{Math.abs(delta)}
            </span>
          )}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-28">
        {/* Repère : le maximum atteint */}
        <line x1={PAD_X} y1={y(max)} x2={W - PAD_X} y2={y(max)} stroke="#27272a" strokeWidth="0.5" />
        <text x={W - PAD_X} y={y(max) - 2} textAnchor="end" fill="#3f3f46" fontSize="7">{max}</text>

        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.rounds)}`).join(' ')}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.rounds)} r="2.5" fill="#10b981" />
        ))}

        <text x={PAD_X} y={H + 10} fill="#3f3f46" fontSize="7">{formatDate(points[0].date)}</text>
        <text x={W - PAD_X} y={H + 10} textAnchor="end" fill="#3f3f46" fontSize="7">{formatDate(last.date)}</text>
      </svg>

      <p className="text-zinc-500 text-xs mt-1">
        Dernière séance : {last.weightKg > 0 ? `${last.weightKg} kg` : 'poids de corps'}
        {minutes !== null ? ` · ${minutes} min` : ''}.
        {weights.length > 1 && ` Charges utilisées : ${weights.join(', ')} kg.`}
        {' '}Plus de tours à charge et durée égales = tu progresses.
      </p>
    </div>
  )
}
