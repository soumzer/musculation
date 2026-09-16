import type { Exercise, Finisher, PrepItem, ProgramExercise, ProgramSession } from '../db/types'

/**
 * Programmes coach — programmes FIXES écrits par un coach, à côté du
 * générateur automatique. Un par personne (chaque téléphone active le sien).
 *
 * - `yassine` : recomp, 5 séances de 30-34 min, prépa posture, supersets,
 *   finishers, montée 3 → 4 → 5 jours, allégée toutes les 5 semaines.
 * - `janna`   : fessiers > dos > bras, 3 séances de 40 min, format classique,
 *   allégée toutes les 5 semaines.
 *
 * Les exos sont référencés par leur nom de catalogue ; `buildCoachSessions`
 * résout les ids au moment de l'activation (voir hooks/useCoachProgram.ts).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoachProgramId = 'yassine' | 'janna'

export interface CoachExerciseDef {
  /** Nom exact dans data/exercises.ts. */
  name: string
  sets: number
  /** Fourchette [min, max] ou cible fixe. */
  reps: [number, number] | number
  /** Repos après cet exo. 0 = enchaîné avec le suivant du superset. */
  rest: number
  group?: string
  cue?: string
  perSide?: 'bras' | 'côté' | 'jambe'
  timeBased?: boolean
}

export interface CoachSessionDef {
  name: string
  durationMin: number
  exercises: CoachExerciseDef[]
  coreDuringRest?: { name: string; detail: string }
  finisher?: Finisher
}

export interface CoachRuleSection {
  title: string
  /** Puces courtes. */
  items?: string[]
  /** Tableau 2 colonnes. */
  table?: { head: [string, string]; rows: [string, string][] }
  /** Phrase mise en avant. */
  highlight?: string
}

export interface CoachWeekPlan {
  /**
   * Séances visées par semaine, S1 en premier ; la dernière valeur vaut pour
   * toutes les semaines suivantes. [3, 4, 5] = 3 en S1, 4 en S2, 5 ensuite.
   */
  rampUp: number[]
  /** Semaine allégée (2 séries, 70 %) toutes les N semaines. 0 = jamais. */
  deloadEvery: number
}

export interface CoachProgramDef {
  id: CoachProgramId
  /** Nom stocké sur le WorkoutProgram et affiché en tête de Home. */
  name: string
  /** Prénom affiché dans le choix de programme. */
  owner: string
  /** Une ligne pour le choix de programme. */
  summary: string
  /** Incrémenter quand le programme change → bouton « Mettre à jour ». */
  version: number
  /** Prépa affichée à la place de l'échauffement standard (optionnel). */
  prepRoutine?: PrepItem[]
  sessions: CoachSessionDef[]
  weekPlan: CoachWeekPlan
  /** Double progression : +X kg machines/poulies, +Y kg haltères/kettlebell. */
  increments: { machine: number; free: number }
  /** Message sous la carte semaine sur Home (hors montée en charge / allégée). */
  homeHint: string
  rules: CoachRuleSection[]
}

// ---------------------------------------------------------------------------
// Yassine — recomp (version définitive, septembre 2026)
// ---------------------------------------------------------------------------

/** Prépa posture — tous les jours, 4 min. Remplace l'échauffement standard. */
const yassinePrep: PrepItem[] = [
  { name: 'Dead hang', reps: '2 × 30s' },
  { name: 'Halo kettlebell 8-12 kg', reps: '5 tours par sens' },
  { name: 'Chin tuck au mur', reps: '5 × 5s' },
  { name: 'Extension thoracique sur banc', reps: '60s' },
  { name: 'Face pull poulie légère', reps: '× 20' },
]

const yassineSessions: CoachSessionDef[] = [
  {
    name: 'Poussée',
    durationMin: 33,
    exercises: [
      { name: 'Développé incliné haltères', sets: 3, reps: [6, 10], rest: 0, group: 'A', cue: 'banc à 30°' },
      { name: 'Tirage vertical unilatéral câble', sets: 3, reps: [10, 12], rest: 90, group: 'A', perSide: 'bras' },
      { name: 'Développé militaire machine', sets: 3, reps: [8, 12], rest: 0, group: 'B' },
      { name: 'Élévations latérales câble', sets: 3, reps: [12, 20], rest: 60, group: 'B', cue: 'enchaîné' },
      { name: 'Extension triceps poulie haute (corde)', sets: 3, reps: [12, 15], rest: 60 },
    ],
    coreDuringRest: { name: 'Planche RKC', detail: '30s' },
    finisher: {
      kind: 'emom',
      durationMin: 8,
      title: 'EMOM 8 min',
      description: 'Chaque minute : 5 presses kettlebell par bras, puis repos le reste de la minute.',
      rounds: 8,
    },
  },
  {
    name: 'Jambes',
    durationMin: 30,
    exercises: [
      { name: 'Leg press', sets: 4, reps: [8, 12], rest: 0, group: 'A' },
      { name: 'Leg curl (ischio-jambiers)', sets: 4, reps: [10, 15], rest: 90, group: 'A', cue: 'assis' },
      { name: 'Leg extension', sets: 3, reps: [12, 15], rest: 0, group: 'B', cue: 'amplitude sans douleur' },
      { name: 'Mollets sur leg press', sets: 3, reps: [12, 15], rest: 45, group: 'B', cue: 'pause 2s en bas' },
    ],
    coreDuringRest: { name: 'Dead bug', detail: '10 par côté' },
    finisher: {
      kind: 'intervals',
      durationMin: 8,
      title: '8 × 30s / 30s',
      description: 'Vélo ou rameur : 30s à fond, 30s tranquille, 8 fois. Jamais de tapis.',
      rounds: 8,
      workSeconds: 30,
      restSeconds: 30,
    },
  },
  {
    name: 'Athlétique',
    durationMin: 34,
    exercises: [
      { name: 'Turkish get-up kettlebell', sets: 4, reps: 3, rest: 60, perSide: 'côté', cue: 'kettlebell léger' },
      { name: 'Goblet squat kettlebell', sets: 3, reps: [12, 15], rest: 0, group: 'B', cue: 'tempo 3s à la descente' },
      { name: 'Pompes classiques', sets: 3, reps: [8, 15], rest: 60, group: 'B', cue: 'max −2 reps · pieds surélevés si facile' },
      { name: 'Curl marteau haltères', sets: 2, reps: [12, 15], rest: 0, group: 'C', cue: 'prise neutre' },
      { name: 'Extension triceps câble corde (overhead)', sets: 2, reps: [12, 15], rest: 45, group: 'C' },
    ],
    coreDuringRest: { name: 'Porté unilatéral kettlebell 20 kg', detail: '30 m par bras' },
    finisher: {
      kind: 'circuit',
      durationMin: 12,
      title: '6 tours',
      description: '40 m de marche sac lesté + 10 swings kettlebell + 20s de rameur à fond. Repos 30s entre les tours.',
      rounds: 6,
      restSeconds: 30,
    },
  },
  {
    name: 'Tirage',
    durationMin: 33,
    exercises: [
      { name: 'Rowing câble assis', sets: 4, reps: [8, 12], rest: 0, group: 'A', cue: 'machine' },
      { name: 'Traction excentrique', sets: 4, reps: 4, rest: 90, group: 'A', cue: 'descente 5s' },
      { name: 'Tirage vertical unilatéral câble', sets: 3, reps: [10, 12], rest: 0, group: 'B', perSide: 'bras' },
      { name: 'Curl marteau câble', sets: 3, reps: [12, 15], rest: 60, group: 'B', cue: 'corde · enchaîné' },
      { name: 'Curl incliné haltères prise neutre', sets: 2, reps: [10, 12], rest: 60 },
    ],
    coreDuringRest: { name: 'Pallof press', detail: '10 par côté' },
    finisher: {
      kind: 'circuit',
      durationMin: 9,
      title: '4 tours',
      description: 'Rowing kettlebell 10 par bras + sac du sol vers l\'épaule 5 par côté. Repos 45s entre les tours.',
      rounds: 4,
      restSeconds: 45,
    },
  },
  {
    name: 'Hanches',
    durationMin: 34,
    exercises: [
      { name: 'Pont fessier haltère au sol', sets: 4, reps: [15, 20], rest: 0, group: 'A', cue: 'haltère 30 kg · pause 3s en haut' },
      { name: 'Développé couché haltères', sets: 4, reps: [8, 12], rest: 90, group: 'A', cue: 'banc plat' },
      { name: 'Extension hanche poulie', sets: 3, reps: [12, 15], rest: 0, group: 'B', cue: 'ou leg curl' },
      { name: 'Planche latérale (side plank)', sets: 3, reps: 30, rest: 60, group: 'B', timeBased: true, perSide: 'côté', cue: 'enchaîné' },
      { name: 'Câble crossover (écartés câble)', sets: 2, reps: [12, 15], rest: 0, group: 'C', cue: 'ou pec deck' },
      { name: 'Extension triceps poulie haute', sets: 2, reps: [12, 15], rest: 45, group: 'C', cue: 'barre' },
    ],
    finisher: {
      kind: 'emom',
      durationMin: 8,
      title: 'EMOM 8 min',
      description: 'Chaque minute : 12 swings kettlebell, puis marche avec le sac le reste de la minute.',
      rounds: 8,
    },
  },
]

const yassineRules: CoachRuleSection[] = [
  {
    title: 'Le cadre',
    table: {
      head: ['Élément', 'Valeur'],
      rows: [
        ['Objectif', 'Recomp : muscle, gras, cardio à parts égales + bras'],
        ['Format', '5 séances de 30-34 min'],
        ['Montée en charge', '3 jours S1 → 4 jours S2 → 5 jours dès S3'],
        ['Calories', '2 550 kcal / jour'],
        ['Limitations', 'Sciatique, genou droit, arthrose pieds, coude en poussée'],
      ],
    },
  },
  {
    title: 'Chaque séance',
    items: [
      '4 min prépa posture → 17-20 min force → 8-12 min finisher',
      'Repos force 90s réels, avec la série de gainage dedans',
      'RIR 0-1 sur la force (0 à 1 rep en réserve)',
    ],
  },
  {
    title: 'Les règles qui ne bougent pas',
    items: [
      'Pas de barre en poussée horizontale (coude)',
      'Pas de flexion profonde chargée (genou droit)',
      'Pas de flexion de colonne chargée (sciatique)',
      'Pas de tapis (pieds)',
      'Curls en prise neutre le premier mois (coude)',
    ],
    highlight: 'Une douleur sur un mouvement : tu dis lequel et on le remplace. On ne pousse jamais à travers.',
  },
  {
    title: 'Progression',
    items: [
      'Double progression : tu montes la charge quand tu atteins le haut de la fourchette sur toutes les séries',
      '+5 kg sur machines et poulies, +2,5 kg sur haltères et kettlebell',
      'Sur le cardio tu réduis les pauses, tu n\'accélères pas',
      'Semaines 1-4 en montée, semaine 5 allégée (2 séries, 70 %), puis tu repars',
    ],
  },
  {
    title: 'Cardio — piscine',
    table: {
      head: ['Semaines', 'Format'],
      rows: [
        ['1-3', '2×/sem, 20 × 1 longueur, pause 20-30s au mur'],
        ['4-6', '2-3×/sem, 25 min, de plus en plus continues'],
        ['7+', '1 séance en intervalles, le reste continu'],
      ],
    },
    items: [
      'Ne compte pas dans les 5 séances : c\'est de la récupération active',
      'Vélo ou rameur 20 min en secours. Jamais de tapis.',
      'En nageant : regard vers le fond, expiration continue sous l\'eau, battements petits depuis la hanche',
    ],
    highlight: 'Ce n\'est pas ton gainage qui te fait couler, c\'est ta position de tête.',
  },
  {
    title: 'Nutrition',
    items: [
      '2 550 kcal / jour — 190 g protéines · 85 g lipides · 255 g glucides',
      'Ajustement après 3 semaines, sur la moyenne 7 jours uniquement',
    ],
    table: {
      head: ['Perte hebdo', 'Action'],
      rows: [
        ['< 400 g', '−200 kcal'],
        ['600-800 g', 'Rien'],
        ['> 1 kg', '+200 kcal'],
      ],
    },
    highlight: 'Une pesée isolée ne veut rien dire : tu varies de 1 à 2 kg par jour.',
  },
  {
    title: 'Volume hebdomadaire',
    table: {
      head: ['Muscle', 'Séries'],
      rows: [
        ['Dos', '11'],
        ['Chaîne postérieure', '11'],
        ['Quadriceps', '10'],
        ['Pectoraux', '9'],
        ['Épaules', '9'],
        ['Triceps directes', '7'],
        ['Biceps directes', '7'],
        ['Mollets', '3'],
        ['Gainage', '25-30'],
      ],
    },
    items: ['Tout est dans la zone 7-11 séries, là où tu captes 80-85 % des gains possibles.'],
  },
  {
    title: 'Hors salle',
    items: [
      'Écran au niveau des yeux : à 196 cm, 8h penché défont 4 min d\'échauffement',
      'Nage 10 min le lendemain des jambes, meilleure récup qu\'un étirement',
    ],
  },
  {
    title: 'Calendrier',
    table: {
      head: ['Quand', 'Ce qui bouge'],
      rows: [
        ['Semaine 3', 'Le souffle'],
        ['Semaines 6-8', 'La force monte'],
        ['Semaines 8-12', 'La posture change'],
        ['Semaine 12+', 'Recomposition visible'],
      ],
    },
  },
]

export const yassineProgram: CoachProgramDef = {
  id: 'yassine',
  name: 'Programme coach — Recomp',
  owner: 'Yassine',
  summary: 'Recomp · 5 séances de 30-34 min · prépa posture, supersets, finishers · 3 → 4 → 5 jours',
  version: 2,
  prepRoutine: yassinePrep,
  sessions: yassineSessions,
  weekPlan: { rampUp: [3, 4, 5], deloadEvery: 5 },
  increments: { machine: 5, free: 2.5 },
  homeHint: 'Piscine en récup active, elle ne compte pas dans les séances.',
  rules: yassineRules,
}

// ---------------------------------------------------------------------------
// Janna — fessiers > dos > bras (version finale, septembre 2026)
// ---------------------------------------------------------------------------

/** Activation fessiers/hanches + haut du dos, 3 min, tous les jours. */
const jannaPrep: PrepItem[] = [
  { name: 'Pont fessier au poids du corps', reps: '× 15' },
  { name: 'Marche latérale élastique aux genoux', reps: '10 pas par sens' },
  { name: 'Bird dog', reps: '8 par côté' },
  { name: 'Band pull-apart (élastique)', reps: '× 15' },
]

const jannaSessions: CoachSessionDef[] = [
  {
    name: 'Fessiers 1',
    durationMin: 40,
    exercises: [
      { name: 'Pont fessier haltère au sol', sets: 4, reps: [12, 15], rest: 90, cue: 'pause 2s en haut' },
      { name: 'Squat bulgare haltères', sets: 4, reps: [10, 12], rest: 90, perSide: 'jambe', cue: 'buste penché 45° → le travail passe au fessier' },
      { name: 'Abduction hanche machine', sets: 4, reps: [15, 20], rest: 60 },
      { name: 'Extension hanche poulie', sets: 3, reps: [12, 15], rest: 45, perSide: 'jambe', cue: 'kickback poulie, ou élastique' },
    ],
  },
  {
    name: 'Haut du corps',
    durationMin: 43,
    exercises: [
      { name: 'Rowing câble assis', sets: 4, reps: [10, 12], rest: 90, cue: 'machine, ou haltères' },
      { name: 'Tirage vertical (lat pulldown)', sets: 4, reps: [10, 12], rest: 90, cue: 'prise neutre' },
      { name: 'Développé incliné haltères', sets: 3, reps: [10, 12], rest: 75 },
      { name: 'Rowing haltère unilatéral', sets: 3, reps: [10, 12], rest: 60, perSide: 'bras' },
      { name: 'Curl incliné haltères', sets: 3, reps: [10, 12], rest: 0, group: 'E' },
      { name: 'Extension triceps poulie haute (corde)', sets: 3, reps: [12, 15], rest: 60, group: 'E' },
      { name: 'Curl marteau haltères', sets: 2, reps: [12, 15], rest: 0, group: 'F' },
      { name: 'Extension triceps câble corde (overhead)', sets: 2, reps: [12, 15], rest: 45, group: 'F' },
      { name: 'Élévations latérales', sets: 3, reps: [12, 15], rest: 45, cue: 'rondeur d\'épaule · 3 min' },
    ],
  },
  {
    name: 'Fessiers 2',
    durationMin: 40,
    exercises: [
      { name: 'Soulevé de terre roumain haltères', sets: 4, reps: [10, 12], rest: 90, cue: 'amplitude complète : descends jusqu\'à sentir l\'étirement des ischios' },
      { name: 'Leg press', sets: 4, reps: [12, 15], rest: 90, cue: 'pieds hauts et larges → fessiers/ischios · ou fente marchée' },
      { name: 'Fentes haltères', sets: 3, reps: 10, rest: 60, perSide: 'jambe', cue: 'marchée, ou step-up' },
      { name: 'Abduction hanche machine', sets: 3, reps: [15, 20], rest: 45 },
    ],
  },
]

const jannaRules: CoachRuleSection[] = [
  {
    title: 'Le cadre',
    table: {
      head: ['Élément', 'Valeur'],
      rows: [
        ['Priorités', 'Fessiers > dos > bras'],
        ['Format', '3 séances de 40-43 min, fessiers séparés du haut du corps'],
        ['Calories', '~1 750 kcal / jour, 120-130 g de protéines'],
        ['Perte cible', '300-400 g par semaine, pas plus'],
      ],
    },
  },
  {
    title: 'Les trois détails d\'exécution',
    items: [
      'Buste penché 45° sur la bulgare : transfère le travail du quadriceps vers le fessier. Sans ça, c\'est un exercice de cuisses.',
      'Pieds hauts et larges sur la presse : même logique, la charge passe aux fessiers et ischios.',
      'Amplitude complète sur le RDL : descendre jusqu\'à sentir l\'étirement des ischios, genoux légèrement fléchis, dos droit.',
    ],
    highlight: 'L\'étirement sous charge construit plus que la contraction.',
  },
  {
    title: 'Si un poste est pris',
    table: {
      head: ['Occupé', 'Remplacement'],
      rows: [
        ['Presse', 'Fente marchée haltères'],
        ['Tirage poulie', 'Rowing unilatéral haltère'],
        ['Rowing machine', 'Rowing penché haltères'],
        ['Kickback poulie', 'Kickback élastique'],
        ['Machine abduction', 'Élastique aux cuisses, debout'],
      ],
    },
    items: ['Les deux supersets de fin ne portent que sur des haltères et une poulie : aucun risque de poste occupé.'],
  },
  {
    title: 'Progression',
    items: [
      'Double progression : tu montes la charge quand tu atteins le haut de la fourchette sur toutes les séries',
      '+5 kg sur machines et poulies, +2 kg sur haltères',
      'Semaines 1-4 en montée, semaine 5 allégée (2 séries, 70 %), puis tu repars',
    ],
  },
  {
    title: 'Cardio',
    items: [
      '2 × 25-30 min en zone 2, les jours off',
      'Piscine, vélo, tapis incliné, elliptique',
    ],
    highlight: 'Jamais avant la muscu.',
  },
  {
    title: 'Nutrition',
    items: [
      '~1 750 kcal / jour, 120-130 g de protéines',
      'Perte cible 300-400 g par semaine, pas plus',
    ],
    highlight: 'Le déficit reste léger et ce n\'est pas négociable : construire du fessier en perdant du gras est incompatible avec un déficit agressif.',
  },
  {
    title: 'Volume hebdomadaire',
    table: {
      head: ['Muscle', 'Séries'],
      rows: [
        ['Fessiers', '21'],
        ['Dos', '11'],
        ['Biceps', '8'],
        ['Ischios', '8'],
        ['Quadriceps', '7'],
        ['Triceps', '7'],
        ['Épaules', '6'],
      ],
    },
    items: [
      'Les trois priorités servies dans l\'ordre.',
      'Épaules : 3 séries d\'élévations latérales ajoutées en fin de séance haut du corps pour la rondeur d\'épaule (3 min de plus).',
    ],
  },
  {
    title: 'Calendrier',
    table: {
      head: ['Quand', 'Ce qui bouge'],
      rows: [
        ['Semaines 6-8', 'Fessiers visiblement changés — le muscle qui répond le plus vite quand il n\'a jamais été entraîné sérieusement'],
        ['Mois 3-4', 'Bras affinés — le facteur limitant sera l\'alimentation, pas l\'entraînement'],
      ],
    },
    highlight: 'La graisse locale ne se cible pas, elle part globalement.',
  },
]

export const jannaProgram: CoachProgramDef = {
  id: 'janna',
  name: 'Programme coach — Janna',
  owner: 'Janna',
  summary: 'Fessiers > dos > bras · 3 séances de 40 min · 2 fessiers + 1 haut du corps',
  version: 2,
  prepRoutine: jannaPrep,
  sessions: jannaSessions,
  weekPlan: { rampUp: [3], deloadEvery: 5 },
  increments: { machine: 5, free: 2 },
  homeHint: 'Cardio zone 2 les jours off, 25-30 min, jamais avant la muscu.',
  rules: jannaRules,
}

// ---------------------------------------------------------------------------
// Registre + construction
// ---------------------------------------------------------------------------

export const coachPrograms: CoachProgramDef[] = [yassineProgram, jannaProgram]

/**
 * Définition d'un programme par id. Les programmes stockés avant l'arrivée
 * du second (pas de `coachId`) sont ceux de Yassine.
 */
export function getCoachProgramDef(id: string | undefined): CoachProgramDef {
  return coachPrograms.find((p) => p.id === id) ?? yassineProgram
}

/** Tous les noms d'exos d'un programme (pour les tests et la résolution des ids). */
export function coachExerciseNames(def: CoachProgramDef): string[] {
  return [...new Set(def.sessions.flatMap((s) => s.exercises.map((e) => e.name)))]
}

/**
 * Transforme les définitions en `ProgramSession[]` prêtes à stocker, en
 * résolvant chaque nom vers l'id du catalogue en base.
 * Lève une erreur claire si un exo manque (catalogue pas encore synchronisé).
 */
export function buildCoachSessions(def: CoachProgramDef, catalog: Exercise[]): ProgramSession[] {
  const idByName = new Map(catalog.map((e) => [e.name, e.id!]))
  const missing = coachExerciseNames(def).filter((n) => !idByName.has(n))
  if (missing.length > 0) {
    throw new Error(`Exercices introuvables dans le catalogue : ${missing.join(', ')}`)
  }

  return def.sessions.map((sdef, order) => ({
    name: sdef.name,
    order,
    // Pas d'intensité Force/Volume/Modéré : le programme coach n'a pas ce
    // concept, et l'absence cache les badges correspondants sur Home.
    durationMin: sdef.durationMin,
    coreDuringRest: sdef.coreDuringRest,
    finisher: sdef.finisher,
    exercises: sdef.exercises.map((e, i): ProgramExercise => {
      const [min, max] = Array.isArray(e.reps) ? e.reps : [e.reps, undefined]
      return {
        exerciseId: idByName.get(e.name)!,
        order: i,
        sets: e.sets,
        targetReps: min,
        targetRepsMax: max,
        restSeconds: e.rest,
        isRehab: false,
        isTimeBased: e.timeBased,
        supersetGroup: e.group,
        cue: e.cue,
        perSide: e.perSide,
      }
    }),
  }))
}
