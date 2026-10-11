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

/**
 * Each mesh's outline in `group` drawn a second way, with only the outline of the whole: the
 * two kept side by side and shown by `setEdgeMode`. Built from the group as it stands.
 */
export function buildOuterEdges(group: THREE.Object3D) {
  group.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !(m.material as THREE.Material).transparent) meshes.push(m)
  })
  const solids = meshes.map(solidOf).filter((s): s is Solid => s !== null)
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
      a.copy(la).applyMatrix4(m.matrixWorld)
      b.copy(lb).applyMatrix4(m.matrixWorld)
      const len = a.distanceTo(b)
      if (len < EPS) continue
      dir.subVectors(b, a).normalize()
      u.set(1, 0, 0)
      if (Math.abs(dir.x) > 0.9) u.set(0, 1, 0)
      u.cross(dir).normalize()
      v.crossVectors(dir, u)
      near.setFromPoints([a, b]).expandByScalar(NEAR * 2)
      const from = solids.filter((s) => s.box.intersectsBox(near))
      // the edge in pieces: runs of those that show are kept
      const n = Math.max(1, Math.ceil(len / STEP))
      let start = -1
      for (let k = 0; k <= n; k++) {
        p.lerpVectors(a, b, (k + 0.5) / n)
        const on = k < n && shows(from)
        if (on && start < 0) start = k
        if (!on && start >= 0) {
          const s = new THREE.Vector3().lerpVectors(la, lb, start / n)
          const e = new THREE.Vector3().lerpVectors(la, lb, k / n)
          kept.push(s.x, s.y, s.z, e.x, e.y, e.z)
          start = -1
        }
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
}

/** Show `group`'s outlines one way: every edge, or only the whole's outline */
export function setEdgeMode(group: THREE.Object3D, mode: EdgeMode) {
  group.traverse((o) => {
    const e = o.userData.edges as EdgeMode | undefined
    if (e) o.visible = e === mode
  })
}
