import { describe, expect, it } from 'vitest'
import { rebaseStep, touchesLocked } from '../history'
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

describe('undo steps and zones locked against editing', () => {
  const zone = (locked: boolean): LayoutItem => ({
    id: 'Z',
    t: 'zone',
    x: 0,
    z: 0,
    r: 0,
    w: 4,
    d: 2,
    ...(locked ? { locked: true } : {}),
  })

  it('refuses a step moving something out of a zone someone locked since', () => {
    // this person moved A into the zone's area; then someone else locked the zone
    expect(touchesLocked([zone(true), item('A', 1)], [zone(true), item('A', 5)])).toBe(true)
  })

  it('refuses a step putting something into a locked zone, or taking one away', () => {
    expect(touchesLocked([zone(true), item('A', 5)], [zone(true), item('A', 1)])).toBe(true)
    expect(touchesLocked([zone(true)], [zone(true), item('A', 1)])).toBe(true)
    expect(touchesLocked([zone(true), item('A', 1)], [zone(true)])).toBe(true)
  })

  it('refuses a step changing the locked zone itself', () => {
    expect(touchesLocked([zone(true)], [{ ...zone(true), w: 2 }])).toBe(true)
    expect(touchesLocked([zone(true)], [])).toBe(true)
  })

  it('lets locking or unlocking be undone, and leaves what is elsewhere alone', () => {
    expect(touchesLocked([zone(true), item('A', 1)], [zone(false), item('A', 1)])).toBe(false)
    expect(touchesLocked([zone(false), item('A', 1)], [zone(true), item('A', 1)])).toBe(false)
    expect(touchesLocked([zone(true), item('A', 5)], [zone(true), item('A', 7)])).toBe(false)
  })

  it('reads an item the same whatever order its keys are in', () => {
    const a: LayoutItem = { id: 'A', t: 'sign', x: 1, z: 0, r: 0 }
    const b: LayoutItem = { r: 0, z: 0, x: 1, t: 'sign', id: 'A' }
    expect(touchesLocked([zone(true), a], [zone(true), b])).toBe(false)
  })
})
