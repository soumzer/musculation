/**
 * Semaines du programme coach — montée en charge et semaine allégée.
 *
 * Semaine 1 = la semaine calendaire (lundi → dimanche) qui contient la date
 * d'activation, même entamée un jeudi. Ensuite une semaine par semaine
 * calendaire, ce qui colle à « cette semaine » sur l'écran d'accueil.
 *
 * Le plan (montée en charge, cadence de la semaine allégée) vient du programme
 * coach : Yassine = 3 → 4 → 5 séances, allégée toutes les 5 semaines ;
 * Janna = 3 séances dès la S1, allégée toutes les 5 semaines.
 */

import type { CoachWeekPlan } from '../data/coach-program'

export interface CoachWeekInfo {
  /** Numéro de semaine, 1 = semaine d'activation. */
  week: number
  /** Séances visées cette semaine (3 → 4 → 5). */
  targetSessions: number
  /** Cible de la semaine suivante si elle change (montée en charge). */
  nextTargetSessions?: number
  /** Semaine allégée : 2 séries à 70 %. */
  isDeload: boolean
  /** Lundi 00:00 de la semaine courante. */
  weekStart: Date
  /** Lundi 00:00 de la semaine suivante (borne exclue). */
  weekEnd: Date
}

export const DELOAD_SETS = 2
export const DELOAD_LOAD_FACTOR = 0.7

/** Plan par défaut (programme de Yassine) : 3 → 4 → 5 séances, allégée toutes les 5 semaines. */
export const DEFAULT_WEEK_PLAN: CoachWeekPlan = { rampUp: [3, 4, 5], deloadEvery: 5 }

/** Lundi 00:00 (heure locale) de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = out.getDay() // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day
  out.setDate(out.getDate() + diff)
  return out
}

export function targetSessionsForWeek(week: number, rampUp: number[] = DEFAULT_WEEK_PLAN.rampUp): number {
  const idx = Math.min(Math.max(week, 1), rampUp.length) - 1
  return rampUp[idx]
}

export function isDeloadWeek(week: number, deloadEvery: number = DEFAULT_WEEK_PLAN.deloadEvery): boolean {
  return deloadEvery > 0 && week > 0 && week % deloadEvery === 0
}

export function getCoachWeek(startedAt: Date, now: Date = new Date(), plan: CoachWeekPlan = DEFAULT_WEEK_PLAN): CoachWeekInfo {
  const firstWeekStart = startOfWeek(startedAt)
  const weekStart = startOfWeek(now)
  const weeksElapsed = Math.round((weekStart.getTime() - firstWeekStart.getTime()) / (7 * 24 * 3600 * 1000))
  const week = Math.max(1, weeksElapsed + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  return {
    week,
    targetSessions: targetSessionsForWeek(week, plan.rampUp),
    /** Cible de la semaine suivante si elle change (montée en charge), sinon undefined. */
    nextTargetSessions: targetSessionsForWeek(week + 1, plan.rampUp) !== targetSessionsForWeek(week, plan.rampUp)
      ? targetSessionsForWeek(week + 1, plan.rampUp)
      : undefined,
    isDeload: isDeloadWeek(week, plan.deloadEvery),
    weekStart,
    weekEnd,
  }
}

/** Charge allégée arrondie au 2,5 kg le plus proche (0 si pas d'historique). */
export function deloadWeight(lastWeightKg: number | null): number | null {
  if (lastWeightKg === null || lastWeightKg <= 0) return null
  return Math.round((lastWeightKg * DELOAD_LOAD_FACTOR) / 2.5) * 2.5
}
