import { describe, it, expect } from 'vitest'
import { exerciseCatalog } from './exercises'
import {
  buildCoachSessions,
  coachExerciseNames,
  coachPrograms,
  getCoachProgramDef,
  jannaProgram,
  yassineProgram,
} from './coach-program'
import type { Exercise } from '../db/types'

// Catalogue "en base" simulé : ids séquentiels comme après un bulkAdd.
const catalogWithIds: Exercise[] = exerciseCatalog.map((e, i) => ({ ...e, id: i + 1 }))
const idByName = new Map(catalogWithIds.map((e) => [e.name, e.id]))

describe('coach-program — registre', () => {
  it('deux programmes, ids uniques, fallback Yassine pour les anciens enregistrements', () => {
    expect(coachPrograms.map((p) => p.id)).toEqual(['yassine', 'janna'])
    expect(getCoachProgramDef(undefined).id).toBe('yassine')
    expect(getCoachProgramDef('janna').id).toBe('janna')
    expect(getCoachProgramDef('inconnu').id).toBe('yassine')
  })

  it.each(coachPrograms)('$id : référence uniquement des exos présents dans le catalogue', (def) => {
    const names = new Set(exerciseCatalog.map((e) => e.name))
    const missing = coachExerciseNames(def).filter((n) => !names.has(n))
    expect(missing).toEqual([])
  })

  it.each(coachPrograms)('$id : les supersets s\'enchaînent (repos 0 sauf sur le dernier du groupe)', (def) => {
    for (const s of def.sessions) {
      const groups = new Map<string, typeof s.exercises>()
      for (const e of s.exercises) {
        if (!e.group) continue
        groups.set(e.group, [...(groups.get(e.group) ?? []), e])
      }
      for (const [group, exos] of groups) {
        expect(exos.length, `${s.name} groupe ${group}`).toBe(2)
        expect(exos[0].rest, `${s.name} ${exos[0].name}`).toBe(0)
        expect(exos[1].rest, `${s.name} ${exos[1].name}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('coach-program — Yassine', () => {
  it('5 séances de 30-34 min, prépa de 5 items, finisher partout, 3 → 4 → 5, +5/+2,5', () => {
    expect(yassineProgram.sessions.map((s) => s.name)).toEqual(['Poussée', 'Jambes', 'Athlétique', 'Tirage', 'Hanches'])
    for (const s of yassineProgram.sessions) {
      expect(s.durationMin).toBeGreaterThanOrEqual(30)
      expect(s.durationMin).toBeLessThanOrEqual(34)
      expect(s.finisher?.durationMin).toBeGreaterThan(0)
    }
    expect(yassineProgram.prepRoutine).toHaveLength(5)
    expect(yassineProgram.weekPlan).toEqual({ rampUp: [3, 4, 5], deloadEvery: 5 })
    expect(yassineProgram.increments).toEqual({ machine: 5, free: 2.5 })
  })

  it('respecte les règles fixes : aucune barre en poussée horizontale, aucun tapis', () => {
    const byName = new Map(exerciseCatalog.map((e) => [e.name, e]))
    for (const name of coachExerciseNames(yassineProgram)) {
      const ex = byName.get(name)!
      const isHorizontalPush = ex.tags.includes('push') && ex.tags.includes('chest')
      if (isHorizontalPush) expect(ex.equipmentNeeded, name).not.toContain('barbell')
      expect(name.toLowerCase()).not.toContain('tapis')
    }
  })

  it('buildCoachSessions : ids résolus, fourchettes, supersets, consignes, chrono', () => {
    const sessions = buildCoachSessions(yassineProgram, catalogWithIds)
    expect(sessions).toHaveLength(5)

    const push = sessions[0]
    expect(push.name).toBe('Poussée')
    expect(push.order).toBe(0)
    expect(push.intensity).toBeUndefined()
    expect(push.durationMin).toBe(33)
    expect(push.coreDuringRest).toEqual({ name: 'Planche RKC', detail: '30s' })
    expect(push.finisher?.kind).toBe('emom')

    const incline = push.exercises[0]
    expect(incline.exerciseId).toBe(idByName.get('Développé incliné haltères'))
    expect(incline.sets).toBe(3)
    expect(incline.targetReps).toBe(6)
    expect(incline.targetRepsMax).toBe(10)
    expect(incline.restSeconds).toBe(0)
    expect(incline.supersetGroup).toBe('A')
    expect(incline.isRehab).toBe(false)
    expect(push.exercises[1].perSide).toBe('bras')
    expect(push.exercises[1].restSeconds).toBe(90)

    const tgu = sessions[2].exercises[0]
    expect(tgu.targetReps).toBe(3)
    expect(tgu.targetRepsMax).toBeUndefined()

    const sidePlank = sessions[4].exercises.find((e) => e.isTimeBased)!
    expect(sidePlank.targetReps).toBe(30)
    expect(sidePlank.perSide).toBe('côté')
  })
})

describe('coach-program — Janna', () => {
  it('3 séances de 40-43 min, 2 fessiers + 1 haut du corps, prépa courte, pas de finisher, 3 dès S1, +5/+2', () => {
    expect(jannaProgram.sessions.map((s) => s.name)).toEqual(['Fessiers 1', 'Haut du corps', 'Fessiers 2'])
    expect(jannaProgram.sessions.map((s) => s.durationMin)).toEqual([40, 43, 40])
    for (const s of jannaProgram.sessions) {
      expect(s.finisher).toBeUndefined()
      expect(s.coreDuringRest).toBeUndefined()
    }
    expect(jannaProgram.prepRoutine).toHaveLength(4)
    expect(jannaProgram.weekPlan).toEqual({ rampUp: [3], deloadEvery: 5 })
    expect(jannaProgram.increments).toEqual({ machine: 5, free: 2 })
  })

  it('séries par séance : 15 / 27 / 14 — tableau du coach + élévations latérales', () => {
    const totals = jannaProgram.sessions.map((s) => s.exercises.reduce((a, e) => a + e.sets, 0))
    expect(totals).toEqual([15, 27, 14]) // 24 + 3 séries d'élévations latérales (épaules)
  })

  it('buildCoachSessions : supersets E/F, /jambe, consignes d\'exécution', () => {
    const sessions = buildCoachSessions(jannaProgram, catalogWithIds)
    expect(sessions).toHaveLength(3)

    const bulgare = sessions[0].exercises[1]
    expect(bulgare.exerciseId).toBe(idByName.get('Squat bulgare haltères'))
    expect(bulgare.perSide).toBe('jambe')
    expect(bulgare.cue).toContain('45°')

    const upper = sessions[1]
    expect(upper.exercises).toHaveLength(9)
    expect(upper.exercises[8].exerciseId).toBe(idByName.get('Élévations latérales'))
    expect(upper.exercises[8].supersetGroup).toBeUndefined()
    expect(upper.exercises[4].supersetGroup).toBe('E')
    expect(upper.exercises[4].restSeconds).toBe(0)
    expect(upper.exercises[5].supersetGroup).toBe('E')
    expect(upper.exercises[5].restSeconds).toBe(60)
    expect(upper.exercises[7].restSeconds).toBe(45)

    const rdl = sessions[2].exercises[0]
    expect(rdl.cue).toContain('amplitude complète')
    expect(sessions[2].exercises[2].targetReps).toBe(10)
    expect(sessions[2].exercises[2].targetRepsMax).toBeUndefined()
  })

  it('les substitutions du coach sont proposées comme alternatives dans le catalogue', () => {
    const byName = new Map(exerciseCatalog.map((e) => [e.name, e]))
    expect(byName.get('Leg press')!.alternatives).toContain('Fentes haltères')
    expect(byName.get('Tirage vertical (lat pulldown)')!.alternatives).toContain('Rowing haltère unilatéral')
    expect(byName.get('Rowing câble assis')!.alternatives).toContain('Rowing penché haltères')
    expect(byName.get('Extension hanche poulie')!.alternatives).toContain('Kickback élastique')
    expect(byName.get('Abduction hanche machine')!.alternatives).toContain('Abduction hanche debout élastique')
  })
})

describe('buildCoachSessions — erreurs', () => {
  it('lève une erreur lisible si un exo manque au catalogue', () => {
    const truncated = catalogWithIds.filter((e) => e.name !== 'Turkish get-up kettlebell')
    expect(() => buildCoachSessions(yassineProgram, truncated)).toThrow(/Turkish get-up kettlebell/)
  })
})
