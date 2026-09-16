import { describe, it, expect } from 'vitest'
import { getCoachWeek, startOfWeek, deloadWeight, isDeloadWeek, targetSessionsForWeek } from '../coach-week'

describe('coach-week', () => {
  it('startOfWeek → lundi 00:00, dimanche compris', () => {
    expect(startOfWeek(new Date(2026, 8, 17, 15)).getDay()).toBe(1) // jeudi 17/09 → lundi 14/09
    expect(startOfWeek(new Date(2026, 8, 17, 15)).getDate()).toBe(14)
    expect(startOfWeek(new Date(2026, 8, 20, 23)).getDate()).toBe(14) // dimanche 20/09 → lundi 14/09
    expect(startOfWeek(new Date(2026, 8, 14, 0, 1)).getDate()).toBe(14) // lundi reste lundi
  })

  it('semaine 1 = semaine calendaire d\'activation, même entamée un jeudi', () => {
    const startedAt = new Date(2026, 8, 17) // jeudi 17 septembre
    expect(getCoachWeek(startedAt, new Date(2026, 8, 17)).week).toBe(1)
    expect(getCoachWeek(startedAt, new Date(2026, 8, 20)).week).toBe(1) // dimanche
    expect(getCoachWeek(startedAt, new Date(2026, 8, 21)).week).toBe(2) // lundi suivant
    expect(getCoachWeek(startedAt, new Date(2026, 9, 5)).week).toBe(4)
    expect(getCoachWeek(startedAt, new Date(2026, 9, 12)).week).toBe(5)
  })

  it('montée en charge 3 → 4 → 5 et semaine allégée toutes les 5 semaines', () => {
    expect(targetSessionsForWeek(1)).toBe(3)
    expect(targetSessionsForWeek(2)).toBe(4)
    expect(targetSessionsForWeek(3)).toBe(5)
    expect(targetSessionsForWeek(9)).toBe(5)
    expect([1, 2, 3, 4].map((w) => isDeloadWeek(w))).toEqual([false, false, false, false])
    expect(isDeloadWeek(5)).toBe(true)
    expect(isDeloadWeek(10)).toBe(true)
    expect(isDeloadWeek(6)).toBe(false)

    const startedAt = new Date(2026, 8, 14)
    const s5 = getCoachWeek(startedAt, new Date(2026, 9, 14))
    expect(s5.week).toBe(5)
    expect(s5.isDeload).toBe(true)
    expect(s5.targetSessions).toBe(5)
  })

  it('plan Janna : 3 séances dès la S1, pas de montée en charge, allégée toutes les 5 semaines', () => {
    const plan = { rampUp: [3], deloadEvery: 5 }
    const startedAt = new Date(2026, 8, 14)
    const s1 = getCoachWeek(startedAt, new Date(2026, 8, 16), plan)
    expect(s1.targetSessions).toBe(3)
    expect(s1.nextTargetSessions).toBeUndefined()
    expect(getCoachWeek(startedAt, new Date(2026, 9, 14), plan).isDeload).toBe(true)
    expect(getCoachWeek(startedAt, new Date(2026, 9, 14), { rampUp: [3], deloadEvery: 0 }).isDeload).toBe(false)
  })

  it('plan Yassine : nextTargetSessions annonce la montée en charge', () => {
    const startedAt = new Date(2026, 8, 14)
    expect(getCoachWeek(startedAt, new Date(2026, 8, 16)).nextTargetSessions).toBe(4)
    expect(getCoachWeek(startedAt, new Date(2026, 8, 23)).nextTargetSessions).toBe(5)
    expect(getCoachWeek(startedAt, new Date(2026, 8, 30)).nextTargetSessions).toBeUndefined()
  })

  it('bornes de semaine : lundi → lundi suivant', () => {
    const info = getCoachWeek(new Date(2026, 8, 14), new Date(2026, 8, 17))
    expect(info.weekStart.getTime()).toBe(new Date(2026, 8, 14).getTime())
    expect(info.weekEnd.getTime()).toBe(new Date(2026, 8, 21).getTime())
  })

  it('charge allégée = 70 % arrondi au 2,5 kg', () => {
    expect(deloadWeight(20)).toBe(15)   // 14 → 15
    expect(deloadWeight(40)).toBe(27.5) // 28 → 27.5
    expect(deloadWeight(60)).toBe(42.5) // 42 → 42.5
    expect(deloadWeight(0)).toBeNull()
    expect(deloadWeight(null)).toBeNull()
  })
})
