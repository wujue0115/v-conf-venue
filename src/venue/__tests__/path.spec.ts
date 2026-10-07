import { describe, expect, it } from 'vitest'
import { linkKey, nearestOnPath, pathGraph } from '../path'

const at = (spots: Record<string, [number, number]>) => (id: string) => {
  const [x, z] = spots[id]!
  return { x, z }
}

describe('paths', () => {
  it('link points both ways, once, leaving out links to points that are gone', () => {
    const g = pathGraph([
      { id: 'a', links: ['b', 'gone'] },
      { id: 'b', links: ['a', 'c'] },
      { id: 'c' },
    ])
    expect(g.links).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect([...g.adj.get('b')!].sort()).toEqual(['a', 'c'])
    // the way they were drawn: a to b to c
    expect([g.out.get('a'), g.out.get('b'), g.out.get('c')]).toEqual([['b'], ['c'], []])
  })

  it('make one path of points linked through others', () => {
    const g = pathGraph([
      { id: 'a', links: ['b'] },
      { id: 'b' },
      { id: 'c', links: ['d'] },
      { id: 'd' },
    ])
    expect(g.path.get('a')).toBe(g.path.get('b'))
    expect(g.path.get('c')).toBe(g.path.get('d'))
    expect(g.path.get('a')).not.toBe(g.path.get('c'))
  })

  it('walk on their own along each link set to, the way it was drawn', () => {
    const g = pathGraph([
      { id: 'a', links: ['b'], auto: ['b'] },
      { id: 'b', links: ['c'] },
      { id: 'c', auto: ['b', 'gone'] },
    ])
    expect([...g.auto]).toEqual([linkKey('a', 'b')])
  })

  it('find the nearest spot on a link, of one path or any', () => {
    const g = pathGraph([
      { id: 'a', links: ['b'] },
      { id: 'b' },
      { id: 'c', links: ['d'] },
      { id: 'd' },
    ])
    const spots = at({ a: [0, 0], b: [4, 0], c: [0, 3], d: [4, 3] })
    expect(nearestOnPath(g, spots, 1, 0.5)).toMatchObject({ a: 'a', b: 'b', x: 1, z: 0, off: 0.5 })
    expect(nearestOnPath(g, spots, 1, 0.5, (a) => a === 'c')).toMatchObject({ x: 1, z: 3 })
    // past a link's end: its end
    expect(nearestOnPath(g, spots, 6, 0)).toMatchObject({ x: 4, z: 0, off: 2 })
    expect(nearestOnPath(pathGraph([{ id: 'a' }]), spots, 0, 0)).toBeNull()
  })
})
