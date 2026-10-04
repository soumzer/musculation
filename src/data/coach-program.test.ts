import { describe, it, expect } from 'vitest'
import { exerciseCatalog } from './exercises'
import {
  applyLadder,
  buildCoachSessions,
  applyLightWeek,
  canAdvanceLadder,
  isLightWeekActive,
  ladderExercises,
  lightWeekEnd,
  shouldChangeStimulus,
  ladderStepIndex,
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
    expect(ironCardio.targetReps).toBe(720) // palier 1 : 12 min
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

describe('coach-program — paliers (progression autorégulée)', () => {
  const sessions = buildCoachSessions(kettlebellProgram, catalogWithIds)
  const ironCardioId = idByName.get('Iron Cardio (clean + press + squat kettlebell)')!
  const swingId = idByName.get('Kettlebell swing à un bras')!
  const bulgareId = idByName.get('Squat bulgare kettlebell (goblet)')!
  const find = (ss: typeof sessions, id: number) =>
    ss.flatMap((s) => s.exercises).find((e) => e.exerciseId === id)!

  it('trois exos progressent : Iron Cardio, swing à un bras, squat bulgare', () => {
    expect(ladderExercises(kettlebellProgram).map((l) => l.name)).toEqual([
      'Iron Cardio (clean + press + squat kettlebell)',
      'Kettlebell swing à un bras',
      'Squat bulgare kettlebell (goblet)',
    ])
  })

  it('le palier 1 décrit exactement la prescription de départ', () => {
    for (const { name, ladder } of ladderExercises(kettlebellProgram)) {
      const exo = find(sessions, idByName.get(name)!)
      const first = ladder[0]
      if (first.durationSeconds !== undefined) expect(exo.targetReps, name).toBe(first.durationSeconds)
      if (first.reps !== undefined) expect(exo.targetReps, name).toBe(first.reps)
      if (first.sets !== undefined) expect(exo.sets, name).toBe(first.sets)
      expect(exo.ladderLabel, name).toBe(first.label)
      expect(exo.ladderWeightKg, name).toBe(first.weightKg)
    }
  })

  it('monter d\'un palier réécrit la durée, les séries et la charge affichée', () => {
    const next = applyLadder(
      kettlebellProgram,
      sessions,
      { 'Iron Cardio (clean + press + squat kettlebell)': 2, 'Kettlebell swing à un bras': 2 },
      catalogWithIds,
    )

    const ic = find(next, ironCardioId)
    expect(ic.targetReps).toBe(1080) // 18 min
    expect(ic.ladderLabel).toBe('14 kg — 18 min')
    expect(ic.ladderWeightKg).toBe(14)

    const swing = find(next, swingId)
    expect(swing.sets).toBe(5)
    expect(swing.targetReps).toBe(10)
    expect(swing.ladderWeightKg).toBe(16)
    expect(swing.perSide).toBe('bras') // le reste de la prescription ne bouge pas

    // Exo non mentionné : inchangé.
    expect(find(next, bulgareId)).toEqual(find(sessions, bulgareId))
  })

  it('les deux séances Iron Cardio montent ensemble', () => {
    const next = applyLadder(kettlebellProgram, sessions, { 'Iron Cardio (clean + press + squat kettlebell)': 4 }, catalogWithIds)
    const lundi = next[0].exercises[0]
    const vendredi = next[2].exercises[0]
    expect(lundi.exerciseId).toBe(ironCardioId)
    expect(vendredi.exerciseId).toBe(ironCardioId)
    expect(vendredi.targetReps).toBe(lundi.targetReps)
    expect(lundi.ladderLabel).toBe('16 kg — 12 min')
  })

  it('un index hors bornes est ramené dans la plage', () => {
    const steps = ladderExercises(kettlebellProgram)[0].ladder
    expect(ladderStepIndex(steps, undefined)).toBe(0)
    expect(ladderStepIndex(steps, -3)).toBe(0)
    expect(ladderStepIndex(steps, 99)).toBe(steps.length - 1)
    const next = applyLadder(kettlebellProgram, sessions, { 'Kettlebell swing à un bras': 99 }, catalogWithIds)
    expect(find(next, swingId).ladderLabel).toBe('16 kg · 5 × 10 par bras')
  })

  it('sans paliers enregistrés, les séances ne sont pas recopiées', () => {
    expect(applyLadder(kettlebellProgram, sessions, undefined, catalogWithIds)).toBe(sessions)
    expect(applyLadder(kettlebellProgram, sessions, {}, catalogWithIds)).toBe(sessions)
  })

  it('il faut DEUX séances de suite avec les 3 critères', () => {
    expect(canAdvanceLadder(undefined)).toBe(false)
    expect(canAdvanceLadder([])).toBe(false)
    expect(canAdvanceLadder([{ date: 'a', ok: true }])).toBe(false)
    expect(canAdvanceLadder([{ date: 'a', ok: true }, { date: 'b', ok: true }])).toBe(true)
    // Une séance ratée casse la série, même après deux bonnes.
    expect(canAdvanceLadder([
      { date: 'a', ok: true }, { date: 'b', ok: true }, { date: 'c', ok: false },
    ])).toBe(false)
    expect(canAdvanceLadder([
      { date: 'a', ok: false }, { date: 'b', ok: true }, { date: 'c', ok: true },
    ])).toBe(true)
  })

  it('les deux séances Iron Cardio demandent les 3 critères, les autres non', () => {
    expect(kettlebellProgram.sessions.map((s) => s.criteria?.length ?? 0)).toEqual([3, 0, 3, 0])
    expect(sessions[0].criteria).toHaveLength(3)
    expect(sessions[1].criteria).toBeUndefined()
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

  it('la durée annoncée et le libellé du palier suivent', () => {
    const light = applyLightWeek(sessions, true)
    expect(light[0].durationMin).toBe(20) // 40 min → 20
    expect(light[0].exercises[0].ladderLabel).toBe('12 kg — 12 min (technique seulement) · allégé de moitié')
    // Un exo sans palier n'invente pas de libellé.
    expect(light[0].exercises[1].ladderLabel).toBeUndefined()
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

describe('coach-program — changement de stimulus', () => {
  const now = new Date('2026-11-01T12:00:00Z')
  const daysBefore = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000)

  it('proposé après 3 semaines sans palier franchi', () => {
    expect(shouldChangeStimulus(daysBefore(20).toISOString(), undefined, now)).toBe(false)
    expect(shouldChangeStimulus(daysBefore(21).toISOString(), undefined, now)).toBe(true)
  })

  it('sans palier jamais franchi, on compte depuis le début du programme', () => {
    expect(shouldChangeStimulus(undefined, daysBefore(10), now)).toBe(false)
    expect(shouldChangeStimulus(undefined, daysBefore(30), now)).toBe(true)
    expect(shouldChangeStimulus(undefined, undefined, now)).toBe(false)
  })
})

describe('buildCoachSessions — erreurs', () => {
  it('lève une erreur lisible si un exo manque au catalogue', () => {
    const truncated = catalogWithIds.filter((e) => e.name !== 'Turkish get-up kettlebell')
    expect(() => buildCoachSessions(yassineProgram, truncated)).toThrow(/Turkish get-up kettlebell/)
  })
})
