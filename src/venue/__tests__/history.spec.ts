import { describe, expect, it } from 'vitest'
import { rebaseStep } from '../history'
import type { LayoutItem } from '../layout'

const item = (id: string, x: number): LayoutItem => ({ id, t: 'sign', x, z: 0, r: 0 })
const xs = (step: string) => (JSON.parse(step) as LayoutItem[]).map((i) => [i.id, i.x])

describe('undo history alongside other people’s changes', () => {
  // the step: this person had A at 1 and B at 2 before moving A
  const step = JSON.stringify([item('A', 1), item('B', 2)])

  it('takes on their change to an item, so undo leaves it standing', () => {
    expect(xs(rebaseStep(step, new Map([['B', item('B', 9)]]), new Set()))).toEqual([
      ['A', 1],
      ['B', 9],
    ])
  })

  it('takes on what they added and removed', () => {
    const out = rebaseStep(step, new Map([['C', item('C', 5)]]), new Set(['B']))
    expect(xs(out)).toEqual([
      ['A', 1],
      ['C', 5],
    ])
  })
})
