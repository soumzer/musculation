import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppWrapper from './App.tsx'
import { seedExercises } from './data/seed'

// Demande la persistance du stockage : sans ça, le navigateur (surtout iOS
// Safari, après ~7 jours sans visite) peut purger IndexedDB — la seule copie
// des données d'entraînement. Best effort : un refus n'est pas bloquant.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

// Seed the exercise catalog on app startup (idempotent — no-op if already populated)
;(async () => {
  try {
    await seedExercises()
  } catch (error) {
    console.error('Failed to seed exercises:', error)
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>,
)
