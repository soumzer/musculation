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

export type CoachProgramId = 'yassine' | 'janna' | 'kettlebell'

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
  /** Complexe enchaîné au chrono avec compteur de tours (Iron Cardio). */
  continuousComplex?: boolean
  /** Paliers successifs. Le palier 1 doit décrire la prescription ci-dessus. */
  ladder?: CoachLadderStep[]
}

export interface CoachSessionDef {
  name: string
  durationMin: number
  exercises: CoachExerciseDef[]
  coreDuringRest?: { name: string; detail: string }
  finisher?: Finisher
  /**
   * Critères à cocher en fin de séance (progression autorégulée). Validés sur
   * DEUX séances de suite, ils débloquent le palier suivant.
   */
  criteria?: string[]
}

/**
 * Un palier d'un exercice à progression autorégulée. Monter d'un palier
 * réécrit la prescription de l'exo dans le programme stocké.
 */
export interface CoachLadderStep {
  /** Libellé affiché : « 14 kg — 18 min », « 16 kg · 5×10/bras ». */
  label: string
  /** Charge du palier (0 = poids de corps). */
  weightKg?: number
  /** Complexe au chrono : durée du palier, en secondes. */
  durationSeconds?: number
  /** Séries / reps si le palier les change. */
  sets?: number
  reps?: number
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
  /** Sous-titre de l'écran de prépa. Défaut : « 4 min · tous les jours ». */
  prepLabel?: string
  /** Mobilité fixe affichée à la place du cooldown automatique (optionnel). */
  cooldownRoutine?: PrepItem[]
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
// Kettlebell maison — progression autorégulée par paliers (octobre 2026)
// ---------------------------------------------------------------------------

/** Échauffement — 5 min, avant chaque séance. Remplace l'échauffement standard. */
const kettlebellPrep: PrepItem[] = [
  { name: 'Cat-cow (dos chat / dos creux)', reps: '10 reps lentes' },
  { name: "World's greatest stretch", reps: '3 par côté' },
  { name: 'Halo kettlebell 8 kg', reps: '5 tours par sens' },
]

/** Mobilité — 5 min, après chaque séance. Remplace le cooldown automatique. */
const kettlebellCooldown: PrepItem[] = [
  { name: 'Suspension à la barre', reps: '2 × 30s' },
  { name: 'Squat profond tenu', reps: '2 × 45s' },
  { name: 'Posture du pigeon', reps: '45s par côté' },
]

/** Paliers de l'Iron Cardio. Quand la charge monte, la durée redescend. */
const ironCardioLadder: CoachLadderStep[] = [
  { label: '12 kg — 12 min (technique seulement)', weightKg: 12, durationSeconds: 720 },
  { label: '14 kg — 15 min', weightKg: 14, durationSeconds: 900 },
  { label: '14 kg — 18 min', weightKg: 14, durationSeconds: 1080 },
  { label: '14 kg — 20 min', weightKg: 14, durationSeconds: 1200 },
  { label: '16 kg — 12 min', weightKg: 16, durationSeconds: 720 },
  { label: '16 kg — 15 min', weightKg: 16, durationSeconds: 900 },
  { label: '16 kg — 18 min', weightKg: 16, durationSeconds: 1080 },
  { label: '16 kg — 20 min', weightKg: 16, durationSeconds: 1200 },
  { label: '16 kg — 20 min, complexe plus dur : 1 clean + 2 press + 1 squat', weightKg: 16, durationSeconds: 1200 },
]

const swingLadder: CoachLadderStep[] = [
  { label: '14 kg · 5 × 8 par bras', weightKg: 14, sets: 5, reps: 8 },
  { label: '16 kg · 5 × 8 par bras', weightKg: 16, sets: 5, reps: 8 },
  { label: '16 kg · 5 × 10 par bras', weightKg: 16, sets: 5, reps: 10 },
]

const bulgareLadder: CoachLadderStep[] = [
  { label: 'poids de corps · 3 × 8 par jambe', weightKg: 0, sets: 3, reps: 8 },
  { label: '12 kg · 3 × 8 par jambe', weightKg: 12, sets: 3, reps: 8 },
  { label: '16 kg · 3 × 8 par jambe', weightKg: 16, sets: 3, reps: 8 },
]

/** Les 3 critères à cocher en fin de séance Iron Cardio. */
const ironCardioCriteria = [
  'Press strict du début à la fin',
  'Respiration par le nez la majeure partie du temps',
  'Aucune douleur articulaire le lendemain',
]

/**
 * Séance A — jouée le lundi ET le vendredi. Elle apparaît donc deux fois dans
 * la liste : l'app enchaîne les séances dans l'ordre, et repère où elle en est
 * par le NOM de la dernière séance faite. Deux entrées de même nom casseraient
 * ce repère, d'où le suffixe « — lundi » / « — vendredi » (les pastilles de
 * l'accueil le retirent à l'affichage).
 */
const ironCardioExercises: CoachExerciseDef[] = [
  {
    name: 'Iron Cardio (clean + press + squat kettlebell)',
    sets: 1,
    reps: 720,
    rest: 120,
    timeBased: true,
    continuousComplex: true,
    ladder: ironCardioLadder,
    cue: '1 clean + 1 press + 1 squat — change de bras à chaque tour',
  },
  {
    name: 'Pompes classiques',
    sets: 3,
    reps: [10, 25],
    rest: 90,
    cue: 'arrête-toi quand il reste 2 reps — jamais à l\'échec',
  },
  {
    name: 'Traction (pull-up)',
    sets: 3,
    reps: [6, 8],
    rest: 120,
    cue: 'trop dur ? « Changer » → Rowing inversé ou Traction excentrique',
  },
]

const kettlebellSessions: CoachSessionDef[] = [
  {
    name: 'Iron Cardio — lundi',
    durationMin: 40,
    exercises: ironCardioExercises,
    criteria: ironCardioCriteria,
  },
  {
    name: 'Puissance + cuisses',
    durationMin: 35,
    exercises: [
      {
        name: 'Saut vertical sur place',
        sets: 5,
        reps: 3,
        rest: 60,
        cue: 'réception silencieuse, tiens 2s — arrête si ça devient lourd',
      },
      {
        name: 'Kettlebell swing à un bras',
        sets: 5,
        reps: 8,
        rest: 75,
        perSide: 'bras',
        ladder: swingLadder,
        cue: 'charnière de hanche — le bras ne tire pas',
      },
      {
        name: 'Squat bulgare kettlebell (goblet)',
        sets: 3,
        reps: 8,
        rest: 90,
        perSide: 'jambe',
        ladder: bulgareLadder,
        cue: 'pied arrière sur le banc — 0 kg = poids de corps',
      },
    ],
  },
  {
    name: 'Iron Cardio — vendredi',
    durationMin: 40,
    exercises: ironCardioExercises,
    criteria: ironCardioCriteria,
  },
  {
    name: 'Récupération active',
    durationMin: 20,
    exercises: [
      {
        name: 'Kettlebell swing',
        sets: 5,
        reps: 10,
        rest: 60,
        cue: 'sans chercher la fatigue — 10 à 14 kg',
      },
      {
        name: 'Turkish get-up kettlebell',
        sets: 3,
        reps: 1,
        rest: 60,
        perSide: 'côté',
        cue: 'lentement, regarde la kettlebell tout le long',
      },
    ],
  },
]

const kettlebellRules: CoachRuleSection[] = [
  {
    title: 'Matériel',
    items: [
      'Kettlebells simples de 6, 8, 10, 12, 14 et 16 kg — aucune paire',
      'Barre de traction + un banc',
      'Rien d\'autre : pas de pompes les mains sur les kettlebells (le poignet bascule)',
    ],
  },
  {
    title: 'La semaine',
    table: {
      head: ['Jour', 'Séance'],
      rows: [
        ['Lundi', 'Iron Cardio + haut du corps'],
        ['Mercredi', 'Puissance + cuisses'],
        ['Vendredi', 'Iron Cardio + haut du corps'],
        ['Samedi', 'Récupération active — si tu le sens'],
      ],
    },
    highlight: 'Mardi, jeudi, dimanche : repos.',
  },
  {
    title: 'Monter d\'un palier — les 3 critères',
    items: [
      'Press strict du début à la fin : pas de push press, pas de cambrure',
      'Respiration par le nez possible la majeure partie de la séance',
      'Aucune douleur articulaire le lendemain — les courbatures ne comptent pas',
    ],
    highlight: 'Les 3 validés sur 2 séances de suite = tu peux monter. Sinon tu restes où tu es.',
  },
  {
    title: 'Paliers — Iron Cardio',
    table: {
      head: ['Palier', 'Charge et durée'],
      rows: [
        ['1', '12 kg — 12 min (technique seulement)'],
        ['2', '14 kg — 15 min'],
        ['3', '14 kg — 18 min'],
        ['4', '14 kg — 20 min'],
        ['5', '16 kg — 12 min'],
        ['6', '16 kg — 15 min'],
        ['7', '16 kg — 18 min'],
        ['8', '16 kg — 20 min'],
        ['9', '16 kg — complexe plus dur : 1 clean + 2 press + 1 squat'],
      ],
    },
    highlight: 'Quand la charge monte, la durée redescend.',
  },
  {
    title: 'Paliers — mercredi',
    table: {
      head: ['Exercice', 'Paliers'],
      rows: [
        ['Swing à un bras', '14 kg 5×8 → 16 kg 5×8 → 16 kg 5×10'],
        ['Squat bulgare', 'poids de corps → 12 kg → 16 kg (3×8 par jambe)'],
      ],
    },
  },
  {
    title: 'Fatigue',
    items: [
      'Mauvaise nuit, grosse journée : même charge, durée réduite d\'un tiers',
      'Vraiment cuit : fais la séance de récupération active à la place',
      'Douleur articulaire sur un exo : tu le passes, tu fais le reste',
    ],
    highlight: 'Toutes les 6 à 8 semaines si la fatigue s\'accumule : une semaine allégée, moitié du volume, même charge.',
  },
  {
    title: 'Ce qu\'on regarde',
    items: [
      'Le nombre de tours d\'Iron Cardio par séance — c\'est LE chiffre qui compte',
      'Les charges utilisées et la date du dernier palier franchi',
      'Aucun palier franchi depuis 3 semaines : il est temps de changer de stimulus',
    ],
  },
]

export const kettlebellProgram: CoachProgramDef = {
  id: 'kettlebell',
  name: 'Programme kettlebell — maison',
  owner: 'Kettlebell maison',
  summary: '3 séances · KB 6-16 kg + barre de traction · progression par paliers',
  version: 1,
  prepRoutine: kettlebellPrep,
  prepLabel: '5 min · avant chaque séance',
  cooldownRoutine: kettlebellCooldown,
  sessions: kettlebellSessions,
  weekPlan: { rampUp: [3], deloadEvery: 0 },
  increments: { machine: 5, free: 2 },
  homeHint: 'Lundi et vendredi Iron Cardio, mercredi puissance. Samedi récup active si tu le sens.',
  rules: kettlebellRules,
}

// ---------------------------------------------------------------------------
// Registre + construction
// ---------------------------------------------------------------------------

export const coachPrograms: CoachProgramDef[] = [yassineProgram, jannaProgram, kettlebellProgram]

/**
 * Définition d'un programme par id. Les programmes stockés avant l'arrivée
 * du second (pas de `coachId`) sont ceux de Yassine.
 */
export function getCoachProgramDef(id: string | undefined): CoachProgramDef {
  return coachPrograms.find((p) => p.id === id) ?? yassineProgram
}

// ---------------------------------------------------------------------------
// Progression autorégulée par paliers
// ---------------------------------------------------------------------------

/** Les exos du programme qui progressent par paliers, dans l'ordre des séances. */
export function ladderExercises(def: CoachProgramDef): { name: string; ladder: CoachLadderStep[] }[] {
  const out: { name: string; ladder: CoachLadderStep[] }[] = []
  const seen = new Set<string>()
  for (const sdef of def.sessions) {
    for (const e of sdef.exercises) {
      if (!e.ladder || seen.has(e.name)) continue
      seen.add(e.name)
      out.push({ name: e.name, ladder: e.ladder })
    }
  }
  return out
}

/** Index de palier valide (borné), 0 par défaut. */
export function ladderStepIndex(ladder: CoachLadderStep[], stored: number | undefined): number {
  return Math.min(Math.max(stored ?? 0, 0), ladder.length - 1)
}

/**
 * Réécrit la prescription des exos à paliers selon `ladder` (index par nom
 * d'exo). Appelée quand on monte d'un palier, et à chaque mise à jour du
 * programme pour ne pas renvoyer l'utilisateur au premier palier.
 */
export function applyLadder(
  def: CoachProgramDef,
  sessions: ProgramSession[],
  ladder: Record<string, number> | undefined,
  catalog: Exercise[],
): ProgramSession[] {
  if (!ladder || Object.keys(ladder).length === 0) return sessions
  const idByName = new Map(catalog.filter((e) => e.id !== undefined).map((e) => [e.name, e.id!]))
  const stepById = new Map<number, CoachLadderStep>()
  for (const { name, ladder: steps } of ladderExercises(def)) {
    const id = idByName.get(name)
    if (id === undefined) continue
    stepById.set(id, steps[ladderStepIndex(steps, ladder[name])])
  }
  if (stepById.size === 0) return sessions

  return sessions.map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      const step = stepById.get(e.exerciseId)
      if (!step) return e
      return {
        ...e,
        sets: step.sets ?? e.sets,
        targetReps: step.durationSeconds ?? step.reps ?? e.targetReps,
        ladderLabel: step.label,
        ladderWeightKg: step.weightKg,
      }
    }),
  }))
}

/**
 * Le palier suivant est débloqué quand les critères ont été validés sur les
 * DEUX dernières séances concernées. Une séance ratée remet le compteur à zéro.
 */
export function canAdvanceLadder(criteria: { date: string; ok: boolean }[] | undefined): boolean {
  if (!criteria || criteria.length < 2) return false
  return criteria.slice(-2).every((c) => c.ok)
}

// ---------------------------------------------------------------------------
// Semaine allégée à la demande + changement de stimulus
// ---------------------------------------------------------------------------

/** Durée d'une semaine allégée déclenchée à la main. */
export const LIGHT_WEEK_DAYS = 7

/** Sans palier franchi depuis ce délai, le programme propose de changer de stimulus. */
export const STIMULUS_STALE_DAYS = 21

export function lightWeekEnd(from: Date = new Date()): string {
  const end = new Date(from)
  end.setDate(end.getDate() + LIGHT_WEEK_DAYS)
  return end.toISOString()
}

export function isLightWeekActive(until: string | undefined, now: Date = new Date()): boolean {
  return until !== undefined && new Date(until).getTime() > now.getTime()
}

/**
 * Semaine allégée : moitié du volume, MÊME charge. Les séries sont divisées
 * par deux (jamais moins d'une) et les chronos aussi ; les répétitions et les
 * charges ne bougent pas — c'est le volume qu'on baisse, pas l'intensité.
 */
export function applyLightWeek(sessions: ProgramSession[], active: boolean): ProgramSession[] {
  if (!active) return sessions
  return sessions.map((s) => ({
    ...s,
    durationMin: s.durationMin !== undefined ? Math.round(s.durationMin / 2) : undefined,
    exercises: s.exercises.map((e) => ({
      ...e,
      sets: Math.max(1, Math.round(e.sets / 2)),
      targetReps: e.isTimeBased ? Math.max(30, Math.round(e.targetReps / 2)) : e.targetReps,
      // Le palier reste celui qu'on a atteint, mais son libellé annoncerait
      // une durée et un volume qu'on ne fait pas cette semaine.
      ladderLabel: e.ladderLabel !== undefined ? `${e.ladderLabel} · allégé de moitié` : undefined,
    })),
  }))
}

/** Aucun palier franchi depuis 3 semaines → il est temps de changer de stimulus. */
export function shouldChangeStimulus(
  lastAdvanceAt: string | undefined,
  startedAt: Date | undefined,
  now: Date = new Date(),
): boolean {
  const since = lastAdvanceAt ? new Date(lastAdvanceAt) : startedAt
  if (!since) return false
  const days = (now.getTime() - since.getTime()) / (24 * 3600 * 1000)
  return days >= STIMULUS_STALE_DAYS
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
    criteria: sdef.criteria,
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
        continuousComplex: e.continuousComplex,
        ladderLabel: e.ladder?.[0].label,
        ladderWeightKg: e.ladder?.[0].weightKg,
        supersetGroup: e.group,
        cue: e.cue,
        perSide: e.perSide,
      }
    }),
  }))
}
