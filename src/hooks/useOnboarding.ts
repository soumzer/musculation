import { useState } from 'react'
import { db } from '../db'
import type { HealthCondition, GymEquipment } from '../db/types'
import { generateProgram, ENGINE_VERSION } from '../engine/program-generator'

export interface OnboardingState {
  step: number
  body: { name: string }
  conditions: Omit<HealthCondition, 'id' | 'userId' | 'createdAt'>[]
  equipment: Omit<GymEquipment, 'id' | 'userId'>[]
  daysPerWeek: number
  minutesPerSession: number
}

const initialState: OnboardingState = {
  step: 1,
  body: { name: '' },
  conditions: [],
  equipment: [],
  daysPerWeek: 3,
  minutesPerSession: 75,
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(initialState)
  const totalSteps = 5

  const nextStep = () => setState(s => ({ ...s, step: Math.min(s.step + 1, totalSteps) }))
  const prevStep = () => setState(s => ({ ...s, step: Math.max(s.step - 1, 1) }))
  const updateBody = (body: OnboardingState['body']) => setState(s => ({ ...s, body }))
  const updateConditions = (conditions: OnboardingState['conditions']) => setState(s => ({ ...s, conditions }))
  const updateEquipment = (equipment: OnboardingState['equipment']) => setState(s => ({ ...s, equipment }))
  const updateSchedule = (daysPerWeek: number, minutesPerSession: number) =>
    setState(s => ({ ...s, daysPerWeek, minutesPerSession }))
  const submit = async () => {
    const now = new Date()
    const userId = await db.userProfiles.add({
      name: state.body.name,
      daysPerWeek: state.daysPerWeek,
      minutesPerSession: state.minutesPerSession,
      createdAt: now,
      updatedAt: now,
    }) as number

    if (state.conditions.length > 0) {
      await db.healthConditions.bulkAdd(
        state.conditions.map(c => ({ ...c, userId, createdAt: now }))
      )
    }

    if (state.equipment.length > 0) {
      await db.gymEquipment.bulkAdd(
        state.equipment.map(e => ({ ...e, userId }))
      )
    }

    // --- Generate workout program ---

    // 1. Load the exercise catalog from the database
    const exerciseCatalog = await db.exercises.toArray()

    // 2. Build the full GymEquipment list for the generator
    //    (add userId to the onboarding equipment items)
    const equipmentForGenerator: GymEquipment[] = state.equipment.map(e => ({
      ...e,
      userId,
    }))

    // 3. Build full HealthCondition list for the generator
    const conditionsForGenerator: HealthCondition[] = state.conditions.map(c => ({
      ...c,
      userId,
      createdAt: now,
    }))

    // 4. Call the program generator
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

    // 5. Save the generated program to the database
    await db.workoutPrograms.add({
      userId,
      name: generatedProgram.name,
      type: generatedProgram.type,
      sessions: generatedProgram.sessions,
      isActive: true,
      createdAt: new Date(),
      engineVersion: ENGINE_VERSION,
    })

    return userId
  }

  return {
    state, totalSteps,
    nextStep, prevStep,
    updateBody, updateConditions, updateEquipment,
    updateSchedule,
    submit,
  }
}
