import * as THREE from 'three'

/*
 * 區域: an area marked on the floor — a light tint of its colour with a solid border. A zone
 * locked against editing (禁止編輯) is hatched in its colour instead, inside a dashed border.
 * It is a rectangle (w along local x, d along z), or, once a corner has been added, any
 * polygon: its corners (`pts`, [x, z] in its own frame) in order round it. The group's origin
 * is the middle of its bounds on the floor, and `w` × `d` always the size of those bounds.
 */

/** Zones' default colour */
export const ZONE_COLOR = '#42b883'
export const ZONE_MIN = 0.25
export const ZONE_MAX = 60
/** Zones are drawn and resized on this grid (metres) */
export const ZONE_GRID = 0.25
/** The most corners a zone keeps */
export const ZONE_CORNERS_MAX = 64

export const clampZone = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(ZONE_MAX, Math.max(ZONE_MIN, Math.round(n / ZONE_GRID) * ZONE_GRID))
    : fallback

/** Snap a floor coordinate to the zone grid */
export const onZoneGrid = (v: number) => Math.round(v / ZONE_GRID) * ZONE_GRID

/** A zone corner: [x, z] in the zone's own frame */
export type ZonePoint = [number, number]

/** A rectangle's corners, w × d about the origin, in order round it */
export const rectCorners = (w: number, d: number): ZonePoint[] => [
  [-w / 2, -d / 2],
  [w / 2, -d / 2],
  [w / 2, d / 2],
  [-w / 2, d / 2],
]

const near = (a: ZonePoint, b: ZonePoint) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4

/**
 * A zone's corners, kept: rounded to the millimetre, with a corner on the one before it left
 * out. Null when fewer than three are left, or they enclose nothing.
 */
export function cleanCorners(pts: readonly ZonePoint[]): ZonePoint[] | null {
  const out: ZonePoint[] = []
  for (const [x, z] of pts.slice(0, ZONE_CORNERS_MAX)) {
    const p: ZonePoint = [+x.toFixed(3), +z.toFixed(3)]
    if (!out.length || !near(out[out.length - 1]!, p)) out.push(p)
  }
  while (out.length > 1 && near(out[0]!, out[out.length - 1]!)) out.pop()
  return out.length >= 3 && Math.abs(signedArea(out)) > 1e-4 ? out : null
}

/** Twice the area inside the corners, positive when they run anticlockwise as seen on (x, z) */
function signedArea(pts: readonly ZonePoint[]) {
  let a = 0
  pts.forEach(([x, z], i) => {
    const [x1, z1] = pts[(i + 1) % pts.length]!
    a += x * z1 - x1 * z
  })
  return a
}

/** The middle of the corners' bounds, and how wide and deep they are */
export function cornerBounds(pts: readonly ZonePoint[]) {
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
}

const LIFT = 0.006
const BORDER = 0.05
/** A locked zone's border: thicker, and dashed */
const LOCKED_BORDER = 0.08
const DASH = 0.3
const GAP = 0.18
/** Metres along each side of one tile of a locked zone's hatching (one stripe per tile) */
const HATCH = 0.4

/** Diagonal stripes, as an alpha map: solid stripes over a faint ground, tiling seamlessly */
let hatchTex: THREE.Texture | null = null
function hatch() {
  if (hatchTex) return hatchTex
  const n = 64
  const c = document.createElement('canvas')
  c.width = c.height = n
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#404040'
  ctx.fillRect(0, 0, n, n)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = n * 0.3
  // x + y = 0, n and 2n: the corners' pieces join the next tiles' stripe
  for (const c of [0, n, 2 * n]) {
    ctx.beginPath()
    ctx.moveTo(c - 2 * n, 2 * n)
    ctx.lineTo(c + 2 * n, -2 * n)
    ctx.stroke()
  }
  hatchTex = new THREE.CanvasTexture(c)
  hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping
  return hatchTex
}

interface ZoneMats {
  fill: THREE.Material
  edge: THREE.Material
  hatch: THREE.Material
}
const mats = new Map<string, ZoneMats>()
function zoneMats(color: string) {
  let m = mats.get(color)
  if (!m) {
    // drawn over the floor without fighting it, and never hiding what stands on it; both
    // sides, whichever way round the corners run
    const base = {
      color,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      side: THREE.DoubleSide,
    }
    m = {
      fill: new THREE.MeshBasicMaterial({ ...base, opacity: 0.22, polygonOffsetFactor: -1 }),
      edge: new THREE.MeshBasicMaterial({ ...base, opacity: 0.85, polygonOffsetFactor: -2 }),
      hatch: new THREE.MeshBasicMaterial({
        ...base,
        opacity: 0.5,
        alphaMap: hatch(),
        polygonOffsetFactor: -1,
      }),
    }
    mats.set(color, m)
  }
  return m
}

/** The inside of the corners, flat on the floor, its uv in metres over `tile` */
function fillGeometry(pts: readonly ZonePoint[], tile = 1) {
  // a shape is drawn on (x, y); laid down flat, its y runs along -z
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
  // the uv is the shape's (x, y) in metres: a locked zone's stripes keep their spacing
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile)
  return g
}

/** Each edge's normal, pointing inside */
function inwardNormals(pts: readonly ZonePoint[]) {
  const n = pts.length
  const turn = signedArea(pts) > 0 ? 1 : -1
  return pts.map(([x, z], i) => {
    const [x1, z1] = pts[(i + 1) % n]!
    const len = Math.hypot(x1 - x, z1 - z) || 1
    return [(-(z1 - z) / len) * turn, ((x1 - x) / len) * turn] as const
  })
}

/**
 * The border: a band BORDER wide just inside the edges, its corners mitred (and cut short at
 * very sharp ones), so no two edges' bands overlap
 */
function borderGeometry(pts: readonly ZonePoint[]) {
  const n = pts.length
  const normals = inwardNormals(pts)
  const inner = pts.map(([x, z], i) => {
    const [ax, az] = normals[(i + n - 1) % n]!
    const [bx, bz] = normals[i]!
    const mx = ax + bx
    const mz = az + bz
    const cos = (mx * bx + mz * bz) / (Math.hypot(mx, mz) || 1)
    const k = BORDER / Math.max(cos, 0.25) / (Math.hypot(mx, mz) || 1)
    return [x + mx * k, z + mz * k] as const
  })
  const pos: number[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const [ox, oz] = pts[i]!
    const [px, pz] = pts[j]!
    const [ix, iz] = inner[i]!
    const [jx, jz] = inner[j]!
    pos.push(ox, 0, oz, px, 0, pz, jx, 0, jz, ox, 0, oz, jx, 0, jz, ix, 0, iz)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

/** Dashes [centre, length] along a side `len` long, with a dash at each end */
function dashes(len: number): [number, number][] {
  const n = Math.max(1, Math.round((len + GAP) / (DASH + GAP)))
  const k = len / (n * DASH + (n - 1) * GAP)
  return Array.from({ length: n }, (_, i) => [
    -len / 2 + (i * (DASH + GAP) + DASH / 2) * k,
    DASH * k,
  ])
}

/** A locked zone's dashed border, just inside each edge, its dashes all in one geometry */
function dashedBorder(pts: readonly ZonePoint[]) {
  const b = LOCKED_BORDER
  const normals = inwardNormals(pts)
  const pos: number[] = []
  const idx: number[] = []
  pts.forEach(([x0, z0], i) => {
    const [x1, z1] = pts[(i + 1) % pts.length]!
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 1e-6) return
    const [ux, uz] = [(x1 - x0) / len, (z1 - z0) / len]
    const [nx, nz] = normals[i]!
    const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2]
    for (const [c, l] of dashes(len)) {
      const k = pos.length / 3
      const [ax, az] = [mx + ux * (c - l / 2), mz + uz * (c - l / 2)]
      const [bx, bz] = [mx + ux * (c + l / 2), mz + uz * (c + l / 2)]
      pos.push(ax, 0, az, bx, 0, bz, bx + nx * b, 0, bz + nz * b, ax + nx * b, 0, az + nz * b)
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/**
 * (Re)draw a zone in `color`: a w × d rectangle, or the polygon through `pts` (whose bounds
 * then give w and d), locked against editing or not (left out, it stays as it was)
 */
export function applyZone(
  g: THREE.Object3D,
  {
    w,
    d,
    color = ZONE_COLOR,
    pts,
    locked = !!g.userData.locked,
  }: { w: number; d: number; color?: string; pts?: readonly ZonePoint[]; locked?: boolean },
) {
  // a zone's fill and border are its own geometry, sized to it
  g.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
  g.clear()
  const corners = pts ? cleanCorners(pts) : null
  if (corners) ({ w, d } = cornerBounds(corners))
  const m = zoneMats(color)
  const outline = corners ?? rectCorners(w, d)
  const f = new THREE.Mesh(fillGeometry(outline, locked ? HATCH : 1), locked ? m.hatch : m.fill)
  f.position.y = LIFT
  f.renderOrder = 1
  f.name = 'fill'
  const b = new THREE.Mesh(locked ? dashedBorder(outline) : borderGeometry(outline), m.edge)
  b.position.y = LIFT
  b.renderOrder = 2
  g.add(f, b)
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
  })
  g.userData.w = +w.toFixed(3)
  g.userData.d = +d.toFixed(3)
  if (corners) g.userData.pts = corners
  else delete g.userData.pts
  if (color !== ZONE_COLOR) g.userData.color = color
  else delete g.userData.color
  if (locked) g.userData.locked = true
  else delete g.userData.locked
}

/** A zone's corners, a rectangle's too, in order round it */
export const zoneCorners = (g: THREE.Object3D): ZonePoint[] =>
  (g.userData.pts as ZonePoint[] | undefined)?.map((p) => [...p] as ZonePoint) ??
  rectCorners(g.userData.w as number, g.userData.d as number)

/**
 * A zone on the floor: its origin, turn about Y, width (local x) and depth (z), and, for a
 * polygon, its corners
 */
export interface ZoneRect {
  x: number
  z: number
  r: number
  w: number
  d: number
  pts?: readonly ZonePoint[]
}

/** Whether (x, z), in a polygon's own frame, lies within `e` of one of its edges */
function onEdge(pts: readonly ZonePoint[], x: number, z: number, e: number) {
  return pts.some(([x0, z0], i) => {
    const [x1, z1] = pts[(i + 1) % pts.length]!
    const [dx, dz] = [x1 - x0, z1 - z0]
    const len2 = dx * dx + dz * dz
    const k = len2 ? Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / len2)) : 0
    return Math.hypot(x - x0 - dx * k, z - z0 - dz * k) <= e
  })
}

/** Whether the point (x, z) on the floor lies inside a zone (edges included) */
export function inRect(zone: ZoneRect, x: number, z: number) {
  const dx = x - zone.x
  const dz = z - zone.z
  const lx = dx * Math.cos(zone.r) - dz * Math.sin(zone.r)
  const lz = dx * Math.sin(zone.r) + dz * Math.cos(zone.r)
  const e = 1e-6
  const pts = zone.pts
  if (!pts || pts.length < 3)
    return Math.abs(lx) <= zone.w / 2 + e && Math.abs(lz) <= zone.d / 2 + e
  // inside when a ray from it crosses the edges an odd number of times
  let inside = false
  pts.forEach(([x0, z0], i) => {
    const [x1, z1] = pts[(i + 1) % pts.length]!
    if (z0 > lz !== z1 > lz && lx < x0 + ((lz - z0) * (x1 - x0)) / (z1 - z0)) inside = !inside
  })
  return inside || onEdge(pts, lx, lz, e)
}

/**
 * Whether the point (x, z) on the floor lies inside a placed zone (edges included): what stands
 * there can't be edited while the zone is locked
 */
export const inZone = (zone: THREE.Object3D, x: number, z: number) =>
  inRect(
    {
      x: zone.position.x,
      z: zone.position.z,
      r: zone.rotation.y,
      w: zone.userData.w as number,
      d: zone.userData.d as number,
      pts: zone.userData.pts as ZonePoint[] | undefined,
    },
    x,
    z,
  )

export const buildZone = (g: THREE.Group) => applyZone(g, { w: 2, d: 2 })
