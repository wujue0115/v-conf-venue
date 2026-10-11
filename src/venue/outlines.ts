import * as THREE from 'three'

/**
 * Outlines drawn two ways: every edge of every piece, or only the outline of what they make
 * together, leaving out the lines where pieces meet or overlap (a wall's end inside another,
 * the seam where two walls meet flush, a solid's edge against another's face).
 */
export type EdgeMode = 'all' | 'outer'

/** How fine an edge is cut to find which parts of it show, and how far round it to look */
const STEP = 0.1
const NEAR = 0.01
const EPS = 1e-4
/** Directions round an edge, half a step off the axes so none lies along a face */
const AROUND = 32
/** Fewer or more directions than half filled, by this many, make a crease (about 22°) */
const CREASE = 2

interface Solid {
  box: THREE.Box3
  /** In or on it (p in world space) */
  has(p: THREE.Vector3): boolean
}

const local = new THREE.Vector3()

function inPolygon(x: number, y: number, pts: THREE.Vector2[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    // on its outline counts as in
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1)
    if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) <= EPS) return true
    if (a.y > y !== b.y > y && x < (dx * (y - a.y)) / dy + a.x) inside = !inside
  }
  return inside
}

/** A box or a straight extrusion, as solid; anything else isn't one */
function solidOf(m: THREE.Mesh): Solid | null {
  const g = m.geometry
  const inv = m.matrixWorld.clone().invert()
  const box = new THREE.Box3().setFromObject(m).expandByScalar(EPS)
  if (g instanceof THREE.BoxGeometry) {
    const { width, height, depth } = g.parameters
    const [hx, hy, hz] = [width / 2 + EPS, height / 2 + EPS, depth / 2 + EPS]
    return {
      box,
      has(p) {
        local.copy(p).applyMatrix4(inv)
        return Math.abs(local.x) <= hx && Math.abs(local.y) <= hy && Math.abs(local.z) <= hz
      },
    }
  }
  if (g instanceof THREE.ExtrudeGeometry) {
    const { shapes, options } = g.parameters
    const shape = Array.isArray(shapes) ? shapes[0] : shapes
    if (!shape || options.bevelEnabled) return null
    const pts = shape.getPoints()
    const depth = options.depth ?? 1
    return {
      box,
      has(p) {
        local.copy(p).applyMatrix4(inv)
        return local.z >= -EPS && local.z <= depth + EPS && inPolygon(local.x, local.y, pts)
      },
    }
  }
  return null
}

/** A solid standing upright: its outline on the floor (x, z) and the heights it spans */
interface Footprint {
  poly: [number, number][]
  y0: number
  y1: number
}

/** A box or a straight extrusion standing upright, as its footprint; else null */
function footprintOf(m: THREE.Mesh): Footprint | null {
  const g = m.geometry
  let base: THREE.Vector3[]
  let top: THREE.Vector3[]
  if (g instanceof THREE.BoxGeometry) {
    const { width: w, height: h, depth: d } = g.parameters
    const corners = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ]
    base = corners.map(([x, z]) => new THREE.Vector3(x, -h / 2, z))
    top = corners.map(([x, z]) => new THREE.Vector3(x, h / 2, z))
  } else if (g instanceof THREE.ExtrudeGeometry) {
    const { shapes, options } = g.parameters
    const shape = Array.isArray(shapes) ? shapes[0] : shapes
    if (!shape || options.bevelEnabled) return null
    const pts = shape.getPoints()
    base = pts.map((pt) => new THREE.Vector3(pt.x, pt.y, 0))
    top = pts.map((pt) => new THREE.Vector3(pt.x, pt.y, options.depth ?? 1))
  } else return null
  base.forEach((v) => v.applyMatrix4(m.matrixWorld))
  top.forEach((v) => v.applyMatrix4(m.matrixWorld))
  // upright: each top corner straight above its base corner, the base level
  const upright = base.every(
    (b, i) =>
      Math.abs(b.x - top[i]!.x) < 1e-6 &&
      Math.abs(b.z - top[i]!.z) < 1e-6 &&
      Math.abs(b.y - base[0]!.y) < 1e-6,
  )
  if (!upright) return null
  const [y0, y1] = [base[0]!.y, top[0]!.y].sort((p, q) => p - q) as [number, number]
  return { poly: base.map((b): [number, number] => [b.x, b.z]), y0, y1 }
}

/** Where along a–b (0–1) the segment from p runs inside the box [x0, x1] × [z0, z1] */
function clip(
  [ax, az]: [number, number],
  [bx, bz]: [number, number],
  [x0, z0, x1, z1]: [number, number, number, number],
): [number, number] | null {
  let [t0, t1] = [0, 1]
  for (const [d, lo, hi, s] of [
    [bx - ax, x0, x1, ax],
    [bz - az, z0, z1, az],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (s < lo || s > hi) return null
      continue
    }
    const [ta, tb] = [(lo - s) / d, (hi - s) / d].sort((p, q) => p - q) as [number, number]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
  }
  return t1 > t0 ? [t0, t1] : null
}

/**
 * Each mesh's outline in `group` drawn a second way, with only the outline of the whole: the
 * two kept side by side and shown by `setEdgeMode`. Built from the group as it stands. Where
 * pieces meet in an inside corner, an edge neither has of its own, a line is drawn too (`seam`,
 * shown either way).
 */
export function buildOuterEdges(
  group: THREE.Object3D,
  seam?: THREE.LineBasicMaterial,
  /** What the pieces stand on, outside the group: the floors, so their feet are outlined too */
  ground: THREE.Mesh[] = [],
) {
  group.updateMatrixWorld(true)
  ground.forEach((g) => g.updateMatrixWorld(true))
  const meshes: THREE.Mesh[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !(m.material as THREE.Material).transparent) meshes.push(m)
  })
  const solids = [...meshes, ...ground].map(solidOf).filter((s): s is Solid => s !== null)
  const near = new THREE.Box3()
  const inUnion = (p: THREE.Vector3, from: Solid[]) => from.some((s) => s.has(p))

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  const p = new THREE.Vector3()
  const q = new THREE.Vector3()
  /** Whether the outline of the whole bends at p, along an edge running dir */
  function shows(from: Solid[]) {
    let filled = 0
    for (let k = 0; k < AROUND; k++) {
      const th = ((k + 0.5) / AROUND) * Math.PI * 2
      q.copy(p)
        .addScaledVector(u, Math.cos(th) * NEAR)
        .addScaledVector(v, Math.sin(th) * NEAR)
      if (inUnion(q, from)) filled++
    }
    return Math.abs(filled - AROUND / 2) >= CREASE && filled < AROUND
  }

  /** The parts of a–b (world space) where the whole's outline bends, as 0–1 ranges along it */
  function runs(from3: THREE.Vector3, to3: THREE.Vector3): [number, number][] {
    a.copy(from3)
    b.copy(to3)
    const len = a.distanceTo(b)
    if (len < EPS) return []
    dir.subVectors(b, a).normalize()
    u.set(1, 0, 0)
    if (Math.abs(dir.x) > 0.9) u.set(0, 1, 0)
    u.cross(dir).normalize()
    v.crossVectors(dir, u)
    near.setFromPoints([a, b]).expandByScalar(NEAR * 2)
    const from = solids.filter((s) => s.box.intersectsBox(near))
    // the edge in pieces: runs of those that show are kept
    const n = Math.max(1, Math.ceil(len / STEP))
    const out: [number, number][] = []
    let start = -1
    for (let k = 0; k <= n; k++) {
      p.lerpVectors(a, b, (k + 0.5) / n)
      const on = k < n && shows(from)
      if (on && start < 0) start = k
      if (!on && start >= 0) {
        out.push([start / n, k / n])
        start = -1
      }
    }
    return out
  }

  for (const m of meshes) {
    const lines = m.children.find((c) => (c as THREE.LineSegments).isLineSegments) as
      | THREE.LineSegments
      | undefined
    if (!lines) continue
    const pos = lines.geometry.getAttribute('position')
    const kept: number[] = []
    for (let i = 0; i < pos.count; i += 2) {
      const la = new THREE.Vector3().fromBufferAttribute(pos, i)
      const lb = new THREE.Vector3().fromBufferAttribute(pos, i + 1)
      const wa = la.clone().applyMatrix4(m.matrixWorld)
      const wb = lb.clone().applyMatrix4(m.matrixWorld)
      for (const [t0, t1] of runs(wa, wb)) {
        const s = new THREE.Vector3().lerpVectors(la, lb, t0)
        const e = new THREE.Vector3().lerpVectors(la, lb, t1)
        kept.push(s.x, s.y, s.z, e.x, e.y, e.z)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
    const outer = new THREE.LineSegments(geo, lines.material)
    outer.raycast = lines.raycast
    lines.userData.edges = 'all'
    outer.userData.edges = 'outer'
    m.add(outer)
  }
  if (seam) addSeams(group, meshes, ground, runs, seam)
}

/**
 * The inside corners where upright pieces meet: upright, where two pieces' sides cross; level,
 * where one piece's top or foot meets another's side. Only where the whole's outline bends there.
 */
function addSeams(
  group: THREE.Object3D,
  meshes: THREE.Mesh[],
  ground: THREE.Mesh[],
  runs: (a: THREE.Vector3, b: THREE.Vector3) => [number, number][],
  material: THREE.LineBasicMaterial,
) {
  // the floors take part only as the A below, their tops along the pieces' sides
  const floors = new Set(ground)
  const all = [...meshes, ...ground]
  const feet: Footprint[] = []
  const isFloor: boolean[] = []
  all.forEach((m) => {
    const f = footprintOf(m)
    if (!f) return
    feet.push(f)
    isFloor.push(floors.has(m))
  })
  const bounds = feet.map(({ poly }) => {
    const xs = poly.map(([x]) => x)
    const zs = poly.map(([, z]) => z)
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as [
      number,
      number,
      number,
      number,
    ]
  })
  const toGroup = group.matrixWorld.clone().invert()
  const out: number[] = []
  const seen = new Set<string>()
  const add = (a: THREE.Vector3, b: THREE.Vector3) => {
    const key = [a, b]
      .map((v) =>
        v
          .toArray()
          .map((n) => n.toFixed(3))
          .join(),
      )
      .join('|')
    if (seen.has(key)) return
    seen.add(key)
    for (const [t0, t1] of runs(a, b)) {
      const s = new THREE.Vector3().lerpVectors(a, b, t0).applyMatrix4(toGroup)
      const e = new THREE.Vector3().lerpVectors(a, b, t1).applyMatrix4(toGroup)
      out.push(s.x, s.y, s.z, e.x, e.y, e.z)
    }
  }
  const sides = (f: Footprint) =>
    f.poly.map((pt, i) => [pt, f.poly[(i + 1) % f.poly.length]!] as const)
  const isCorner = (f: Footprint, x: number, z: number) =>
    f.poly.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1e-4)
  const M = 0.01
  for (let i = 0; i < feet.length; i++)
    for (let j = 0; j < feet.length; j++) {
      if (i === j || isFloor[j]) continue
      const [A, B] = [feet[i]!, feet[j]!]
      const [ba, bb] = [bounds[i]!, bounds[j]!]
      if (ba[0] > bb[2] + M || bb[0] > ba[2] + M || ba[1] > bb[3] + M || bb[1] > ba[3] + M) continue
      const [lo, hi] = [Math.max(A.y0, B.y0), Math.min(A.y1, B.y1)]
      if (hi - lo < EPS) continue
      // upright: where a side of A crosses a side of B (each pair once), off either's corners,
      // which have edges of their own
      if (i < j && !isFloor[i])
        for (const [[ax, az], [bx, bz]] of sides(A))
          for (const [[cx, cz], [dx, dz]] of sides(B)) {
            const [rx, rz, sx, sz] = [bx - ax, bz - az, dx - cx, dz - cz]
            const den = rx * sz - rz * sx
            if (Math.abs(den) < 1e-9) continue
            const t = ((cx - ax) * sz - (cz - az) * sx) / den
            const s = ((cx - ax) * rz - (cz - az) * rx) / den
            if (t < 0 || t > 1 || s < 0 || s > 1) continue
            const [x, z] = [ax + rx * t, az + rz * t]
            if (isCorner(A, x, z) || isCorner(B, x, z)) continue
            add(new THREE.Vector3(x, lo, z), new THREE.Vector3(x, hi, z))
          }
      // level: A's top or foot along B's sides, where it is over A
      for (const y of [A.y0, A.y1]) {
        if (y <= B.y0 + EPS || y >= B.y1 - EPS) continue
        for (const [pa, pb] of sides(B)) {
          const c = clip(pa, pb, [ba[0] - M, ba[1] - M, ba[2] + M, ba[3] + M])
          if (!c) continue
          const at = (t: number) =>
            new THREE.Vector3(pa[0] + (pb[0] - pa[0]) * t, y, pa[1] + (pb[1] - pa[1]) * t)
          add(at(c[0]), at(c[1]))
        }
      }
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3))
  const lines = new THREE.LineSegments(geo, material)
  lines.raycast = () => {}
  lines.userData.edges = 'both'
  group.add(lines)
}

/** Show `group`'s outlines one way: every edge, or only the whole's outline */
export function setEdgeMode(group: THREE.Object3D, mode: EdgeMode) {
  group.traverse((o) => {
    const e = o.userData.edges as EdgeMode | 'both' | undefined
    if (e) o.visible = e === mode || e === 'both'
  })
}
