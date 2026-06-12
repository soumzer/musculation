import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/**
 * Hook to read/write a persistent note for a given exercise.
 * Notes are stored per user+exercise in the exerciseNotes table.
 */
export function useExerciseNote(userId: number, exerciseId: number) {
  const existing = useLiveQuery(
    () => db.exerciseNotes
      .where('[userId+exerciseId]')
      .equals([userId, exerciseId])
      .first(),
    [userId, exerciseId],
  )

  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [syncedNote, setSyncedNote] = useState<string | null>(null)

  // Synchronise le brouillon quand la valeur DB change et qu'on n'édite pas —
  // ajustement d'état pendant le render (pattern React officiel), pas d'effect.
  if (existing && !dirty && existing.note !== syncedNote) {
    setDraft(existing.note)
    setSyncedNote(existing.note)
  }

  const save = useCallback(async (text: string) => {
    const trimmed = text.trim()
    const now = new Date()
    if (existing?.id) {
      await db.exerciseNotes.update(existing.id, { note: trimmed, updatedAt: now })
    } else if (trimmed) {
      await db.exerciseNotes.add({
        userId,
        exerciseId,
        note: trimmed,
        createdAt: now,
        updatedAt: now,
      })
    }
    setDirty(false)
  }, [userId, exerciseId, existing])

  const update = useCallback((text: string) => {
    setDraft(text)
    setDirty(true)
  }, [])

  return { note: draft, update, save, isDirty: dirty }
}
