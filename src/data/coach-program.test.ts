import { describe, it, expect } from 'vitest'
import { exerciseCatalog } from './exercises'
import {
  applyLightWeek,
  buildCoachSessions,
  isLightWeekActive,
  lightWeekEnd,
  coachExerciseNames,
  coachPrograms,
  getCoachProgramDef,
  jannaProgram,
  kettlebellProgram,
  yassineProgram,
} from './coach-program'
import type { Exercise } from '../db/types'

// Catalogue "en base" simulé : ids séquentiels comme après un bulkAdd.
const catalogWithIds: Exercise[] = exerciseCatalog.map((e, i) => ({ ...e, id: i + 1 }))
const idByName = new Map(catalogWithIds.map((e) => [e.name, e.id]))

describe('coach-program — registre', () => {
  it('trois programmes, ids uniques, fallback Yassine pour les anciens enregistrements', () => {
    expect(coachPrograms.map((p) => p.id)).toEqual(['yassine', 'janna', 'kettlebell'])
    expect(getCoachProgramDef(undefined).id).toBe('yassine')
    expect(getCoachProgramDef('janna').id).toBe('janna')
    expect(getCoachProgramDef('kettlebell').id).toBe('kettlebell')
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

describe('coach-program — Kettlebell maison', () => {
  it('4 séances dans l\'ordre de la semaine, prépa et mobilité de 3 items, pas de finisher', () => {
    expect(kettlebellProgram.sessions.map((s) => s.name)).toEqual([
      'Iron Cardio — lundi',
      'Puissance + cuisses',
      'Iron Cardio — vendredi',
      'Récupération active',
    ])
    expect(kettlebellProgram.sessions.map((s) => s.durationMin)).toEqual([40, 35, 40, 20])
    for (const s of kettlebellProgram.sessions) {
      expect(s.finisher).toBeUndefined()
      expect(s.coreDuringRest).toBeUndefined()
      for (const e of s.exercises) expect(e.group).toBeUndefined()
    }
    expect(kettlebellProgram.prepRoutine).toHaveLength(3)
    expect(kettlebellProgram.cooldownRoutine).toHaveLength(3)
    // 3 séances obligatoires par semaine ; la récup active du samedi est du bonus.
    expect(kettlebellProgram.weekPlan).toEqual({ rampUp: [3], deloadEvery: 0 })
    expect(kettlebellProgram.increments).toEqual({ machine: 5, free: 2 })
  })

  it('n\'utilise que le matériel dispo : kettlebell, barre de traction, banc', () => {
    const byName = new Map(exerciseCatalog.map((e) => [e.name, e]))
    const allowed = new Set(['kettlebell', 'pull_up_bar', 'bench'])
    for (const name of coachExerciseNames(kettlebellProgram)) {
      for (const tag of byName.get(name)!.equipmentNeeded) {
        expect(allowed.has(tag), `${name} → ${tag}`).toBe(true)
      }
    }
  })

  it('les deux Iron Cardio sont identiques mais portent un nom distinct', () => {
    const [lundi, , vendredi] = kettlebellProgram.sessions
    // L'app retrouve où elle en est par le NOM de la dernière séance faite :
    // deux noms identiques la renverraient toujours au lundi.
    expect(lundi.name).not.toBe(vendredi.name)
    expect(vendredi.exercises).toEqual(lundi.exercises)
    // Les pastilles de l'accueil coupent au « — » : les deux affichent « Iron Cardio ».
    expect(lundi.name.replace(/ — .*/, '')).toBe(vendredi.name.replace(/ — .*/, ''))
  })

  it('buildCoachSessions : Iron Cardio au chrono, unilatéral annoncé du bon mot', () => {
    const sessions = buildCoachSessions(kettlebellProgram, catalogWithIds)
    expect(sessions).toHaveLength(4)
    expect(sessions.map((s) => s.order)).toEqual([0, 1, 2, 3])

    const ironCardio = sessions[0].exercises[0]
    expect(ironCardio.exerciseId).toBe(idByName.get('Iron Cardio (clean + press + squat kettlebell)'))
    expect(ironCardio.isTimeBased).toBe(true)
    // Chrono + compteur de tours à la place des séries (ComplexNotebook).
    expect(ironCardio.continuousComplex).toBe(true)
    expect(ironCardio.targetReps).toBe(720) // durée de départ : 12 min, réglable ensuite
    expect(ironCardio.sets).toBe(1)
    // Seul l'Iron Cardio est un complexe : le reste passe par le carnet normal.
    for (const s of buildCoachSessions(kettlebellProgram, catalogWithIds)) {
      for (const e of s.exercises) {
        const isIronCardio = e.exerciseId === idByName.get('Iron Cardio (clean + press + squat kettlebell)')
        expect(e.continuousComplex ?? false).toBe(isIronCardio)
      }
    }

    const pompes = sessions[0].exercises[1]
    expect(pompes.targetReps).toBe(10)
    expect(pompes.targetRepsMax).toBe(25)
    expect(pompes.cue).toContain('2 reps')

    const swing = sessions[1].exercises[1]
    expect(swing.exerciseId).toBe(idByName.get('Kettlebell swing à un bras'))
    expect(swing.perSide).toBe('bras')
    expect(swing.sets).toBe(5)

    expect(sessions[1].exercises[2].perSide).toBe('jambe')
    expect(sessions[3].exercises[1].perSide).toBe('côté')
  })

  it('les régressions des tractions restent atteignables par « Changer »', () => {
    const byName = new Map(exerciseCatalog.map((e) => [e.name, e]))
    // Même catégorie + muscle principal commun → proposées par computeSwapOptions.
    for (const name of ['Rowing inversé', 'Traction excentrique']) {
      const regression = byName.get(name)!
      expect(regression.category).toBe(byName.get('Traction (pull-up)')!.category)
      expect(regression.primaryMuscles).toContain('dorsaux')
    }
    expect(byName.get('Pompes classiques')!.alternatives).toContain('Pompes inclinées')
  })
})

describe('coach-program — semaine allégée à la demande', () => {
  const sessions = buildCoachSessions(kettlebellProgram, catalogWithIds)

  it('moitié des séries et des chronos, charges et reps intactes', () => {
    const light = applyLightWeek(sessions, true)

    const ironCardio = light[0].exercises[0]
    expect(ironCardio.targetReps).toBe(360) // 12 min → 6 min
    expect(ironCardio.sets).toBe(1)

    const [saut, swing, bulgare] = light[1].exercises
    expect(saut.sets).toBe(3)    // 5 → 3
    expect(swing.sets).toBe(3)   // 5 → 3
    expect(bulgare.sets).toBe(2) // 3 → 2
    // Les reps et le côté ne bougent pas : on baisse le volume, pas l'intensité.
    expect(swing.targetReps).toBe(sessions[1].exercises[1].targetReps)
    expect(swing.perSide).toBe('bras')
    expect(bulgare.targetReps).toBe(8)
  })

  it('jamais moins d\'une série, jamais moins de 30 s de chrono', () => {
    const light = applyLightWeek([{
      name: 'test', order: 0,
      exercises: [
        { exerciseId: 1, order: 0, sets: 1, targetReps: 10, restSeconds: 60, isRehab: false },
        { exerciseId: 2, order: 1, sets: 1, targetReps: 30, restSeconds: 60, isRehab: false, isTimeBased: true },
      ],
    }], true)
    expect(light[0].exercises[0].sets).toBe(1)
    expect(light[0].exercises[1].targetReps).toBe(30)
  })

  it('la durée annoncée de la séance suit', () => {
    expect(applyLightWeek(sessions, true)[0].durationMin).toBe(20) // 40 min → 20
  })

  it('inactive, elle ne touche à rien', () => {
    expect(applyLightWeek(sessions, false)).toBe(sessions)
  })

  it('dure 7 jours', () => {
    const now = new Date('2026-10-04T10:00:00Z')
    const until = lightWeekEnd(now)
    expect(isLightWeekActive(until, new Date('2026-10-10T10:00:00Z'))).toBe(true)
    expect(isLightWeekActive(until, new Date('2026-10-11T10:01:00Z'))).toBe(false)
    expect(isLightWeekActive(undefined, now)).toBe(false)
  })
})

describe('buildCoachSessions — erreurs', () => {
  it('lève une erreur lisible si un exo manque au catalogue', () => {
    const truncated = catalogWithIds.filter((e) => e.name !== 'Turkish get-up kettlebell')
    expect(() => buildCoachSessions(yassineProgram, truncated)).toThrow(/Turkish get-up kettlebell/)
  })
})
