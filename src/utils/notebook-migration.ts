import { db } from '../db'

const MIGRATION_FLAG = 'notebookMigrationV1Done'

/**
 * One-shot repair for notebookEntries that have a stale exerciseId.
 *
 * Background: a backup import (or a full DB reseed) can re-attribute the
 * catalog's auto-increment ids — so an entry logged with exerciseId=272
 * (which used to be "Leg curl") may end up pointing to "Élévations latérales"
 * after the re-id. The entry's stored exerciseName is still correct, only
 * the foreign key is wrong.
 *
 * Strategy: for each entry, if exoById.get(entry.exerciseId).name !==
 * entry.exerciseName, look up the catalog by entry.exerciseName (or any of
 * its previousNames) and update the entry's exerciseId. Idempotent and
 * guarded by a localStorage flag so it doesn't churn on every boot.
 */
export async function repairOrphanedNotebookEntries(): Promise<number> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_FLAG) === 'true') {
    return 0
  }

  const exos = await db.exercises.toArray()
  if (exos.length === 0) return 0

  const exoById = new Map<number, typeof exos[number]>()
  for (const ex of exos) if (ex.id !== undefined) exoById.set(ex.id, ex)

  // name → id lookup. Includes previousNames so a rename-then-orphan combo
  // also resolves correctly.
  const nameToId = new Map<string, number>()
  for (const ex of exos) {
    if (ex.id === undefined) continue
    nameToId.set(ex.name.toLowerCase(), ex.id)
    for (const prev of ex.previousNames ?? []) {
      const key = prev.toLowerCase()
      if (!nameToId.has(key)) nameToId.set(key, ex.id)
    }
  }

  const entries = await db.notebookEntries.toArray()
  let fixed = 0
  await db.transaction('rw', db.notebookEntries, async () => {
    for (const entry of entries) {
      if (!entry.exerciseName) continue
      const current = exoById.get(entry.exerciseId)
      if (current && current.name.toLowerCase() === entry.exerciseName.toLowerCase()) continue
      const correctId = nameToId.get(entry.exerciseName.toLowerCase())
      if (correctId === undefined) continue
      if (correctId === entry.exerciseId) continue
      if (entry.id === undefined) continue
      await db.notebookEntries.update(entry.id, { exerciseId: correctId })
      fixed++
    }
  })

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MIGRATION_FLAG, 'true')
  }
  return fixed
}
