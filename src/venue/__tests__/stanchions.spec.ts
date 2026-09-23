import { describe, expect, it } from 'vitest'
import { bearing, beltCandidates, linkPosts, withoutCutToward, type Post } from '../stanchions'

const row = (n: number, gap: number): Post[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * gap, z: 0 }))

describe('beltCandidates', () => {
  it('chains a row without skipping over posts', () => {
    expect(beltCandidates(row(4, 1.8))).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
  })

  it('outlines a rectangle without diagonals', () => {
    const sq: Post[] = [
      { x: 0, z: 0 },
      { x: 1.5, z: 0 },
      { x: 1.5, z: 1.5 },
      { x: 0, z: 1.5 },
    ]
    expect(beltCandidates(sq)).toEqual([
      [0, 1],
      [0, 3],
      [1, 2],
      [2, 3],
    ])
  })

  it('leaves posts beyond belt reach or stacked on each other unlinked', () => {
    expect(beltCandidates(row(2, 3))).toEqual([])
    expect(beltCandidates(row(2, 0.1))).toEqual([])
  })
})

describe('linkPosts', () => {
  it('drops a belt cut from either end', () => {
    const posts = row(3, 1.5)
    const fromA = posts.map((p, i) => (i === 0 ? { ...p, cut: [bearing(p, posts[1]!)] } : p))
    const fromB = posts.map((p, i) => (i === 1 ? { ...p, cut: [bearing(p, posts[0]!)] } : p))
    for (const ps of [fromA, fromB])
      expect(linkPosts(ps)).toEqual({ belts: [[1, 2]], cut: [[0, 1]] })
  })

  it('keeps the cut after a small nudge and restores it once cleared', () => {
    const a = { x: 0, z: 0, cut: [0] }
    const b = { x: 1.5, z: 0.2 }
    expect(linkPosts([a, b]).cut).toEqual([[0, 1]])
    expect(withoutCutToward(a, bearing(a, b))).toEqual([])
  })
})
