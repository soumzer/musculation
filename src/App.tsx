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

function App() {
  const user = useLiveQuery(async () => (await db.userProfiles.toCollection().first()) ?? null)
  const engineCheck = useEngineVersionCheck(user?.id)

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
