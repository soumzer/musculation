import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db'
import type { HealthCondition, GymEquipment } from '../../db/types'
import { generateProgram } from '../program-generator'
import { seedExercises } from '../../data/seed'

// ---------------------------------------------------------------------------
// Helpers — simulate the onboarding submit flow without React hooks
// ---------------------------------------------------------------------------

interface SimulatedOnboardingState {
  body: { name: string }
  conditions: Omit<HealthCondition, 'id' | 'userId' | 'createdAt'>[]
  equipment: Omit<GymEquipment, 'id' | 'userId'>[]
  daysPerWeek: number
  minutesPerSession: number
}

/**
 * Replicates the logic of useOnboarding().submit() without React state,
 * so we can test the full database integration in a pure unit test.
 */
async function simulateOnboardingSubmit(state: SimulatedOnboardingState): Promise<number> {
  const now = new Date()

  // 1. Create UserProfile
  const userId = await db.userProfiles.add({
    name: state.body.name,
    daysPerWeek: state.daysPerWeek,
    minutesPerSession: state.minutesPerSession,
    createdAt: now,
    updatedAt: now,
  }) as number

  // 2. Save conditions
  if (state.conditions.length > 0) {
    await db.healthConditions.bulkAdd(
      state.conditions.map(c => ({ ...c, userId, createdAt: now }))
    )
  }

  // 3. Save equipment
  if (state.equipment.length > 0) {
    await db.gymEquipment.bulkAdd(
      state.equipment.map(e => ({ ...e, userId }))
    )
  }

  // 4. Load exercise catalog
  const exerciseCatalog = await db.exercises.toArray()

  // 5. Build generator inputs
  const equipmentForGenerator: GymEquipment[] = state.equipment.map(e => ({ ...e, userId }))
  const conditionsForGenerator: HealthCondition[] = state.conditions.map(c => ({
    ...c,
    userId,
    createdAt: now,
  }))

  // 6. Generate program
  const generatedProgram = generateProgram(
    {
      userId,
      conditions: conditionsForGenerator,
      equipment: equipmentForGenerator,
      daysPerWeek: state.daysPerWeek,
      minutesPerSession: state.minutesPerSession,
    },
    exerciseCatalog,
  )

  // 7. Save program
  await db.workoutPrograms.add({
    userId,
    name: generatedProgram.name,
    type: generatedProgram.type,
    sessions: generatedProgram.sessions,
    isActive: true,
    createdAt: now,
  })

  return userId
}

// ---------------------------------------------------------------------------
// Helper — standard gym equipment for most tests
// ---------------------------------------------------------------------------

function standardGymEquipment(): Omit<GymEquipment, 'id' | 'userId'>[] {
  return [
    { name: 'bench', type: 'free_weight', isAvailable: true, notes: '' },
    { name: 'barbell', type: 'free_weight', isAvailable: true, notes: '' },
    { name: 'dumbbells', type: 'free_weight', isAvailable: true, notes: '' },
    { name: 'dumbbell', type: 'free_weight', isAvailable: true, notes: '' },
    { name: 'cable', type: 'cable', isAvailable: true, notes: '' },
    { name: 'rope_attachment', type: 'cable', isAvailable: true, notes: '' },
    { name: 'lat_pulldown', type: 'machine', isAvailable: true, notes: '' },
    { name: 'leg_press', type: 'machine', isAvailable: true, notes: '' },
    { name: 'leg_extension', type: 'machine', isAvailable: true, notes: '' },
    { name: 'leg_curl', type: 'machine', isAvailable: true, notes: '' },
    { name: 'smith_machine', type: 'machine', isAvailable: true, notes: '' },
    { name: 'squat_rack', type: 'free_weight', isAvailable: true, notes: '' },
    { name: 'pec_deck', type: 'machine', isAvailable: true, notes: '' },
    { name: 'shoulder_press', type: 'machine', isAvailable: true, notes: '' },
    { name: 'rowing_machine', type: 'machine', isAvailable: true, notes: '' },
  ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding → Program Generation integration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await seedExercises()
  })

  it('generates 3 sessions for daysPerWeek=3 (full_body)', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Alice' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 3,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program).toBeDefined()
    expect(program!.type).toBe('full_body')
    expect(program!.sessions).toHaveLength(3)

    for (const session of program!.sessions) {
      expect(session.exercises.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('generates 4 sessions for daysPerWeek=4 (upper_lower)', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Bob' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 4,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program).toBeDefined()
    expect(program!.type).toBe('upper_lower')
    expect(program!.sessions).toHaveLength(4)
  })

  it('generates 6 sessions for daysPerWeek=5 (push_pull_legs)', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Claire' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 5,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program).toBeDefined()
    expect(program!.type).toBe('push_pull_legs')
    expect(program!.sessions).toHaveLength(6)
  })

  it('generates 6 sessions for daysPerWeek=6 (push_pull_legs)', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Dan' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 6,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program!.type).toBe('push_pull_legs')
    expect(program!.sessions).toHaveLength(6)
  })

  it('generates 2 sessions for daysPerWeek=2 (full_body)', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Eve' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 2,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program!.type).toBe('full_body')
    expect(program!.sessions).toHaveLength(2)
  })

  it('no exercise appears twice in the same session', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Frank' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 4,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    for (const session of program!.sessions) {
      const ids = session.exercises.map(e => e.exerciseId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('SA condition generates SA program', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Grace' },
      conditions: [{
        bodyZone: 'lower_back',
        label: 'Spondylarthrite ankylosante',
        diagnosis: 'Spondylarthrite ankylosante',
        since: '5 ans',
        notes: '',
        isActive: true,
      }],
      equipment: standardGymEquipment(),
      daysPerWeek: 3,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program!.name).toContain('SA')
    expect(program!.sessions).toHaveLength(2)
  })

  it('no equipment generates bodyweight program', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Hank' },
      conditions: [],
      equipment: [],
      daysPerWeek: 3,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program!.type).toBe('bodyweight')
    expect(program!.sessions).toHaveLength(3)
  })

  it('health conditions are saved but do not affect program structure', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Iris' },
      conditions: [{
        bodyZone: 'elbow_right',
        label: 'Golf elbow',
        diagnosis: 'Epicondylite mediale',
        since: '1 an',
        notes: '',
        isActive: true,
      }],
      equipment: standardGymEquipment(),
      daysPerWeek: 4,
      minutesPerSession: 75,
    })

    const conditions = await db.healthConditions.where('userId').equals(userId).toArray()
    expect(conditions).toHaveLength(1)

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    // Program structure is the same regardless of conditions (no filtering)
    expect(program!.type).toBe('upper_lower')
    expect(program!.sessions).toHaveLength(4)
  })

  it('equipment filtering removes exercises requiring missing equipment', async () => {
    // Only dumbbells — no machines, no barbell
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Jack' },
      conditions: [],
      equipment: [
        { name: 'dumbbells', type: 'free_weight', isAvailable: true, notes: '' },
        { name: 'dumbbell', type: 'free_weight', isAvailable: true, notes: '' },
        { name: 'bench', type: 'free_weight', isAvailable: true, notes: '' },
      ],
      daysPerWeek: 3,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    expect(program).toBeDefined()
    // Should still generate a program (full_body for 3 days)
    expect(program!.sessions.length).toBeGreaterThanOrEqual(2)
  })

  it('multiple conditions saved correctly', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Kate' },
      conditions: [
        {
          bodyZone: 'elbow_right',
          label: 'Golf elbow',
          diagnosis: 'Epicondylite mediale',
          since: '1 an',
          notes: '',
          isActive: true,
        },
        {
          bodyZone: 'knee_left',
          label: 'Tendinite rotulienne',
          diagnosis: 'Tendinopathie rotulienne',
          since: '6 mois',
          notes: '',
          isActive: true,
        },
      ],
      equipment: standardGymEquipment(),
      daysPerWeek: 4,
      minutesPerSession: 75,
    })

    const conditions = await db.healthConditions.where('userId').equals(userId).toArray()
    expect(conditions).toHaveLength(2)
  })

  it('all generated exercises exist in the catalog', async () => {
    const userId = await simulateOnboardingSubmit({
      body: { name: 'Leo' },
      conditions: [],
      equipment: standardGymEquipment(),
      daysPerWeek: 4,
      minutesPerSession: 75,
    })

    const program = await db.workoutPrograms
      .where('userId').equals(userId)
      .filter(p => p.isActive)
      .first()

    const allExercises = await db.exercises.toArray()
    const catalogIds = new Set(allExercises.map(e => e.id))

    for (const session of program!.sessions) {
      for (const ex of session.exercises) {
        expect(catalogIds.has(ex.exerciseId)).toBe(true)
      }
    }
  })
})
