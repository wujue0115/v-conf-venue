import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { allRows, CloudError } from '../projects'

/** A table of `n` rows served as the API does: at most 1000 to a request */
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => i)
  const asked: [number, number][] = []
  const page = async (from: number, to: number) => {
    asked.push([from, to])
    return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null, status: 200 }
  }
  return { rows, asked, page }
}

describe('allRows', () => {
  // 15 scenes of about 110 items: the API's 1000 left the rest out without an error
  it('reads past the API’s max rows', async () => {
    const t = table(1590)
    expect(await allRows(t.page)).toEqual(t.rows)
    expect(t.asked).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('asks once when one page holds them all', async () => {
    const t = table(300)
    expect(await allRows(t.page)).toEqual(t.rows)
    expect(t.asked).toHaveLength(1)
  })

  it('asks again after a page that is exactly full', async () => {
    const t = table(2000)
    expect(await allRows(t.page)).toEqual(t.rows)
    expect(t.asked).toHaveLength(3)
  })

  it('throws a page’s error', async () => {
    const page = async () => ({ data: null, error: { message: 'boom' }, status: 500 })
    await expect(allRows(page)).rejects.toBeInstanceOf(CloudError)
  })
})
