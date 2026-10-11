import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildArchitecture } from '../architecture'

describe('architecture', () => {
  it('seats A2 as 平面尺寸圖 does: 14 rows of 6 + 10 + 6, the side blocks a seat short in six', () => {
    const { fixedSeats, seats } = buildArchitecture(new THREE.Scene())
    expect(fixedSeats).toBe(14 * 22 - 6 * 2)
    // each row's seats, by its height, from the front
    const rows = new Map<number, number>()
    for (const s of seats) rows.set(+s.y.toFixed(3), (rows.get(+s.y.toFixed(3)) ?? 0) + 1)
    expect([...rows.values()]).toEqual([22, 22, 20, 20, 20, 20, 22, 22, 20, 20, 22, 22, 22, 22])
  })

  it('folds the seats’ cushions up, and puts down the ones asked for', () => {
    const { arch, seats, openSeats } = buildArchitecture(new THREE.Scene())
    const cushion = arch.children.find(
      (o): o is THREE.InstancedMesh =>
        o instanceof THREE.InstancedMesh &&
        o.count === seats.length &&
        (o.geometry as THREE.BoxGeometry).parameters.width === 0.46,
    )!
    const top = (k: number) => {
      const m = new THREE.Matrix4()
      cushion.getMatrixAt(k, m)
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    const folded = top(7)
    openSeats(new Set([7]))
    // down: lower, and level with where the hips go
    expect(top(7).y).toBeLessThan(folded.y)
    expect(top(7).y).toBeCloseTo(seats[7]!.y - 0.045, 2)
    openSeats(new Set())
    expect(top(7).distanceTo(folded)).toBeLessThan(1e-6)
  })
})
