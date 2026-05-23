import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { ENGINE_VERSION } from '../engine/program-generator'
import { useRegenerateProgram } from './useRegenerateProgram'

export interface EngineVersionCheckResult {
  /** True when an auto-regeneration just happened during this app load. */
  upgraded: boolean
  /** Engine version of the program that was upgraded (i.e. the old one). */
  fromVersion: number | undefined
  /** Engine version after upgrade. */
  toVersion: number
  /** Call to dismiss the banner. */
  dismiss: () => void
}

/**
 * Auto-regenerate the user's active program when its stored engineVersion is
 * older than the current ENGINE_VERSION.
 *
 * Guard rails:
 *  - Skips entirely if no userId yet (still onboarding).
 *  - Skips if an activeSession is in progress — we don't want to swap the
 *    program out from under a running workout. Will retry on next boot.
 *  - Runs at most once per app load (hasRun ref).
 *
 * Returns banner state so a UI component can notify the user when an upgrade
 * happened. Call `dismiss()` to hide the banner.
 */
export function useEngineVersionCheck(userId: number | undefined): EngineVersionCheckResult {
  const { regenerate } = useRegenerateProgram()
  const hasRun = useRef(false)
  const [state, setState] = useState<EngineVersionCheckResult>({
    upgraded: false,
    fromVersion: undefined,
    toVersion: ENGINE_VERSION,
    dismiss: () => setState((s) => ({ ...s, upgraded: false })),
  })

  useEffect(() => {
    if (userId === undefined) return
    if (hasRun.current) return
    hasRun.current = true

    let cancelled = false
    ;(async () => {
      const activeSession = await db.activeSession.toCollection().first()
      if (activeSession) return // Don't disrupt an in-progress workout.

      const activeProgram = await db.workoutPrograms
        .where('userId').equals(userId)
        .filter((p) => p.isActive)
        .first()

      if (!activeProgram) return // No program yet — onboarding handles creation.

      const storedVersion = activeProgram.engineVersion ?? 1
      if (storedVersion >= ENGINE_VERSION) return

      const result = await regenerate(userId)
      if (cancelled) return
      if (result.success) {
        setState((s) => ({ ...s, upgraded: true, fromVersion: storedVersion }))
      } else {
        console.warn('[engine-version] auto-regeneration failed:', result.error)
      }
    })()

    return () => { cancelled = true }
  }, [userId, regenerate])

  return state
}
