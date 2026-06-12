/**
 * Styles des intensités de séance (système DUP : Force / Volume / Modéré).
 * Source unique — était dupliqué dans HomePage, SessionPage, ExerciseNotebook
 * et DashboardPage avec des libellés qui divergeaient.
 */
export interface IntensityStyle {
  label: string
  letter: string
  text: string
  bg: string
  bar: string
  /** Couleur hexadécimale pour les tracés SVG (graphique de tonnage). */
  stroke: string
}

export const INTENSITY_STYLES: Record<string, IntensityStyle> = {
  heavy:    { label: 'Force',  letter: 'F', text: 'text-indigo-400',  bg: 'bg-indigo-500/20',  bar: 'bg-indigo-500',  stroke: '#6366f1' },
  volume:   { label: 'Volume', letter: 'V', text: 'text-emerald-400', bg: 'bg-emerald-500/20', bar: 'bg-emerald-500', stroke: '#10b981' },
  moderate: { label: 'Modéré', letter: 'M', text: 'text-amber-400',   bg: 'bg-amber-500/20',   bar: 'bg-amber-500',   stroke: '#f59e0b' },
}
