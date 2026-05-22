import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboarding } from './useOnboarding'
import { db } from '../db'

describe('useOnboarding', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('starts at step 1', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.state.step).toBe(1)
  })

  it('navigates forward and backward', () => {
    const { result } = renderHook(() => useOnboarding())
    act(() => result.current.nextStep())
    expect(result.current.state.step).toBe(2)
    act(() => result.current.prevStep())
    expect(result.current.state.step).toBe(1)
    act(() => result.current.prevStep())
    expect(result.current.state.step).toBe(1)
  })

  it('does not exceed total steps', () => {
    const { result } = renderHook(() => useOnboarding())
    for (let i = 0; i < 10; i++) act(() => result.current.nextStep())
    expect(result.current.state.step).toBe(5)
  })

  it('submits profile to database', async () => {
    const { result } = renderHook(() => useOnboarding())
    act(() => {
      result.current.updateBody({ name: 'Yassine' })
      result.current.updateSchedule(4, 90)
    })
    let userId: number
    await act(async () => { userId = await result.current.submit() })
    const user = await db.userProfiles.get(userId!)
    expect(user!.name).toBe('Yassine')
  })

  it('submits health conditions', async () => {
    const { result } = renderHook(() => useOnboarding())
    act(() => {
      result.current.updateBody({ name: 'Test' })
      result.current.updateConditions([{
        bodyZone: 'elbow_right', label: 'Golf elbow',
        diagnosis: 'Epicondylite mediale',
        since: '1 an', notes: '', isActive: true,
      }])
    })
    let userId: number
    await act(async () => { userId = await result.current.submit() })
    const conditions = await db.healthConditions.where('userId').equals(userId!).toArray()
    expect(conditions).toHaveLength(1)
    expect(conditions[0].bodyZone).toBe('elbow_right')
  })
})
