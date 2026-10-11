import * as THREE from 'three'
import { buildArchitecture } from './architecture'
import type { LayoutItem } from './layout'

/**
 * Which floors a layout's heights (`y`) were placed on. Items keep the height they stand at,
 * so when a floor in the venue moves, layouts saved before it are moved with it once, on the
 * way in, and saved with the new number. Layouts without one are on floors 1.
 *
 * 2: from the site visit (2026-10-08): A2's stage 0.9 → 0.7 m, its rake 9 → 16 cm a row (its
 * back 1.17 → 2.08 m), the backstage, 翻譯室 and the back door's corridor raised to the stage,
 * and the stair from A215 up to A2's back re-stepped (its platform 0.8 → 1.2 m, and off A224).
 */
export const FLOORS = 2

/** A layout file's or project's floors: the number it was saved with, else the first */
export const floorsOf = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1

type Pt = [x: number, z: number]

function inPolygon([x, z]: Pt, poly: readonly Pt[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!
    const [xj, zj] = poly[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

const inBox = ([x, z]: Pt, x1: number, x2: number, z1: number, z2: number) =>
  x >= x1 && x <= x2 && z >= z1 && z <= z2

/**
 * Floors 1, where they differ from now: the height of the floor at (x, z) as it was, or null
 * where it hasn't moved. Drawn as the venue was, kept as it was.
 */
export function floors1At(x: number, z: number): number | null {
  const p: Pt = [x, z]
  /** The heights of what stood at (x, z): the highest is the floor */
  const hs: number[] = []
  const on = (h: number) => hs.push(h)

  // A215 → A2's back: four steps to a platform at 0.8, three to a landing at A2's back (1.17)
  const BACK = 13 * 0.09
  for (let i = 0; i < 4; i++)
    if (inBox(p, 12.2, 22.1, 20.6 + 0.65 * i, 20.6 + 0.65 * (i + 1))) on(0.2 * (i + 1))
  const platform: Pt[] = [
    [10.1, 23.2],
    [23.4, 23.2],
    [23.4, 25.98],
    [9.98, 25.98],
    [10.1, 25.8],
  ]
  if (inPolygon(p, platform)) on(0.8)
  const slantX = (zz: number) => 10.1 + ((zz - 25.8) * (8.6 - 10.1)) / (27.9 - 25.8)
  const d = (27.4 - 25.98) / 3
  for (let i = 0; i < 3; i++) {
    const z1 = 25.98 + d * i
    if (inBox(p, slantX(z1), 19.2, z1, z1 + d)) on(0.8 + ((BACK - 0.8) / 3) * (i + 1))
  }
  const landing: Pt[] = [
    [slantX(27.4), 27.4],
    [19.4, 27.4],
    [19.4, 29.75],
    [8.6, 29.75],
    [8.6, 27.9],
  ]
  if (inPolygon(p, landing)) on(BACK)

  // A2's rake: 14 rows, 1.105 deep, bowed, rising 0.09 a row; behind the back row, its level
  const [X0, ROW, BOW, ZC] = [25.9, 1.105, 0.02, 37.6]
  const cuts: [number, number][] = [
    [30.3, 34.3],
    [34.3, 40.9],
    [40.9, 44.9],
  ]
  const backEdge: Pt[] = []
  cuts.forEach(([a, b], k) => {
    const bow = BOW * ((a + b) / 2 - ZC) ** 2
    for (let i = 1; i < 14; i++) {
      const cx = X0 - i * ROW + bow - 0.05
      if (inBox(p, cx - ROW / 2, cx + ROW / 2, a, b)) on(i * 0.09)
    }
    const ex = X0 - 13 * ROW - ROW / 2 + bow - 0.05
    backEdge.unshift([ex, k === cuts.length - 1 ? 45.6 : b], [ex, k === 0 ? 29.75 : a])
  })
  if (inPolygon(p, [[8.6, 29.75], [8.6, 45.6], ...backEdge])) on(BACK)

  // the stage at 0.9, the three steps up at each end
  const stage: Pt[] = [
    [32.4, 30.5],
    [34.2, 30.5],
    [34.2, 31.8],
    [35.3, 32.8],
    [35.3, 42.4],
    [34.2, 43.4],
    [34.2, 44.7],
    [32.4, 44.7],
    [32.4, 42.95],
    [31.1, 42.95],
    [30.8, 41.5],
    [30.4, 39.5],
    [30.4, 35.5],
    [30.8, 33.8],
    [31.1, 32.4],
    [32.4, 32.4],
  ]
  if (inPolygon(p, stage)) on(0.9)
  for (const [z0, dir] of [
    [31.5, 1],
    [43.8, -1],
  ] as const)
    for (let i = 0; i < 3; i++) {
      const zc = z0 + dir * (0.15 + i * 0.3)
      if (inBox(p, 31.1, 32.4, zc - 0.15, zc + 0.15)) on(0.225 * (i + 1))
    }
  if (hs.length) return Math.max(...hs)

  // on the floor then, raised since: the backstage, 翻譯室, the back door's corridor, and by
  // the stair up to A2's back
  const raised: Pt[][] = [
    [
      [34.2, 29.75],
      [37.3, 29.75],
      [37.3, 36.2],
      [37.8, 36.2],
      [37.8, 45.1],
      [34.2, 45.1],
      [34.2, 43.4],
      [35.3, 42.4],
      [35.3, 32.8],
      [34.2, 31.8],
    ],
    [
      [29.7, 45.1],
      [36.2, 45.1],
      [36.2, 47.9],
      [32.9, 47.9],
      [29.7, 46.83],
    ],
    [
      [35.2, 28.1],
      [36.9, 28.1],
      [36.9, 29.75],
      [35.2, 29.75],
    ],
    // the first flight's east end, and the platform's strip north of A223's wall as it is now
    [
      [22.1, 20.6],
      [22.45, 20.6],
      [22.45, 23.2],
      [22.1, 23.2],
    ],
    [
      [19.4, 25.98],
      [22.45, 25.98],
      [22.45, 26.3],
      [19.4, 26.3],
    ],
  ]
  return raised.some((r) => inPolygon(p, r)) ? 0 : null
}

/** The floor's height at (x, z) now, from the venue as it's built (built once, on first use) */
let walk: THREE.Mesh[] | null = null
const down = new THREE.Raycaster()
export function floorAt(x: number, z: number) {
  if (!walk) {
    const scene = new THREE.Scene()
    walk = buildArchitecture(scene).walk
    scene.updateMatrixWorld(true)
  }
  down.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0))
  return down.intersectObjects(walk, false)[0]?.point.y ?? 0
}

/**
 * Items placed on floors `from`, moved on to today's: each with a height, standing where a
 * floor has moved since, goes up or down with it (with whatever it stands on, so a snack on a
 * table on the stage stays on the table). Items without a height drop on to the floor anyway.
 */
export function toCurrentFloors(
  items: readonly LayoutItem[],
  from: number,
  now: (x: number, z: number) => number = floorAt,
): LayoutItem[] {
  if (from >= FLOORS) return [...items]
  return items.map((i) => {
    if (i.y === undefined) return i
    const was = floors1At(i.x, i.z)
    if (was === null) return i
    const dy = now(i.x, i.z) - was
    return Math.abs(dy) < 1e-4 ? i : { ...i, y: +(i.y + dy).toFixed(3) }
  })
}
