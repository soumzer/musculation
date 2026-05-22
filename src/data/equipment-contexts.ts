import type { Category, EquipmentOption } from './equipment-options'
import { categories } from './equipment-options'

// ---------------------------------------------------------------------------
// Equipment contexts — the user picks a context first, then refines.
// The tags produced are the same ones the engine already understands
// (pull_up_bar, dumbbell, leg_press, …) — only the UI changes.
// ---------------------------------------------------------------------------

export type ContextId = 'home' | 'street' | 'gym' | 'home_gym'

export interface EquipmentContext {
  id: ContextId
  emoji: string
  label: string
  description: string
  /** Tags always included when this context is chosen — not user-toggleable. */
  baseTags: string[]
  /** Human-readable summary of `baseTags`, shown as "Inclus : …". */
  baseLabel?: string
  /** Refinement options shown in step 2 (grouped; empty title = no header). */
  refine: Category[]
  /** Whether refinement options start checked when the context is picked. */
  refineDefaultChecked: boolean
}

// Curated refinement options — tags match data/exercises.ts equipmentNeeded.
const MAT: EquipmentOption = { tag: 'mat', label: 'Tapis de sol', type: 'other' }
const BAND: EquipmentOption = { tag: 'resistance_band', label: 'Bandes élastiques', type: 'band' }
const DUMBBELL: EquipmentOption = { tag: 'dumbbell', label: 'Haltères', type: 'free_weight', alsoAdd: ['dumbbells'] }
const KETTLEBELL: EquipmentOption = { tag: 'kettlebell', label: 'Kettlebell', type: 'free_weight' }

export const EQUIPMENT_CONTEXTS: EquipmentContext[] = [
  {
    id: 'home',
    emoji: '🏠',
    label: 'Maison',
    description: 'Poids de corps + accessoires légers',
    baseTags: [],
    refineDefaultChecked: false,
    refine: [{ title: '', items: [MAT, BAND, DUMBBELL, KETTLEBELL] }],
  },
  {
    id: 'street',
    emoji: '🌳',
    label: 'Street Workout',
    description: 'Barre de traction + dips + poids de corps',
    baseTags: ['pull_up_bar', 'dip_station'],
    baseLabel: 'barre de traction + dips',
    refineDefaultChecked: false,
    refine: [{
      title: '',
      items: [{ tag: 'dumbbell', label: 'Haltères lestés', type: 'free_weight', alsoAdd: ['dumbbells'] }],
    }],
  },
  {
    id: 'gym',
    emoji: '🏋️',
    label: 'Salle de sport',
    description: 'Matériel complet',
    baseTags: [],
    refineDefaultChecked: true,
    refine: categories,
  },
  {
    id: 'home_gym',
    emoji: '⚙️',
    label: 'Home Gym',
    description: 'Matériel partiel — à définir',
    baseTags: [],
    refineDefaultChecked: false,
    refine: categories,
  },
]

export function contextById(id: ContextId): EquipmentContext {
  const ctx = EQUIPMENT_CONTEXTS.find((c) => c.id === id)
  if (!ctx) throw new Error(`Unknown equipment context: ${id}`)
  return ctx
}

/** Default tag set applied when a context is freshly picked. */
export function defaultTagsForContext(ctx: EquipmentContext): string[] {
  const tags = new Set(ctx.baseTags)
  if (ctx.refineDefaultChecked) {
    for (const cat of ctx.refine) {
      for (const opt of cat.items) {
        tags.add(opt.tag)
        for (const extra of opt.alsoAdd ?? []) tags.add(extra)
      }
    }
  }
  return [...tags]
}
