import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { edges } from '../materials'
import { buildOuterEdges, setEdgeMode } from '../outlines'

const box = (g: THREE.Group, w: number, h: number, d: number, x: number, z: number) => {
  const m = edges(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()))
  m.position.set(x, h / 2, z)
  g.add(m)
  return m
}
const lengthOf = (o: THREE.Object3D, kind: 'all' | 'outer') => {
  let sum = 0
  o.traverse((c) => {
    if (c.userData.edges !== kind) return
    const p = (c as THREE.LineSegments).geometry.getAttribute('position')
    for (let i = 0; i < p.count; i += 2)
      sum += new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(p, i + 1))
  })
  return sum
}

describe('outlines', () => {
  it('leaves out the seam where two walls meet flush', () => {
    const g = new THREE.Group()
    box(g, 2, 3, 0.2, 0, 0)
    box(g, 2, 3, 0.2, 2, 0)
    buildOuterEdges(g)
    // every edge of both: 4 × (2 + 3 + 0.2) each; the whole is one 4 × 3 × 0.2 box
    expect(lengthOf(g, 'all')).toBeCloseTo(2 * 4 * 5.2, 3)
    expect(lengthOf(g, 'outer')).toBeCloseTo(4 * 7.2, 1)
  })

  it('leaves out a wall’s end inside another, keeping the corners outside', () => {
    const g = new THREE.Group()
    box(g, 4, 3, 0.2, 0, 0)
    // a wall running north into the first's middle, its end buried in it
    box(g, 0.2, 3, 2, 0, -0.95)
    buildOuterEdges(g)
    // the T: the first box's 12 edges, less where the second meets its north face top and
    // bottom, and the second's outside the first (its end, and its long edges out to it)
    const outer = lengthOf(g, 'outer')
    expect(outer).toBeLessThan(lengthOf(g, 'all'))
    expect(outer).toBeCloseTo(4 * 7.2 - 2 * 0.2 + (2 * 3 + 2 * 0.2) + 4 * 1.85, 0)
  })

  it('shows one way or the other', () => {
    const g = new THREE.Group()
    const m = box(g, 1, 1, 1, 0, 0)
    buildOuterEdges(g)
    setEdgeMode(g, 'outer')
    const [all, outer] = m.children
    expect([all!.visible, outer!.visible]).toEqual([false, true])
    setEdgeMode(g, 'all')
    expect([all!.visible, outer!.visible]).toEqual([true, false])
  })
})
