import { db } from '../db'
import { exerciseCatalog } from './exercises'

/**
 * Synchronise la table `exercises` avec le catalogue source au démarrage.
 *
 * Comportement :
 * - Premier lancement (DB vide) → insère tout le catalogue en bulk.
 * - Lancements suivants → match par `name` :
 *     - exo présent en DB et inchangé → no-op
 *     - exo présent mais un champ diffère (alternatives, instructions, muscles,
 *       contre-indications, équipement, etc.) → update en place, **id préservé**
 *       pour ne pas casser les références dans WorkoutPrograms / NotebookEntries.
 *     - exo absent en DB (nouvel ajout dans `exercises.ts`) → insertion.
 *     - exo en DB mais plus dans le catalogue source → laissé tel quel (les
 *       historiques peuvent encore le référencer ; suppression manuelle au cas
 *       par cas si vraiment nécessaire).
 *
 * Fast-path : on hash le catalogue source et on stocke le hash en localStorage.
 * Si le hash n'a pas changé depuis le dernier sync réussi, on saute la boucle.
 */

const CATALOG_HASH_KEY = 'catalogHash'

function hashCatalog(): string {
  // Hash léger basé sur JSON.stringify de tout le catalogue. Pas cryptographique —
  // l'objectif est juste de détecter "le catalogue source a-t-il changé".
  const str = JSON.stringify(exerciseCatalog)
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}

function exerciseFieldsEqual(
  a: typeof exerciseCatalog[number],
  b: typeof exerciseCatalog[number],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export async function seedExercises(): Promise<void> {
  const sourceHash = hashCatalog()
  const lastHash =
    typeof localStorage !== 'undefined' ? localStorage.getItem(CATALOG_HASH_KEY) : null

  const count = await db.exercises.count()

  // Premier lancement : bulk insert.
  if (count === 0) {
    await db.exercises.bulkAdd(exerciseCatalog)
    if (typeof localStorage !== 'undefined') localStorage.setItem(CATALOG_HASH_KEY, sourceHash)
    return
  }

  // Fast-path : rien n'a bougé côté source depuis le dernier sync OK.
  if (lastHash === sourceHash) return

  // Sync incrémentiel.
  const dbExercises = await db.exercises.toArray()
  const dbByName = new Map(dbExercises.map((e) => [e.name, e]))

  await db.transaction('rw', db.exercises, async () => {
    for (const sourceEx of exerciseCatalog) {
      const existing = dbByName.get(sourceEx.name)
      if (!existing) {
        await db.exercises.add(sourceEx)
        continue
      }
      // Compare champ-à-champ en ignorant l'id (auto-assigné par Dexie).
      const existingNoId = { ...existing }
      delete (existingNoId as { id?: number }).id
      if (!exerciseFieldsEqual(existingNoId, sourceEx)) {
        await db.exercises.update(existing.id!, { ...sourceEx })
      }
    }
  })

  if (typeof localStorage !== 'undefined') localStorage.setItem(CATALOG_HASH_KEY, sourceHash)
}
