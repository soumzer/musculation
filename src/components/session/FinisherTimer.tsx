import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notifyRoundChange, notifyTimerEnd, unlockAudio } from '../../hooks/useRestTimer'
import type { Finisher } from '../../db/types'

/**
 * Timer de finisher (programme coach) — timer + consigne, pas de saisie.
 *
 * - emom      : N minutes qui s'enchaînent, bip à chaque minute.
 * - intervals : N tours travail/repos qui s'enchaînent, bip à chaque bascule.
 * - circuit   : tours manuels (« Tour fini ») + repos chronométré entre les
 *               tours, chrono total en fond.
 *
 * Horloge murale (Date.now) pour rester juste si l'onglet est suspendu.
 */

interface Segment {
  round: number
  kind: 'work' | 'rest'
  seconds: number
}

function buildSchedule(f: Finisher): Segment[] {
  const rounds = f.rounds ?? f.durationMin
  if (f.kind === 'emom') {
    return Array.from({ length: rounds }, (_, i) => ({ round: i + 1, kind: 'work' as const, seconds: 60 }))
  }
  // intervals
  const work = f.workSeconds ?? 30
  const rest = f.restSeconds ?? 30
  const out: Segment[] = []
  for (let i = 1; i <= rounds; i++) {
    out.push({ round: i, kind: 'work', seconds: work })
    if (i < rounds) out.push({ round: i, kind: 'rest', seconds: rest })
  }
  return out
}

function fmt(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const BTN = 'bg-zinc-800 text-white rounded-xl px-5 py-2.5 text-sm font-semibold active:scale-95 transition-all duration-200'

// ---------------------------------------------------------------------------
// EMOM / intervalles : segments automatiques
// ---------------------------------------------------------------------------

function ScheduledTimer({ finisher }: { finisher: Finisher }) {
  const schedule = useMemo(() => buildSchedule(finisher), [finisher])
  const total = useMemo(() => schedule.reduce((a, s) => a + s.seconds, 0), [schedule])

  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // Secondes cumulées avant la pause courante + instant de reprise : lus dans
  // le tick (setInterval), donc en refs.
  const pausedAtRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const lastSegmentRef = useRef(-1)

  const segmentAt = useCallback((t: number): number => {
    let acc = 0
    for (let i = 0; i < schedule.length; i++) {
      if (t < acc + schedule[i].seconds) return i
      acc += schedule[i].seconds
    }
    return schedule.length - 1
  }, [schedule])

  // Toutes les transitions (bip de tour, fin) se font dans le tick.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const startedAt = startedAtRef.current
      if (startedAt === null) return
      const t = pausedAtRef.current + (Date.now() - startedAt) / 1000
      if (t >= total) {
        clearInterval(id)
        pausedAtRef.current = total
        startedAtRef.current = null
        setElapsed(total)
        setRunning(false)
        setFinished(true)
        notifyTimerEnd()
        return
      }
      const idx = segmentAt(t)
      if (lastSegmentRef.current !== idx) {
        if (lastSegmentRef.current !== -1) notifyRoundChange()
        lastSegmentRef.current = idx
      }
      setElapsed(t)
    }, 250)
    return () => clearInterval(id)
  }, [running, total, segmentAt])

  const start = useCallback(() => {
    unlockAudio()
    if (finished) return
    startedAtRef.current = Date.now()
    if (lastSegmentRef.current === -1) lastSegmentRef.current = 0
    setRunning(true)
  }, [finished])

  const pause = useCallback(() => {
    const startedAt = startedAtRef.current
    if (startedAt !== null) pausedAtRef.current += (Date.now() - startedAt) / 1000
    startedAtRef.current = null
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    pausedAtRef.current = 0
    startedAtRef.current = null
    lastSegmentRef.current = -1
    setRunning(false)
    setFinished(false)
    setElapsed(0)
  }, [])

  const segIdx = segmentAt(elapsed)
  const seg = schedule[segIdx]
  const segStart = schedule.slice(0, segIdx).reduce((a, s) => a + s.seconds, 0)
  const remainingInSeg = Math.ceil(segStart + seg.seconds - elapsed)
  const isWork = seg.kind === 'work'
  const label = finisher.kind === 'emom'
    ? `Minute ${seg.round}/${schedule.length}`
    : `Tour ${seg.round}/${finisher.rounds ?? 0} · ${isWork ? 'TRAVAIL' : 'REPOS'}`

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      {finished ? (
        <>
          <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Terminé</p>
          <p className="text-5xl font-mono font-black text-emerald-400 tabular-nums">{fmt(total)}</p>
        </>
      ) : (
        <>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${isWork ? 'text-emerald-400' : 'text-amber-400'}`}>{label}</p>
          <p className={`text-6xl font-mono font-black tabular-nums ${isWork ? 'text-white' : 'text-amber-300'}`}>{fmt(remainingInSeg)}</p>
          <p className="text-zinc-600 text-xs mt-2 tabular-nums">total {fmt(Math.floor(elapsed))} / {fmt(total)}</p>
        </>
      )}
      <div className="flex justify-center gap-2 mt-4">
        {running ? (
          <button onClick={pause} className={BTN}>Pause</button>
        ) : (
          <button onClick={start} className={`${BTN} !bg-emerald-500`} disabled={finished}>
            {elapsed > 0 ? 'Reprendre' : 'Démarrer'}
          </button>
        )}
        <button onClick={reset} className={`${BTN} !text-zinc-400`}>Reset</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Circuit : tours manuels + repos chronométré
// ---------------------------------------------------------------------------

function CircuitTimer({ finisher }: { finisher: Finisher }) {
  const rounds = finisher.rounds ?? 1
  const restSeconds = finisher.restSeconds ?? 0
  const [round, setRound] = useState(1)
  const [status, setStatus] = useState<'idle' | 'work' | 'rest' | 'done'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [restLeft, setRestLeft] = useState(restSeconds)
  const startedAtRef = useRef<number | null>(null)
  const restEndRef = useRef<number | null>(null)

  // Un seul tick : chrono total + décompte du repos + passage au tour suivant.
  useEffect(() => {
    if (status === 'idle' || status === 'done') return
    const id = setInterval(() => {
      const startedAt = startedAtRef.current
      if (startedAt !== null) setElapsed(Math.floor((Date.now() - startedAt) / 1000))
      const restEnd = restEndRef.current
      if (restEnd !== null) {
        const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000))
        setRestLeft(left)
        if (left <= 0) {
          restEndRef.current = null
          notifyTimerEnd()
          setRound((r) => r + 1)
          setStatus('work')
        }
      }
    }, 250)
    return () => clearInterval(id)
  }, [status])

  const start = useCallback(() => {
    unlockAudio()
    startedAtRef.current = Date.now()
    setElapsed(0)
    setRound(1)
    setStatus('work')
  }, [])

  const roundDone = useCallback(() => {
    if (round >= rounds) {
      setStatus('done')
      notifyTimerEnd()
      return
    }
    if (restSeconds > 0) {
      restEndRef.current = Date.now() + restSeconds * 1000
      setRestLeft(restSeconds)
      setStatus('rest')
    } else {
      notifyRoundChange()
      setRound((r) => r + 1)
    }
  }, [round, rounds, restSeconds])

  const skipRest = useCallback(() => {
    restEndRef.current = null
    setRound((r) => r + 1)
    setStatus('work')
  }, [])

  const reset = useCallback(() => {
    startedAtRef.current = null
    restEndRef.current = null
    setStatus('idle')
    setRound(1)
    setElapsed(0)
  }, [])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      {status === 'done' ? (
        <>
          <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Terminé · {rounds} tours</p>
          <p className="text-5xl font-mono font-black text-emerald-400 tabular-nums">{fmt(elapsed)}</p>
        </>
      ) : status === 'rest' ? (
        <>
          <p className="text-amber-400 text-sm font-bold uppercase tracking-wider mb-2">Repos avant le tour {round + 1}/{rounds}</p>
          <p className="text-6xl font-mono font-black text-amber-300 tabular-nums">{fmt(restLeft)}</p>
          <p className="text-zinc-600 text-xs mt-2 tabular-nums">total {fmt(elapsed)}</p>
        </>
      ) : (
        <>
          <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">
            {status === 'idle' ? `${rounds} tours` : `Tour ${round}/${rounds}`}
          </p>
          <p className="text-6xl font-mono font-black text-white tabular-nums">{fmt(elapsed)}</p>
          {restSeconds > 0 && <p className="text-zinc-600 text-xs mt-2">repos {restSeconds}s entre les tours</p>}
        </>
      )}
      <div className="flex justify-center gap-2 mt-4">
        {status === 'idle' && <button onClick={start} className={`${BTN} !bg-emerald-500`}>Démarrer</button>}
        {status === 'work' && <button onClick={roundDone} className={`${BTN} !bg-emerald-500`}>Tour {round} fini</button>}
        {status === 'rest' && <button onClick={skipRest} className={BTN}>Passer le repos</button>}
        {status !== 'idle' && <button onClick={reset} className={`${BTN} !text-zinc-400`}>Reset</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Écran finisher
// ---------------------------------------------------------------------------

export default function FinisherTimer({
  finisher,
  sessionName,
  onFinish,
}: {
  finisher: Finisher
  sessionName: string
  onFinish: () => void
}) {
  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      <div className="h-1 bg-emerald-500" />
      <div className="px-5 pt-6 flex-1 flex flex-col overflow-hidden">
        <div className="text-center mb-5">
          <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Finisher · {sessionName}</p>
          <h2 className="text-2xl font-black text-white">{finisher.title}</h2>
          <p className="text-zinc-400 text-sm mt-2 leading-relaxed">{finisher.description}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {finisher.kind === 'circuit'
            ? <CircuitTimer finisher={finisher} />
            : <ScheduledTimer finisher={finisher} />}
          <p className="text-zinc-600 text-xs text-center mt-4">
            Sur le cardio tu réduis les pauses, tu n'accélères pas.
          </p>
        </div>

        <div className="pt-4 pb-6 flex-shrink-0">
          <button onClick={onFinish} className={CTA}>
            Terminer la séance
          </button>
        </div>
      </div>
    </div>
  )
}
