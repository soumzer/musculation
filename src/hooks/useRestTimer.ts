import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

// Shared AudioContext — created on first user gesture (start), reused for timer sounds.
// iOS Safari suspends AudioContext created outside a user gesture, so we create it
// inside start() and keep it alive for the timer end sound.
let sharedAudioCtx: AudioContext | null = null

function ensureAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContext()
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume()
    }
    return sharedAudioCtx
  } catch { return null }
}

function playTimerSound() {
  const ctx = ensureAudioContext()
  if (!ctx) return
  try {
    // Triple bip appuyé — un seul bip de 0.3s à faible volume est inaudible
    // dans une salle bruyante ou avec le téléphone posé sur un banc.
    const BEEP_DURATION = 0.25
    const BEEP_GAP = 0.15
    for (let i = 0; i < 3; i++) {
      const startAt = ctx.currentTime + i * (BEEP_DURATION + BEEP_GAP)
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, startAt)
      gain.gain.setValueAtTime(0.6, startAt)
      gain.gain.exponentialRampToValueAtTime(0.01, startAt + BEEP_DURATION)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + BEEP_DURATION)
    }
  } catch { /* ignore */ }
}

function vibrate(pattern: number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* ignore */ }
}

/** Fin du repos : son + vibration longue (Android — iOS ignore navigator.vibrate). */
function notifyTimerEnd() {
  playTimerSound()
  vibrate([300, 120, 300, 120, 300])
}

export interface UseRestTimerReturn {
  remaining: number
  isRunning: boolean
  endTime: number | null
  start: () => void
  pause: () => void
  reset: () => void
  formatTime: () => string
}

export function useRestTimer(restSeconds: number, initialEndTime?: number | null): UseRestTimerReturn {
  // État initial calculé une seule fois (lazy) — un timer restauré encore
  // valide reprend son décompte, sinon on démarre arrêté à restSeconds.
  const [initial] = useState(() => {
    const now = Date.now()
    const running = !!initialEndTime && initialEndTime > now
    const left = initialEndTime ? Math.max(0, Math.ceil((initialEndTime - now) / 1000)) : 0
    return {
      remaining: running && left > 0 ? left : restSeconds,
      isRunning: running,
      endTime: running ? (initialEndTime as number) : null,
    }
  })
  const [remaining, setRemaining] = useState(initial.remaining)
  const [isRunning, setIsRunning] = useState(initial.isRunning)
  // endTime est exposé aux consommateurs (persistence de séance) → state.
  // Le ref miroir sert aux callbacks (interval, visibilitychange) qui ont
  // besoin de la valeur courante sans re-création.
  const [endTime, setEndTime] = useState<number | null>(initial.endTime)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endTimeRef = useRef<number | null>(initial.endTime)

  const setEnd = useCallback((value: number | null) => {
    endTimeRef.current = value
    setEndTime(value)
  }, [])

  // Auto-start interval if restored with a running timer
  useEffect(() => {
    if (endTimeRef.current && endTimeRef.current > Date.now() && !intervalRef.current) {
      const end = endTimeRef.current
      intervalRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
        setRemaining(left)
        if (left <= 0) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          setEnd(null)
          setIsRunning(false)
          notifyTimerEnd()
        }
      }, 250)
    }
  }, [setEnd])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setEnd(null)
    setIsRunning(false)
  }, [setEnd])

  const start = useCallback(() => {
    // Unlock AudioContext on user gesture (required for iOS Safari)
    ensureAudioContext()

    // Use wall-clock based timer for accuracy (survives tab suspension)
    const end = Date.now() + remaining * 1000
    setEnd(end)
    setIsRunning(true)

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setEnd(null)
        setIsRunning(false)
        notifyTimerEnd()
      }
    }, 250)
  }, [remaining, setEnd])

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    // Freeze remaining at current value
    if (endTimeRef.current) {
      const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setRemaining(left)
    }
    setEnd(null)
    setIsRunning(false)
  }, [setEnd])

  const reset = useCallback(() => {
    stop()
    setRemaining(restSeconds)
  }, [stop, restSeconds])

  // Reset remaining when restSeconds prop changes (or the timer stops).
  // Différé d'un microtask : les effects consommateurs (auto-log des exos
  // chronométrés) doivent d'abord observer remaining === 0 dans ce commit.
  useEffect(() => {
    if (isRunning) return
    void (async () => {
      await Promise.resolve()
      setRemaining(restSeconds)
    })()
  }, [restSeconds, isRunning])

  // When app comes back to foreground, catch expired timer and notify
  const firedRef = useRef(false)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!endTimeRef.current || firedRef.current) return
      if (Date.now() >= endTimeRef.current) {
        // Timer expired while backgrounded — notify now
        firedRef.current = true
        setRemaining(0)
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
        setEnd(null)
        setIsRunning(false)
        notifyTimerEnd()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [setEnd])

  // Reset firedRef when timer starts
  useEffect(() => {
    if (isRunning) firedRef.current = false
  }, [isRunning])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const formatTime = useCallback(() => {
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [remaining])

  // Objet mémoïsé : utilisé comme dépendance de useCallback par les consommateurs.
  return useMemo(
    () => ({ remaining, isRunning, endTime, start, pause, reset, formatTime }),
    [remaining, isRunning, endTime, start, pause, reset, formatTime],
  )
}
