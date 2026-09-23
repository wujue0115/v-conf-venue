import { describe, expect, it } from 'vitest'
import {
  clampSlots,
  demoLayout,
  formatNT,
  parseLayout,
  summarizeCost,
  type LayoutItem,
} from '../layout'

describe('summarizeCost', () => {
  const items: LayoutItem[] = [
    { t: 'stoolHigh', x: 0, z: 0, r: 0 },
    { t: 'stoolHigh', x: 1, z: 0, r: 0 },
    { t: 'sign', x: 2, z: 0, r: 0 },
  ]

  it('groups by type in catalogue order and multiplies by slots', () => {
    const { lines, total } = summarizeCost(items, 0, 2)
    expect(lines.map((l) => [l.type, l.count, l.subtotal])).toEqual([
      ['stoolHigh', 2, 350 * 2 * 2],
      ['sign', 1, 300 * 2],
    ])
    expect(total).toBe(1400 + 600)
  })

  it('uses the carrying-service price in mode 1', () => {
    expect(summarizeCost(items, 1, 1).total).toBe(550 * 2 + 500)
  })

  it('prices the demo layout', () => {
    expect(summarizeCost(demoLayout(), 0, 1).total).toBeGreaterThan(0)
  })
})

describe('parseLayout', () => {
  it('accepts exported files and bare arrays, dropping unknown entries', () => {
    const items = [
      { t: 'table2', x: 1, y: 0, z: 2, r: 0.5 },
      { t: 'rocket', x: 0, z: 0 },
      { t: 'sign', x: 'a', z: 0 },
    ]
    expect(parseLayout({ items })).toEqual([{ t: 'table2', x: 1, y: 0, z: 2, r: 0.5 }])
    expect(parseLayout(items)).toHaveLength(1)
  })

  it('throws on non-layout data', () => {
    expect(() => parseLayout({ foo: 1 })).toThrow('Invalid layout')
    expect(() => parseLayout(null)).toThrow('Invalid layout')
  })
})

describe('helpers', () => {
  it('clamps slots to 1–9', () => {
    expect([clampSlots(0), clampSlots(3.7), clampSlots(42), clampSlots(NaN)]).toEqual([1, 3, 9, 1])
  })
  it('formats NT dollars', () => {
    expect(formatNT(12345)).toBe('NT$ 12,345')
  })
})
