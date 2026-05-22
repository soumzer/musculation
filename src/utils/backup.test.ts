import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { exportData, importData } from './backup'

describe('backup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  async function seedUser() {
    const userId = await db.userProfiles.add({
      name: 'Yassine',
      daysPerWeek: 4,
      minutesPerSession: 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as number
    await db.healthConditions.add({
      userId,
      bodyZone: 'elbow_right',
      label: 'Golf elbow',
      diagnosis: 'Epicondylite mediale',
      since: '1 an',
      notes: 'Douleur en poussant',
      isActive: true,
      createdAt: new Date(),
    })
    await db.gymEquipment.add({
      userId,
      name: 'Banc plat',
      type: 'free_weight',
      isAvailable: true,
      notes: '',
    })
    await db.notebookEntries.add({
      userId,
      exerciseId: 1,
      exerciseName: 'Bench Press',
      date: new Date(),
      sessionIntensity: 'heavy',
      sets: [{ weightKg: 80, reps: 6 }, { weightKg: 80, reps: 5 }],
      skipped: false,
    })
    await db.painReports.add({
      userId,
      zone: 'elbow_right',
      date: new Date(),
      fromExerciseName: 'Curl biceps',
      accentDaysRemaining: 3,
    })
    await db.exercises.add({
      name: 'Bench Press',
      category: 'compound',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
      equipmentNeeded: ['barbell', 'bench'],
      contraindications: [],
      alternatives: ['Dumbbell Press'],
      instructions: 'Push the bar up',
      isRehab: false,
      tags: ['push'],
    })
    await db.exerciseNotes.add({
      userId,
      exerciseId: 1,
      note: 'Garder les coudes serrés',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.activeSession.put({
      id: 1,
      programId: 1,
      sessionIndex: 0,
      phase: 'exercises',
      currentExerciseIdx: 2,
      exerciseStatuses: [{ exerciseId: 1, status: 'done' }],
      sessionStartTime: new Date(),
      warmupChecked: [0, 1],
      draftSets: [],
      restTimerEndTime: null,
      updatedAt: new Date(),
    })
    return userId
  }

  it('exports all user data as JSON', async () => {
    const userId = await seedUser()
    const json = await exportData(userId)
    const data = JSON.parse(json)

    expect(data.version).toBe(4)
    expect(data.exportedAt).toBeDefined()
    expect(data.profile.name).toBe('Yassine')
    expect(data.conditions).toHaveLength(1)
    expect(data.conditions[0].label).toBe('Golf elbow')
    expect(data.equipment).toHaveLength(1)
    expect(data.equipment[0].name).toBe('Banc plat')
    expect(data.notebookEntries).toHaveLength(1)
    expect(data.notebookEntries[0].exerciseName).toBe('Bench Press')
    expect(data.notebookEntries[0].sets).toHaveLength(2)
    expect(data.painReports).toHaveLength(1)
    expect(data.painReports[0].zone).toBe('elbow_right')
    expect(data.programs).toHaveLength(0)
    expect(data.sessions).toHaveLength(0)
    expect(data.exercises).toHaveLength(1)
    expect(data.exercises[0].name).toBe('Bench Press')
    expect(data.exerciseNotes).toHaveLength(1)
    expect(data.exerciseNotes[0].note).toBe('Garder les coudes serrés')
    expect(data.activeSession).toBeDefined()
    expect(data.activeSession.phase).toBe('exercises')
  })

  it('throws when exporting non-existent user', async () => {
    await expect(exportData(999)).rejects.toThrow('Profil utilisateur introuvable')
  })

  it('imports data from exported JSON', async () => {
    const userId = await seedUser()
    const json = await exportData(userId)

    await db.delete()
    await db.open()

    const newUserId = await importData(json)
    expect(newUserId).toBeDefined()

    const profile = await db.userProfiles.get(newUserId)
    expect(profile).toBeDefined()
    expect(profile!.name).toBe('Yassine')

    const conditions = await db.healthConditions.where('userId').equals(newUserId).toArray()
    expect(conditions).toHaveLength(1)
    expect(conditions[0].label).toBe('Golf elbow')

    const equipment = await db.gymEquipment.where('userId').equals(newUserId).toArray()
    expect(equipment).toHaveLength(1)

    const entries = await db.notebookEntries.where('userId').equals(newUserId).toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].exerciseName).toBe('Bench Press')
    expect(entries[0].sets).toHaveLength(2)

    const reports = await db.painReports.where('userId').equals(newUserId).toArray()
    expect(reports).toHaveLength(1)
    expect(reports[0].zone).toBe('elbow_right')

    const exercises = await db.exercises.toArray()
    expect(exercises).toHaveLength(1)
    expect(exercises[0].name).toBe('Bench Press')

    const notes = await db.exerciseNotes.where('userId').equals(newUserId).toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0].note).toBe('Garder les coudes serrés')

    const session = await db.activeSession.get(1)
    expect(session).toBeDefined()
    expect(session!.phase).toBe('exercises')
    expect(session!.currentExerciseIdx).toBe(2)
  })

  it('import clears existing data', async () => {
    const userId = await seedUser()
    const json = await exportData(userId)

    await db.healthConditions.add({
      userId,
      bodyZone: 'knee_left',
      label: 'Tendinite rotulienne',
      diagnosis: 'Tendinopathie',
      since: '6 mois',
      notes: '',
      isActive: true,
      createdAt: new Date(),
    })

    const beforeImport = await db.healthConditions.toArray()
    expect(beforeImport).toHaveLength(2)

    const newUserId = await importData(json)

    const afterImport = await db.healthConditions.where('userId').equals(newUserId).toArray()
    expect(afterImport).toHaveLength(1)
    expect(afterImport[0].label).toBe('Golf elbow')
  })

  it('double import produces no duplicates', async () => {
    const userId = await seedUser()
    const json = await exportData(userId)

    // Import une première fois
    await importData(json)
    // Import une deuxième fois
    await importData(json)

    // Chaque table ne doit contenir que les données du backup, pas le double
    const profiles = await db.userProfiles.toArray()
    expect(profiles).toHaveLength(1)

    const conditions = await db.healthConditions.toArray()
    expect(conditions).toHaveLength(1)

    const equipment = await db.gymEquipment.toArray()
    expect(equipment).toHaveLength(1)

    const exercises = await db.exercises.toArray()
    expect(exercises).toHaveLength(1)

    const notes = await db.exerciseNotes.toArray()
    expect(notes).toHaveLength(1)

    const entries = await db.notebookEntries.toArray()
    expect(entries).toHaveLength(1)

    const reports = await db.painReports.toArray()
    expect(reports).toHaveLength(1)

    const session = await db.activeSession.toArray()
    expect(session).toHaveLength(1)
  })

  it('rejects invalid version', async () => {
    const json = JSON.stringify({ version: 99, profile: { name: 'Test' } })
    await expect(importData(json)).rejects.toThrow('Version de backup non supportée')
  })

  it('rejects invalid JSON', async () => {
    await expect(importData('not valid json')).rejects.toThrow()
  })
})
