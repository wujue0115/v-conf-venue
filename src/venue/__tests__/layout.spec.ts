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

describe('parseLayout cuts', () => {
  it('keeps numeric stanchion cuts and drops empty or invalid ones', () => {
    const [a, b] = parseLayout([
      { t: 'stanchion', x: 0, z: 0, r: 0, cut: [1.571, 'x'] },
      { t: 'stanchion', x: 1, z: 0, r: 0, cut: [] },
    ])
    expect(a?.cut).toEqual([1.571])
    expect(b).not.toHaveProperty('cut')
  })
})

describe('parseLayout variants', () => {
  it('migrates the old per-colour sofa types', () => {
    const items = parseLayout([
      { t: 'shapeO', x: 0, z: 0, r: 0 },
      { t: 'shapeG', x: 1, z: 0, r: 0 },
    ])
    expect(items.map((i) => [i.t, i.v])).toEqual([
      ['shapeSofa', 'orange'],
      ['shapeSofa', 'green'],
    ])
  })

  it('keeps known variants, defaults unknown ones and drops them on plain types', () => {
    const [a, b, c] = parseLayout([
      { t: 'stoolHigh', x: 0, z: 0, r: 0, v: 'brown' },
      { t: 'stoolHigh', x: 0, z: 0, r: 0, v: 'pink' },
      { t: 'table2', x: 0, z: 0, r: 0, v: 'brown' },
    ])
    expect([a?.v, b?.v]).toEqual(['brown', 'grey'])
    expect(c).not.toHaveProperty('v')
  })
})

describe('posters', () => {
  it('keeps size and image, clamping sizes and dropping non-image data', () => {
    const [a, b] = parseLayout([
      { t: 'poster', x: 1, y: 1.5, z: 2, r: 0, w: 0.6, h: 20, img: 'data:image/jpeg;base64,AAA' },
      { t: 'poster', x: 1, y: 1.5, z: 2, r: 0, img: 'https://example.com/x.png' },
    ])
    expect(a).toMatchObject({ w: 0.6, h: 6, img: 'data:image/jpeg;base64,AAA' })
    expect(b).toMatchObject({ w: 0.594, h: 0.841 })
    expect(b).not.toHaveProperty('img')
  })

  it('keeps the aspect lock only when it is on', () => {
    const [a, b] = parseLayout([
      { t: 'poster', x: 0, z: 0, r: 0, lock: true },
      { t: 'poster', x: 0, z: 0, r: 0, lock: 'yes' },
    ])
    expect(a?.lock).toBe(true)
    expect(b).not.toHaveProperty('lock')
  })

  it('are not charged', () => {
    const { lines, total } = summarizeCost([{ t: 'poster', x: 0, z: 0, r: 0 }], 1, 3)
    expect([lines, total]).toEqual([[], 0])
  })
})

describe('易拉展', () => {
  it('keeps size and image, clamping sizes and dropping non-image data', () => {
    const [a, b] = parseLayout([
      { t: 'rollup', x: 1, z: 2, r: 0, w: 3, h: 20, img: 'data:image/jpeg;base64,AAA' },
      { t: 'rollup', x: 1, z: 2, r: 0, img: 'https://example.com/x.png' },
    ])
    expect(a).toMatchObject({ w: 3, h: 6, img: 'data:image/jpeg;base64,AAA' })
    expect(b).toMatchObject({ w: 0.85, h: 2 })
    expect(b).not.toHaveProperty('img')
  })

  it('is not charged', () => {
    const { lines, total } = summarizeCost([{ t: 'rollup', x: 0, z: 0, r: 0 }], 1, 3)
    expect([lines, total]).toEqual([[], 0])
  })
})
