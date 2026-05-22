import type {
  Exercise,
  HealthCondition,
  GymEquipment,
  ProgramSession,
  ProgramExercise,
} from '../db/types'

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------

/** Estimated working time per set in seconds (execution + transition). */
const WORK_SECONDS_PER_SET = 35

/**
 * Equipment tags that do NOT enable the loaded gym splits — low-load
 * accessories and cardio gear. A user whose available equipment is entirely
 * within this set gets the dedicated bodyweight program rather than a
 * mostly-empty gym split.
 *
 * NB: `pull_up_bar` / `dip_station` are intentionally NOT here — the
 * "Street Workout" option enables real pull/dip strength work.
 */
const NON_STRENGTH_EQUIPMENT = new Set<string>([
  'mat', 'resistance_band', 'prowler', 'foam_roller',
  'treadmill', 'bike', 'elliptical',
])

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

export interface ProgramGeneratorInput {
  userId: number
  conditions: HealthCondition[]
  equipment: GymEquipment[]
  daysPerWeek: number
  minutesPerSession: number
  /** Exercise IDs to exclude from selection (used by refresh to get new variations) */
  excludeExerciseIds?: number[]
}

export interface GeneratedProgram {
  name: string
  type: 'upper_lower' | 'full_body' | 'push_pull_legs' | 'bodyweight'
  sessions: ProgramSession[]
}

// ---------------------------------------------------------------------------
// 1. Filter exercises by equipment availability
// ---------------------------------------------------------------------------

/**
 * Returns exercises whose `equipmentNeeded` items are all present in the
 * available equipment list.
 *
 * - Bodyweight exercises (empty `equipmentNeeded`) always pass.
 * - Equipment is matched by comparing exercise equipment tags against the
 *   `name` field of available `GymEquipment` entries (only those with
 *   `isAvailable === true`).
 */
export function filterExercisesByEquipment(
  exercises: Exercise[],
  equipment: GymEquipment[],
): Exercise[] {
  const availableNames = new Set(
    equipment.filter((e) => e.isAvailable).map((e) => e.name),
  )

  return exercises.filter((exercise) => {
    // Bodyweight / no equipment → always included
    if (exercise.equipmentNeeded.length === 0) return true
    // Every required piece of equipment must be available
    return exercise.equipmentNeeded.every((tag) => availableNames.has(tag))
  })
}

// ---------------------------------------------------------------------------
// 2. (Removed) Contraindication filtering
// ---------------------------------------------------------------------------
// Contraindication filtering has been removed from the program generator.
// The program always generates the same exercises regardless of health conditions.
// Rehab exercises are proposed separately on the rehab page.
// Users manually skip exercises during workouts if they cause pain.

// ---------------------------------------------------------------------------
// 3. Determine the split type based on training days per week
// ---------------------------------------------------------------------------

/**
 * - 2-3 days/week → full_body
 * - 4 days/week   → upper_lower
 * - 5-6 days/week → push_pull_legs
 */
export function determineSplit(
  daysPerWeek: number,
): 'full_body' | 'upper_lower' | 'push_pull_legs' {
  if (daysPerWeek <= 3) return 'full_body'
  if (daysPerWeek === 4) return 'upper_lower'
  return 'push_pull_legs'
}

// ---------------------------------------------------------------------------
// 4. Muscle-based exercise matching helpers
// ---------------------------------------------------------------------------

/** Exercises whose primaryMuscles include at least one of the given muscles */
function exercisesForMuscles(exercises: Exercise[], muscles: string[]): Exercise[] {
  return exercises.filter((e) =>
    e.primaryMuscles.some((m) => muscles.some((target) => m.toLowerCase().includes(target.toLowerCase()))),
  )
}

/** Find exercise by exact or partial name match (case-insensitive) */
function findByName(exercises: Exercise[], nameFragment: string): Exercise | undefined {
  const lower = nameFragment.toLowerCase()
  return (
    exercises.find((e) => e.name.toLowerCase() === lower) ??
    exercises.find((e) => e.name.toLowerCase().includes(lower))
  )
}

/** Shuffle array in place using Fisher-Yates algorithm */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Pick a random exercise from a source that is not already used, add it to usedIds */
function pickOne(source: Exercise[], usedIds: Set<number>): Exercise | undefined {
  // Shuffle to get variety on each generation
  const shuffled = shuffleArray(source)
  for (const ex of shuffled) {
    if (ex.id === undefined) continue
    if (usedIds.has(ex.id)) continue
    usedIds.add(ex.id)
    return ex
  }
  return undefined
}

/** Pick the first exercise matching name fragment, falling back to the source list */
function pickPreferred(
  nameFragment: string,
  fallbackSource: Exercise[],
  usedIds: Set<number>,
): Exercise | undefined {
  const preferred = findByName(fallbackSource, nameFragment)
  if (preferred && preferred.id !== undefined) {
    if (!usedIds.has(preferred.id)) {
      usedIds.add(preferred.id)
      return preferred
    }
  }
  return pickOne(fallbackSource, usedIds)
}



// ---------------------------------------------------------------------------
// 4d. Session slot definition for structured session building
// ---------------------------------------------------------------------------

export interface ExerciseSlot {
  /** Human-readable description of this slot */
  label: string
  /** Function that returns candidate exercises for this slot */
  candidates: (pool: Exercise[]) => Exercise[]
  /** Preferred exercise name fragment to try first */
  preferredName?: string
  /** Prescribed sets */
  sets: number
  /** Prescribed target reps */
  reps: number
  /** Rest in seconds */
  rest: number
}

/**
 * Estimate session duration in minutes from ProgramExercise[].
 * Formula:
 *   Per exercise: sets × (WORK_SECONDS_PER_SET + restSeconds) + 90s transition
 *   Total = sum / 60 + 10 (5 min warmup + 5 min cooldown)
 */
export function estimateSessionMinutes(exercises: ProgramExercise[]): number {
  let totalSec = 0
  for (const ex of exercises) {
    const exerciseTime = ex.sets * (WORK_SECONDS_PER_SET + ex.restSeconds)
    const transitionTime = 90 // ~1.5 min per exercise for setup/transition
    totalSec += exerciseTime + transitionTime
  }
  return Math.round(totalSec / 60) + 10 // +10 min for warmup + cooldown
}

function buildStructuredSession(
  name: string,
  order: number,
  slots: ExerciseSlot[],
  pool: Exercise[],
  intensity?: import('../db/types').SessionIntensity,
): ProgramSession {
  const usedIds = new Set<number>()
  const programExercises: ProgramExercise[] = []
  let exerciseOrder = 1

  for (const slot of slots) {
    const allCandidates = slot.candidates(pool).filter((e) => e.id !== undefined && !usedIds.has(e.id))
    let picked: Exercise | undefined

    if (slot.preferredName) {
      picked = pickPreferred(slot.preferredName, allCandidates, usedIds)
    } else {
      picked = pickOne(allCandidates, usedIds)
    }

    // Fallback — the slot's specific candidate pool is empty (e.g. all its
    // exercises were filtered out by the user's equipment). Rather than
    // dropping the slot (which leaves the session short), fill it with any
    // unused non-rehab exercise, preferring compounds.
    if (!picked) {
      const unused = pool.filter(
        (e) => e.id !== undefined && !usedIds.has(e.id) && !e.isRehab,
      )
      const compounds = unused.filter((e) => e.category === 'compound')
      picked = pickOne(compounds.length > 0 ? compounds : unused, usedIds)
    }

    if (!picked) {
      console.warn(`[program-generator] No exercise found for slot "${slot.label}" — pool exhausted`)
      continue
    }

    // Adjust reps and rest based on session intensity
    // Isolation exercises are ALWAYS volume (high reps, moderate rest)
    let reps = slot.reps
    let rest = slot.rest
    let sets = slot.sets

    const isIsolationOrCore = picked.category === 'isolation' || picked.category === 'core'
    if (intensity === 'heavy' && !isIsolationOrCore) {
      // Heavy compounds: fewer reps, 120s rest (standard non-powerlifting), +1 set
      reps = Math.min(slot.reps, 6)
      rest = 120
      sets = Math.max(slot.sets, 4)
    } else if (intensity === 'moderate' && !isIsolationOrCore) {
      // Moderate compounds: keep slot reps, cap rest at 90s
      rest = Math.min(slot.rest, 90)
    } else if ((intensity === 'volume' || isIsolationOrCore)) {
      // Volume (or isolation in any session): more reps, less rest
      reps = Math.max(slot.reps, picked.category === 'compound' ? 12 : 15)
      rest = Math.min(slot.rest, 90)
    }

    // Isometric exercises (plank, side plank) use time instead of reps
    const isIsometric = picked.tags.includes('isometric')
    if (isIsometric) {
      reps = 30 // 30 seconds per set
      sets = 3
      rest = 60
    }

    programExercises.push({
      exerciseId: picked.id ?? 0,
      order: exerciseOrder++,
      sets,
      targetReps: reps,
      restSeconds: rest,
      isRehab: picked.isRehab,
      isTimeBased: isIsometric,
    })
  }

  return { name, order, intensity, exercises: programExercises }
}

// ---------------------------------------------------------------------------
// 5. Build sessions per split type
// ---------------------------------------------------------------------------

function buildFullBodySessions(
  available: Exercise[],
  daysPerWeek: number,
): ProgramSession[] {
  const nonRehab = available.filter((e) => !e.isRehab)

  // -----------------------------------------------------------------------
  // Categorize exercises by muscle group and movement pattern
  // -----------------------------------------------------------------------

  // Quad compounds
  const quadCompounds = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['quadriceps']).length > 0,
  )

  // Horizontal push: pectoraux compound
  const horizontalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Horizontal pull: dorsaux compound (rowing)
  const horizontalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && !e.name.toLowerCase().includes('pulldown')
      && !e.name.toLowerCase().includes('traction')
      && !e.name.toLowerCase().includes('pull-up'),
  )

  // Vertical push: deltoïdes compound
  const verticalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['deltoïdes']).length > 0,
  )

  // Vertical pull: lat pulldown or tractions
  const verticalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && (e.name.toLowerCase().includes('pulldown')
        || e.name.toLowerCase().includes('traction')
        || e.name.toLowerCase().includes('pull-up')
        || e.name.toLowerCase().includes('tirage vertical')),
  )

  // Lateral raises
  const lateralRaises = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('élévations latérales') || e.name.toLowerCase().includes('lateral raise'),
  )

  // Core exercises
  const coreExercises = nonRehab.filter((e) => e.category === 'core')

  // Hip hinge: ischio-jambiers compound lower_body
  const hipHinges = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['ischio-jambiers']).length > 0
      && e.tags.includes('lower_body'),
  )

  // Chest accessories: pectoraux isolation
  const chestAccessories = nonRehab.filter(
    (e) => (e.category === 'isolation') && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Unilateral legs
  const unilateralLegs = nonRehab.filter(
    (e) => e.category === 'compound' && e.tags.includes('unilateral') && e.tags.includes('lower_body'),
  )

  // Unilateral pull
  const unilateralPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && e.tags.includes('unilateral'),
  )

  // Biceps exercises (for Full Body C to avoid face pull 3x/week)
  const bicepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['biceps', 'brachial']).length > 0
      && (e.category === 'isolation'),
  )

  // Leg curl
  const legCurls = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('leg curl'),
  )

  // Hip thrust + glute bridge (compound only, excludes rehab variants)
  const hipThrusts = nonRehab.filter(
    (e) => e.category === 'compound' && (
      e.name.toLowerCase().includes('hip thrust') ||
      e.name.toLowerCase().includes('glute bridge')
    ),
  )

  // Triceps exercises
  const tricepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['triceps']).length > 0
      && (e.category === 'isolation'),
  )

  // -----------------------------------------------------------------------
  // Full Body A
  // -----------------------------------------------------------------------

  // Full Body A: 6 compounds covering all major patterns
  const fullBodyASlots: ExerciseSlot[] = [
    {
      label: 'Quad compound',
      candidates: () => quadCompounds,
      preferredName: 'leg press',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Horizontal push',
      candidates: () => horizontalPush,
      preferredName: 'développé couché',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Horizontal pull',
      candidates: () => horizontalPull,
      preferredName: 'rowing barre',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Vertical push',
      candidates: () => verticalPush,
      preferredName: 'développé militaire',
      sets: 3,
      reps: 8,
      rest: 120,
    },
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 3,
      reps: 8,
      rest: 120,
    },
    {
      label: 'Ischios/Fessiers',
      candidates: () => [...hipHinges, ...legCurls],
      preferredName: 'soulevé de terre roumain',
      sets: 3,
      reps: 10,
      rest: 90,
    },
  ]

  // -----------------------------------------------------------------------
  // Full Body B
  // -----------------------------------------------------------------------

  // Full Body B: 3 compounds + 4 isolations = 7 exercices (volume profile)
  const fullBodyBSlots: ExerciseSlot[] = [
    {
      label: 'Quad unilatéral',
      candidates: () => unilateralLegs,
      preferredName: 'fentes',
      sets: 3,
      reps: 12,
      rest: 90,
    },
    {
      label: 'Vertical push',
      candidates: () => verticalPush,
      preferredName: 'développé militaire',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Chest accessory',
      candidates: () => [...chestAccessories, ...horizontalPush],
      preferredName: 'développé incliné',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Fessiers',
      candidates: () => [...hipThrusts, ...hipHinges],
      preferredName: 'hip thrust',
      sets: 3,
      reps: 12,
      rest: 90,
    },
    {
      label: 'Biceps',
      candidates: () => bicepsExercises,
      preferredName: 'curl biceps',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Triceps',
      candidates: () => tricepsExercises,
      preferredName: 'extension poulie haute',
      sets: 3,
      reps: 12,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Full Body C (if 3 days)
  // -----------------------------------------------------------------------

  // Full Body C: 3 compounds + 3 isolations = 6 exercices (moderate, 1 per pattern)
  const fullBodyCSlots: ExerciseSlot[] = [
    {
      label: 'Unilateral legs',
      candidates: () => unilateralLegs,
      preferredName: 'fentes',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Incline push',
      candidates: () => [...chestAccessories, ...horizontalPush],
      preferredName: 'développé incliné',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Unilateral pull',
      candidates: () => [...unilateralPull, ...horizontalPull],
      preferredName: 'rowing unilatéral',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Élévations latérales',
      candidates: () => lateralRaises,
      preferredName: 'élévations latérales',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Ischios isolation',
      candidates: () => legCurls,
      preferredName: 'leg curl',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Core',
      candidates: () => coreExercises,
      preferredName: 'planche latérale',
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Build sessions based on daysPerWeek (2 or 3)
  // -----------------------------------------------------------------------

  // DUP: Day A = heavy, Day B = volume, Day C = moderate
  const sessions: ProgramSession[] = [
    buildStructuredSession('Full Body A — Force', 1, fullBodyASlots, available, 'heavy'),
    buildStructuredSession('Full Body B — Volume', 2, fullBodyBSlots, available, 'volume'),
  ]

  if (daysPerWeek >= 3) {
    sessions.push(
      buildStructuredSession('Full Body C — Moderé', 3, fullBodyCSlots, available, 'moderate'),
    )
  }

  return sessions
}

function buildUpperLowerSessions(
  available: Exercise[],
): ProgramSession[] {
  const nonRehab = available.filter((e) => !e.isRehab)

  // -----------------------------------------------------------------------
  // Categorize exercises by muscle group and movement pattern
  // -----------------------------------------------------------------------

  // Quad-dominant compounds: primaryMuscles includes 'quadriceps'
  const quadCompounds = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['quadriceps']).length > 0,
  )

  // Unilateral leg exercises (fentes, bulgare)
  const unilateralLegs = nonRehab.filter(
    (e) => e.category === 'compound' && e.tags.includes('unilateral') && e.tags.includes('lower_body'),
  )

  // Leg curl
  const legCurls = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('leg curl'),
  )

  // Quad isolation (leg extension)
  const quadIsolation = nonRehab.filter(
    (e) => e.category === 'isolation' && exercisesForMuscles([e], ['quadriceps']).length > 0,
  )

  // Calf exercises
  const calves = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['gastrocnémiens', 'soléaire', 'mollets']).length > 0
      && e.tags.includes('calves'),
  )

  // Hip hinge: primaryMuscles includes 'ischio-jambiers' AND category is 'compound'
  const hipHinges = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['ischio-jambiers']).length > 0
      && e.tags.includes('lower_body'),
  )

  // Hip thrust + glute bridge (compound only, excludes rehab variants)
  const hipThrusts = nonRehab.filter(
    (e) => e.category === 'compound' && (
      e.name.toLowerCase().includes('hip thrust') ||
      e.name.toLowerCase().includes('glute bridge')
    ),
  )

  // Horizontal push: pectoraux compound
  const horizontalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Vertical push: deltoïdes compound
  const verticalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['deltoïdes']).length > 0,
  )

  // Lateral raises
  const lateralRaises = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('élévations latérales') || e.name.toLowerCase().includes('lateral raise'),
  )

  // Chest accessories: pectoraux isolation (pec deck, écartés, crossover)
  const chestAccessories = nonRehab.filter(
    (e) => (e.category === 'isolation') && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Face pull (non-rehab version)
  const facePulls = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('face pull'),
  )

  // Horizontal pull: dorsaux compound (rowing)
  const horizontalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && !e.name.toLowerCase().includes('pulldown')
      && !e.name.toLowerCase().includes('traction')
      && !e.name.toLowerCase().includes('pull-up'),
  )

  // Unilateral pull (rowing unilatéral)
  const unilateralPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && e.tags.includes('unilateral'),
  )

  // Vertical pull: lat pulldown or tractions
  const verticalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && (e.name.toLowerCase().includes('pulldown')
        || e.name.toLowerCase().includes('traction')
        || e.name.toLowerCase().includes('pull-up')
        || e.name.toLowerCase().includes('tirage vertical')),
  )

  // Biceps exercises
  const bicepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['biceps', 'brachial']).length > 0
      && (e.category === 'isolation'),
  )

  // Triceps exercises
  const tricepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['triceps']).length > 0
      && (e.category === 'isolation'),
  )

  // -----------------------------------------------------------------------
  // Lower 1 — Quadriceps Focus
  // -----------------------------------------------------------------------

  // Lower 1: 3 compounds + 3 isolations = 6 exercices
  const lower1Slots: ExerciseSlot[] = [
    {
      label: 'Quad compound',
      candidates: () => quadCompounds,
      preferredName: 'leg press',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Unilateral leg',
      candidates: () => unilateralLegs,
      preferredName: 'fentes',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Hip hinge',
      candidates: () => hipHinges,
      preferredName: 'soulevé de terre roumain',
      sets: 3,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Leg extension',
      candidates: () => quadIsolation,
      preferredName: 'leg extension',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Leg curl',
      candidates: () => legCurls,
      preferredName: 'leg curl',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Fessiers',
      candidates: () => [...hipThrusts, ...hipHinges],
      preferredName: 'hip thrust',
      sets: 3,
      reps: 12,
      rest: 90,
    },
  ]

  // -----------------------------------------------------------------------
  // Upper 1 — Push Focus (with pull for 2x/week back frequency)
  // -----------------------------------------------------------------------

  // Upper 1: 4 compounds + 2 isolations = 6 exercices
  const upper1Slots: ExerciseSlot[] = [
    {
      label: 'Horizontal push',
      candidates: () => horizontalPush,
      preferredName: 'développé couché',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Horizontal pull',
      candidates: () => horizontalPull,
      preferredName: 'rowing barre',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Vertical push',
      candidates: () => verticalPush,
      preferredName: 'développé militaire',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 3,
      reps: 8,
      rest: 120,
    },
    {
      label: 'Biceps',
      candidates: () => bicepsExercises,
      preferredName: 'curl biceps',
      sets: 3,
      reps: 10,
      rest: 90,
    },
    {
      label: 'Triceps',
      candidates: () => tricepsExercises,
      preferredName: 'extension poulie haute',
      sets: 3,
      reps: 12,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Lower 2 — Hamstring/Glute Focus
  // -----------------------------------------------------------------------

  // Lower 2: 3 compounds + 3 isolations = 6 exercices (volume)
  const lower2Slots: ExerciseSlot[] = [
    {
      label: 'Quad unilatéral',
      candidates: () => unilateralLegs,
      preferredName: 'fentes',
      sets: 3,
      reps: 12,
      rest: 90,
    },
    {
      label: 'Hip thrust',
      candidates: () => hipThrusts,
      preferredName: 'hip thrust',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Quad compound',
      candidates: () => quadCompounds,
      preferredName: 'leg press',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Leg extension',
      candidates: () => quadIsolation,
      preferredName: 'leg extension',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Leg curl',
      candidates: () => legCurls,
      preferredName: 'leg curl',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Calf',
      candidates: () => calves,
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Upper 2 — Pull Focus (with push for 2x/week chest frequency)
  // -----------------------------------------------------------------------

  // Upper 2: 3 compounds + 5 isolations = 8 exercices (volume)
  const upper2Slots: ExerciseSlot[] = [
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Incline or chest compound',
      candidates: () => [...chestAccessories, ...horizontalPush],
      preferredName: 'développé incliné',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Unilateral pull',
      candidates: () => [...unilateralPull, ...horizontalPull],
      preferredName: 'rowing unilatéral',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Écarté pecs',
      candidates: () => chestAccessories,
      preferredName: 'pec deck',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Élévations latérales',
      candidates: () => lateralRaises,
      preferredName: 'élévations latérales',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Face pull',
      candidates: () => facePulls,
      preferredName: 'face pull',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Biceps',
      candidates: () => bicepsExercises,
      preferredName: 'curl biceps',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Triceps',
      candidates: () => tricepsExercises,
      preferredName: 'extension poulie haute',
      sets: 3,
      reps: 12,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Build the 4 sessions (order: Lower 1, Upper 1, Lower 2, Upper 2)
  // -----------------------------------------------------------------------

  // DUP: Session 1 & 2 = heavy (fewer reps, more weight)
  //      Session 3 & 4 = volume (more reps, less weight)
  const sessions: ProgramSession[] = [
    buildStructuredSession('Lower 1 — Force', 1, lower1Slots, available, 'heavy'),
    buildStructuredSession('Upper 1 — Force', 2, upper1Slots, available, 'heavy'),
    buildStructuredSession('Lower 2 — Volume', 3, lower2Slots, available, 'volume'),
    buildStructuredSession('Upper 2 — Volume', 4, upper2Slots, available, 'volume'),
  ]

  return sessions
}

function buildPushPullLegsSessions(
  available: Exercise[],
): ProgramSession[] {
  const nonRehab = available.filter((e) => !e.isRehab)

  // -----------------------------------------------------------------------
  // Categorize exercises by muscle group and movement pattern
  // -----------------------------------------------------------------------

  // Horizontal push: pectoraux compound
  const horizontalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Vertical push: deltoïdes compound
  const verticalPush = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['deltoïdes']).length > 0,
  )

  // Chest accessories: pectoraux isolation
  const chestAccessories = nonRehab.filter(
    (e) => (e.category === 'isolation') && exercisesForMuscles([e], ['pectoraux']).length > 0,
  )

  // Lateral raises
  const lateralRaises = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('élévations latérales') || e.name.toLowerCase().includes('lateral raise'),
  )

  // Face pull (non-rehab version)
  const facePulls = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('face pull'),
  )

  // Horizontal pull: dorsaux compound (rowing, not pulldown/traction)
  const horizontalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && !e.name.toLowerCase().includes('pulldown')
      && !e.name.toLowerCase().includes('traction')
      && !e.name.toLowerCase().includes('pull-up'),
  )

  // Unilateral pull (rowing unilatéral)
  const unilateralPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['dorsaux', 'rhomboïdes']).length > 0
      && e.tags.includes('unilateral'),
  )

  // Vertical pull: lat pulldown or tractions
  const verticalPull = nonRehab.filter(
    (e) => e.category === 'compound'
      && (e.name.toLowerCase().includes('pulldown')
        || e.name.toLowerCase().includes('traction')
        || e.name.toLowerCase().includes('pull-up')
        || e.name.toLowerCase().includes('tirage vertical')),
  )

  // Biceps exercises
  const bicepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['biceps', 'brachial']).length > 0
      && (e.category === 'isolation'),
  )

  // Triceps exercises
  const tricepsExercises = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['triceps']).length > 0
      && (e.category === 'isolation'),
  )

  // Quad compounds
  const quadCompounds = nonRehab.filter(
    (e) => e.category === 'compound' && exercisesForMuscles([e], ['quadriceps']).length > 0,
  )

  // Unilateral legs
  const unilateralLegs = nonRehab.filter(
    (e) => e.category === 'compound' && e.tags.includes('unilateral') && e.tags.includes('lower_body'),
  )

  // Leg curl
  const legCurls = nonRehab.filter(
    (e) => e.name.toLowerCase().includes('leg curl'),
  )

  // Quad isolation (leg extension)
  const quadIsolation = nonRehab.filter(
    (e) => e.category === 'isolation' && exercisesForMuscles([e], ['quadriceps']).length > 0,
  )

  // Calf exercises
  const calves = nonRehab.filter(
    (e) => exercisesForMuscles([e], ['gastrocnémiens', 'soléaire', 'mollets']).length > 0
      && e.tags.includes('calves'),
  )

  // Core exercises
  const coreExercises = nonRehab.filter((e) => e.category === 'core')

  // Hip hinge: ischio-jambiers compound lower_body
  const hipHinges = nonRehab.filter(
    (e) => e.category === 'compound'
      && exercisesForMuscles([e], ['ischio-jambiers']).length > 0
      && e.tags.includes('lower_body'),
  )

  // Hip thrust + glute bridge (compound only, excludes rehab variants)
  const hipThrusts = nonRehab.filter(
    (e) => e.category === 'compound' && (
      e.name.toLowerCase().includes('hip thrust') ||
      e.name.toLowerCase().includes('glute bridge')
    ),
  )

  // Rear delt isolation (oiseau / reverse fly — NOT face pull)
  const rearDeltExercises = nonRehab.filter(
    (e) => e.category === 'isolation' && e.tags.includes('rear_delt'),
  )

  // -----------------------------------------------------------------------
  // Push A — Horizontal push focus
  // -----------------------------------------------------------------------

  // Push A: 3 compounds + 2 isolations = 5 exercices
  const pushASlots: ExerciseSlot[] = [
    {
      label: 'Horizontal push',
      candidates: () => horizontalPush,
      preferredName: 'développé couché',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Vertical push',
      candidates: () => verticalPush,
      preferredName: 'développé militaire',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Incline push',
      candidates: () => [...chestAccessories, ...horizontalPush],
      preferredName: 'développé incliné',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Élévations latérales',
      candidates: () => lateralRaises,
      preferredName: 'élévations latérales',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Face pull',
      candidates: () => facePulls,
      preferredName: 'face pull',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Triceps',
      candidates: () => tricepsExercises,
      preferredName: 'extension poulie haute',
      sets: 3,
      reps: 12,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Push B — Vertical push focus
  // -----------------------------------------------------------------------

  // Push B: 3 compounds + 2 isolations = 5 exercices
  const pushBSlots: ExerciseSlot[] = [
    {
      label: 'Vertical push',
      candidates: () => verticalPush,
      preferredName: 'développé militaire',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Horizontal push',
      candidates: () => horizontalPush,
      preferredName: 'développé couché',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Incline or chest accessory',
      candidates: () => [...chestAccessories, ...horizontalPush],
      preferredName: 'développé incliné',
      sets: 4,
      reps: 12,
      rest: 150,
    },
    {
      label: 'Élévations latérales',
      candidates: () => lateralRaises,
      preferredName: 'élévations latérales',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Face pull',
      candidates: () => facePulls,
      preferredName: 'face pull',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Triceps',
      candidates: () => tricepsExercises,
      preferredName: 'extension poulie haute',
      sets: 3,
      reps: 12,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Pull A — Horizontal pull focus
  // -----------------------------------------------------------------------

  // Pull A: 3 compounds + 3 isolations + 1 core = 7 exercices
  const pullASlots: ExerciseSlot[] = [
    {
      label: 'Horizontal pull',
      candidates: () => horizontalPull,
      preferredName: 'rowing barre',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Unilateral pull',
      candidates: () => [...unilateralPull, ...horizontalPull],
      preferredName: 'rowing unilatéral',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Rear delt',
      candidates: () => rearDeltExercises,
      preferredName: 'oiseau haltères',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Biceps',
      candidates: () => bicepsExercises,
      preferredName: 'curl biceps',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Core',
      candidates: () => coreExercises,
      preferredName: 'pallof press',
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Pull B — Vertical pull focus
  // -----------------------------------------------------------------------

  // Pull B: 3 compounds + 3 isolations + 1 core = 7 exercices
  const pullBSlots: ExerciseSlot[] = [
    {
      label: 'Vertical pull',
      candidates: () => verticalPull,
      preferredName: 'lat pulldown',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Horizontal pull',
      candidates: () => horizontalPull,
      preferredName: 'rowing machine',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Unilateral pull',
      candidates: () => [...unilateralPull, ...horizontalPull],
      preferredName: 'rowing haltère',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Rear delt',
      candidates: () => rearDeltExercises,
      preferredName: 'oiseau câble',
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Biceps',
      candidates: () => bicepsExercises,
      preferredName: 'curl marteau',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Core',
      candidates: () => coreExercises,
      preferredName: 'dead bug',
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Legs A — Quad Focus
  // -----------------------------------------------------------------------

  // Legs A: 3 compounds + 3 isolations + 1 core = 7 exercices
  const legsASlots: ExerciseSlot[] = [
    {
      label: 'Quad compound',
      candidates: () => quadCompounds,
      preferredName: 'leg press',
      sets: 4,
      reps: 8,
      rest: 150,
    },
    {
      label: 'Unilateral legs',
      candidates: () => unilateralLegs,
      preferredName: 'fentes',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Hip hinge',
      candidates: () => hipHinges,
      preferredName: 'soulevé de terre roumain',
      sets: 3,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Leg extension',
      candidates: () => quadIsolation,
      preferredName: 'leg extension',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Leg curl',
      candidates: () => legCurls,
      preferredName: 'leg curl',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Calf',
      candidates: () => calves,
      sets: 3,
      reps: 15,
      rest: 60,
    },
    {
      label: 'Core',
      candidates: () => coreExercises,
      preferredName: 'planche',
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Legs B — Hamstring/Glute Focus
  // -----------------------------------------------------------------------

  // Legs B: 3 compounds + 3 isolations = 6 exercices (volume, core on Legs A only)
  const legsBSlots: ExerciseSlot[] = [
    {
      label: 'Hip hinge',
      candidates: () => hipHinges,
      preferredName: 'soulevé de terre roumain',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Hip thrust',
      candidates: () => hipThrusts,
      preferredName: 'hip thrust',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Quad compound',
      candidates: () => quadCompounds,
      preferredName: 'leg press',
      sets: 4,
      reps: 10,
      rest: 150,
    },
    {
      label: 'Leg extension',
      candidates: () => quadIsolation,
      preferredName: 'leg extension',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Leg curl',
      candidates: () => legCurls,
      preferredName: 'leg curl',
      sets: 3,
      reps: 12,
      rest: 60,
    },
    {
      label: 'Calf',
      candidates: () => calves,
      sets: 3,
      reps: 15,
      rest: 60,
    },
  ]

  // -----------------------------------------------------------------------
  // Build the 6 sessions
  // -----------------------------------------------------------------------

  // DUP: A sessions = heavy, B sessions = volume
  return [
    buildStructuredSession('Push A — Force', 1, pushASlots, available, 'heavy'),
    buildStructuredSession('Pull A — Force', 2, pullASlots, available, 'heavy'),
    buildStructuredSession('Legs A — Force', 3, legsASlots, available, 'heavy'),
    buildStructuredSession('Push B — Volume', 4, pushBSlots, available, 'volume'),
    buildStructuredSession('Pull B — Volume', 5, pullBSlots, available, 'volume'),
    buildStructuredSession('Legs B — Volume', 6, legsBSlots, available, 'volume'),
  ]
}

// ---------------------------------------------------------------------------
// 7. Main orchestrator
// ---------------------------------------------------------------------------

const SPLIT_NAMES: Record<string, string> = {
  full_body: 'Programme Full Body',
  upper_lower: 'Programme Upper / Lower',
  push_pull_legs: 'Programme Push / Pull / Legs',
  sa_program: 'Programme SA (Spondylarthrite)',
  bodyweight_program: 'Programme Poids de Corps',
}

// ---------------------------------------------------------------------------
// SA-specific fixed program (Spondylarthrite Ankylosante)
// ---------------------------------------------------------------------------

/**
 * Fixed 2-session program for Spondylarthrite Ankylosante (SA).
 * All exercises are machine-based with back support to minimize spinal load.
 * Volume-only (12-15 reps), no heavy force work.
 */
function buildSAProgram(
  available: Exercise[],
): ProgramSession[] {
  // SA Session A: Push + Legs (8 exercises)
  const sessionAExercises = [
    { name: 'Leg press', sets: 3, reps: 15, rest: 90 },
    { name: 'Pull-through câble', sets: 3, reps: 15, rest: 90 },
    { name: 'Développé couché machine', sets: 3, reps: 15, rest: 90 },
    { name: 'Développé militaire machine', sets: 3, reps: 15, rest: 90 },
    { name: 'Élévations latérales', sets: 3, reps: 15, rest: 60 },
    { name: 'Leg extension', sets: 3, reps: 15, rest: 60 },
    { name: 'Extension triceps poulie haute', sets: 3, reps: 15, rest: 60 },
    { name: 'Pallof press', sets: 3, reps: 12, rest: 60 },
  ]

  // SA Session B: Pull + Legs (7 exercises)
  const sessionBExercises = [
    { name: 'Rowing machine (chest-supported)', sets: 3, reps: 15, rest: 90 },
    { name: 'Tirage vertical (lat pulldown)', sets: 3, reps: 15, rest: 90 },
    { name: 'Leg curl (ischio-jambiers)', sets: 3, reps: 15, rest: 60 },
    { name: 'Hip thrust barre', sets: 3, reps: 15, rest: 90 },
    { name: 'Face pull', sets: 3, reps: 15, rest: 60 },
    { name: 'Curl biceps câble', sets: 3, reps: 15, rest: 60 },
    { name: 'Dead bug', sets: 3, reps: 10, rest: 60 },
  ]

  const buildSASession = (
    name: string,
    order: number,
    exerciseSpecs: { name: string; sets: number; reps: number; rest: number }[],
  ): ProgramSession => {
    const programExercises: ProgramExercise[] = []
    let exerciseOrder = 1

    for (const spec of exerciseSpecs) {
      // Find exercise by name (exact or partial match)
      const exercise = available.find(
        (e) => e.name.toLowerCase() === spec.name.toLowerCase(),
      ) ?? available.find(
        (e) => e.name.toLowerCase().includes(spec.name.toLowerCase()),
      )

      if (exercise && exercise.id !== undefined) {
        programExercises.push({
          exerciseId: exercise.id,
          order: exerciseOrder++,
          sets: spec.sets,
          targetReps: spec.reps,
          restSeconds: spec.rest,
          isRehab: false,
        })
      }
    }

    return {
      name,
      order,
      intensity: 'volume', // SA = volume only, no heavy force
      exercises: programExercises,
    }
  }

  return [
    buildSASession('SA — Push + Legs', 1, sessionAExercises),
    buildSASession('SA — Pull + Legs', 2, sessionBExercises),
  ]
}

// ---------------------------------------------------------------------------
// Bodyweight-only program (no equipment)
// ---------------------------------------------------------------------------

/**
 * Fixed 3-session program for users with no equipment.
 * All exercises are bodyweight-only, volume intensity (15-20 reps).
 * Progression: +1 set when all sets hit 20 reps (cap 5 sets).
 */
function buildBodyweightProgram(
  available: Exercise[],
): ProgramSession[] {
  // Session A: Fondamentaux
  const sessionAExercises = [
    { name: 'Squat bulgare poids de corps', sets: 3, reps: 15, rest: 90 },
    { name: 'Glute bridge', sets: 3, reps: 15, rest: 60 },
    { name: 'Pompes classiques', sets: 3, reps: 15, rest: 90 },
    { name: 'Pike pushups', sets: 3, reps: 15, rest: 90 },
    { name: 'Rowing inversé', sets: 3, reps: 15, rest: 90 },
    { name: 'Planche (plank)', sets: 3, reps: 30, rest: 60, isTimeBased: true },
    { name: 'Bird dog', sets: 3, reps: 12, rest: 60 },
  ]

  // Session B: Unilatéral
  const sessionBExercises = [
    { name: 'Fentes poids de corps', sets: 3, reps: 15, rest: 90 },
    { name: 'Squat sumo poids de corps', sets: 3, reps: 15, rest: 60 },
    { name: 'Pompes diamant', sets: 3, reps: 15, rest: 90 },
    { name: 'Pike pushups', sets: 3, reps: 15, rest: 90 },
    { name: 'Rowing inversé', sets: 3, reps: 15, rest: 90 },
    { name: 'Planche latérale (side plank)', sets: 3, reps: 30, rest: 60, isTimeBased: true },
    { name: 'Dead bug', sets: 3, reps: 12, rest: 60 },
  ]

  // Session C: Intensité
  const sessionCExercises = [
    { name: 'Squat poids de corps', sets: 3, reps: 20, rest: 60 },
    { name: 'Glute bridge', sets: 3, reps: 15, rest: 60 },
    { name: 'Pompes pieds surélevés', sets: 3, reps: 15, rest: 90 },
    { name: 'Pike pushups', sets: 3, reps: 15, rest: 90 },
    { name: 'Rowing inversé', sets: 3, reps: 15, rest: 90 },
    { name: 'Dead bug', sets: 3, reps: 12, rest: 60 },
    { name: 'Mollets debout poids de corps', sets: 3, reps: 20, rest: 60 },
  ]

  const buildBWSession = (
    name: string,
    order: number,
    exerciseSpecs: { name: string; sets: number; reps: number; rest: number; isTimeBased?: boolean }[],
  ): ProgramSession => {
    const programExercises: ProgramExercise[] = []
    let exerciseOrder = 1

    for (const spec of exerciseSpecs) {
      const exercise = available.find(
        (e) => e.name.toLowerCase() === spec.name.toLowerCase(),
      ) ?? available.find(
        (e) => e.name.toLowerCase().includes(spec.name.toLowerCase()),
      )

      if (exercise && exercise.id !== undefined) {
        programExercises.push({
          exerciseId: exercise.id,
          order: exerciseOrder++,
          sets: spec.sets,
          targetReps: spec.reps,
          restSeconds: spec.rest,
          isRehab: false,
          isTimeBased: spec.isTimeBased,
        })
      }
    }

    return {
      name,
      order,
      intensity: 'volume', // Bodyweight = volume only, no heavy
      exercises: programExercises,
    }
  }

  return [
    buildBWSession('PDC — Fondamentaux', 1, sessionAExercises),
    buildBWSession('PDC — Unilatéral', 2, sessionBExercises),
    buildBWSession('PDC — Intensité', 3, sessionCExercises),
  ]
}

/**
 * Check if user has Spondylarthrite Ankylosante as a health condition.
 */
function hasSACondition(conditions: HealthCondition[]): boolean {
  return conditions.some(
    (c) => c.isActive && (
      c.diagnosis.toLowerCase().includes('spondylarthrite') ||
      c.diagnosis.toLowerCase().includes('spondyloarthrite') ||
      c.label.toLowerCase().includes('spondylarthrite') ||
      c.label.toLowerCase().includes('spondyloarthrite')
    ),
  )
}

/**
 * Main entry point — generates a complete workout program structure.
 *
 * Does NOT persist anything to the database; the caller (e.g. onboarding
 * hook) is responsible for saving.
 */
export function generateProgram(
  input: ProgramGeneratorInput,
  exerciseCatalog: Exercise[],
): GeneratedProgram {
  // Step 1 — filter by available equipment
  const afterEquipment = filterExercisesByEquipment(
    exerciseCatalog,
    input.equipment,
  )

  // Step 2 — exclude cardio exercises and optionally excluded IDs (for refresh)
  // Cardio exercises (bike, treadmill, elliptique) have primaryMuscles like
  // 'quadriceps' which causes them to be picked for strength slots.
  // NOTE: No contraindication filtering — the program is the same regardless of
  // health conditions. Users manually skip exercises during workouts.
  const excludeSet = new Set(input.excludeExerciseIds ?? [])
  const afterCardio = afterEquipment.filter((e) => !e.tags.includes('cardio'))
  let eligible = afterCardio.filter((e) => !excludeSet.has(e.id ?? 0))
  // If exclusion leaves too few non-rehab exercises, ignore it to avoid empty sessions
  if (excludeSet.size > 0 && eligible.filter(e => !e.isRehab).length < 15) {
    eligible = afterCardio
  }

  // Check for SA (Spondylarthrite Ankylosante) — use fixed 2-session program
  if (hasSACondition(input.conditions)) {
    const saSessions = buildSAProgram(eligible)
    return {
      name: SPLIT_NAMES['sa_program'] ?? 'Programme SA',
      type: 'full_body', // Use full_body as base type for compatibility
      sessions: saSessions,
    }
  }

  // Check for a bodyweight-only setup — use the dedicated bodyweight program.
  // The gym splits assume loaded equipment; a user with no machine and no
  // free weight (only accessories — mat, band, foam roller — or cardio gear)
  // would otherwise get a mostly-empty gym split.
  const strengthEquipment = input.equipment.filter(
    (e) => e.isAvailable && !NON_STRENGTH_EQUIPMENT.has(e.name),
  )
  if (strengthEquipment.length === 0) {
    const bwSessions = buildBodyweightProgram(eligible)
    return {
      name: SPLIT_NAMES['bodyweight_program'] ?? 'Programme Poids de Corps',
      type: 'bodyweight',
      sessions: bwSessions,
    }
  }

  // Step 5 — determine split
  const splitType = determineSplit(input.daysPerWeek)

  // Step 6 — build sessions (fixed slot counts, no time budget)
  let sessions: ProgramSession[]
  switch (splitType) {
    case 'full_body':
      sessions = buildFullBodySessions(eligible, input.daysPerWeek)
      break
    case 'upper_lower':
      sessions = buildUpperLowerSessions(eligible)
      break
    case 'push_pull_legs':
      sessions = buildPushPullLegsSessions(eligible)
      break
  }

  return {
    name: SPLIT_NAMES[splitType] ?? 'Programme',
    type: splitType,
    sessions,
  }
}
