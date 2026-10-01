import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { rateLimited } from '../realtime'

describe('presence updates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Supabase closes the channel of a client sending more than 5 in 30 seconds
  it('stay at 4 per 30 seconds, the rest waiting', () => {
    const sent: number[] = []
    const p = rateLimited<number>((n) => sent.push(n))
    for (let i = 1; i <= 10; i++) p.push(i)
    expect(sent).toEqual([1, 2, 3, 4])
    vi.advanceTimersByTime(29_000)
    expect(sent).toEqual([1, 2, 3, 4])
    vi.advanceTimersByTime(1_100)
    // only the latest of those that waited
    expect(sent).toEqual([1, 2, 3, 4, 10])
  })

  it('never go over the budget in any 30 seconds, however they come', () => {
    const at: number[] = []
    const p = rateLimited<number>(() => at.push(Date.now()))
    for (let i = 0; i < 200; i++) {
      p.push(i)
      vi.advanceTimersByTime(700)
    }
    vi.runAllTimers()
    for (let i = 4; i < at.length; i++) expect(at[i]! - at[i - 4]!).toBeGreaterThanOrEqual(30_000)
  })

  it('send nothing once stopped', () => {
    const sent: number[] = []
    const p = rateLimited<number>((n) => sent.push(n))
    for (let i = 1; i <= 6; i++) p.push(i)
    p.stop()
    vi.runAllTimers()
    expect(sent).toEqual([1, 2, 3, 4])
  })
})
