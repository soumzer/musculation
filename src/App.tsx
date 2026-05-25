import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import BottomNav from './components/BottomNav'
import EngineUpgradeBanner from './components/EngineUpgradeBanner'
import HomePage from './pages/HomePage'
import OnboardingPage from './pages/OnboardingPage'
import SessionPage from './pages/SessionPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import RehabPage from './pages/RehabPage'
import CalendarPage from './pages/CalendarPage'
import { useEngineVersionCheck } from './hooks/useEngineVersionCheck'
import { repairOrphanedNotebookEntries } from './utils/notebook-migration'

function App() {
  const user = useLiveQuery(async () => (await db.userProfiles.toCollection().first()) ?? null)
  const engineCheck = useEngineVersionCheck(user?.id)

  // One-shot repair: realign notebookEntries.exerciseId with the current
  // catalog when an old backup import re-attributed auto-increment ids.
  // Idempotent (localStorage-flagged) and non-blocking — useLiveQuery
  // subscribers see the corrected ids on the next tick.
  const migrationRan = useRef(false)
  useEffect(() => {
    if (migrationRan.current) return
    if (!user?.id) return
    migrationRan.current = true
    repairOrphanedNotebookEntries()
      .then((fixed) => { if (fixed > 0) console.log(`[notebook-migration] fixed ${fixed} entries`) })
      .catch((err) => console.error('[notebook-migration] failed', err))
  }, [user?.id])

  // Loading state
  if (user === undefined) return null

  // No user profile — show onboarding
  if (!user) return <OnboardingPage />

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-[var(--nav-h)]">
      {engineCheck.upgraded && (
        <EngineUpgradeBanner
          fromVersion={engineCheck.fromVersion}
          toVersion={engineCheck.toVersion}
          onDismiss={engineCheck.dismiss}
        />
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/rehab" element={<RehabPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <BottomNav />
    </div>
  )
}

export default function AppWrapper() {
  return (
    <BrowserRouter basename="/musculation">
      <App />
    </BrowserRouter>
  )
}
