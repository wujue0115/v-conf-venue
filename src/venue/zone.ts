import * as THREE from 'three'

/*
 * 區域: a rectangle marked on the floor — a light tint of its colour with a solid border. A zone
 * locked against editing (禁止編輯) is hatched in its colour instead, inside a dashed border.
 * The group's origin is the rectangle's centre on the floor; w runs along local x, d along z.
 */

/** Zones' default colour */
export const ZONE_COLOR = '#42b883'
export const ZONE_MIN = 0.25
export const ZONE_MAX = 60
/** Zones are drawn and resized on this grid (metres) */
export const ZONE_GRID = 0.25

export const clampZone = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(ZONE_MAX, Math.max(ZONE_MIN, Math.round(n / ZONE_GRID) * ZONE_GRID))
    : fallback

/** Snap a floor coordinate to the zone grid */
export const onZoneGrid = (v: number) => Math.round(v / ZONE_GRID) * ZONE_GRID

const LIFT = 0.006
const BORDER = 0.05
/** A locked zone's border: thicker, and dashed */
const LOCKED_BORDER = 0.08
const DASH = 0.3
const GAP = 0.18
/** Metres along each side of one tile of a locked zone's hatching (one stripe per tile) */
const HATCH = 0.4
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

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
    // drawn over the floor without fighting it, and never hiding what stands on it
    const base = { color, transparent: true, depthWrite: false, polygonOffset: true }
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

/** Rectangles [x, z, sx, sz] (centre and size) on the floor, as one flat geometry */
function quads(rects: [number, number, number, number][]) {
  const pos: number[] = []
  const idx: number[] = []
  for (const [x, z, sx, sz] of rects) {
    const k = pos.length / 3
    const [x0, x1, z0, z1] = [x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2]
    pos.push(x0, LIFT, z0, x0, LIFT, z1, x1, LIFT, z1, x1, LIFT, z0)
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
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

/** A locked zone's dashed border, its dashes all in one geometry */
function dashedBorder(w: number, d: number) {
  const b = LOCKED_BORDER
  const rects: [number, number, number, number][] = []
  for (const [c, l] of dashes(w)) {
    rects.push([c, (d - b) / 2, l, b], [c, -(d - b) / 2, l, b])
  }
  // the long sides' dashes stop short of the corners, which the ends' dashes cover
  for (const [c, l] of dashes(d - 2 * b)) {
    rects.push([(w - b) / 2, c, b, l], [-(w - b) / 2, c, b, l])
  }
  return quads(rects)
}

function strip(g: THREE.Object3D, m: THREE.Material, x: number, z: number, sx: number, sz: number) {
  const s = new THREE.Mesh(PLANE, m)
  s.position.set(x, LIFT, z)
  s.scale.set(sx, 1, sz)
  s.renderOrder = 2
  g.add(s)
}

/**
 * (Re)draw a zone at w × d metres in `color`, locked against editing or not (left out, it stays
 * as it was)
 */
export function applyZone(
  g: THREE.Object3D,
  {
    w,
    d,
    color = ZONE_COLOR,
    locked = !!g.userData.locked,
  }: { w: number; d: number; color?: string; locked?: boolean },
) {
  // a locked zone's hatching and dashes are its own geometry, sized to it
  for (const o of g.children) if (o.userData.own) (o as THREE.Mesh).geometry.dispose()
  g.clear()
  const m = zoneMats(color)
  if (locked) {
    const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, LIFT, 0)
    // the stripes keep their spacing whatever the zone's size
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * w) / HATCH, (uv.getY(i) * d) / HATCH)
    const f = new THREE.Mesh(geo, m.hatch)
    f.renderOrder = 1
    f.name = 'fill'
    f.userData.own = true
    const e = new THREE.Mesh(dashedBorder(w, d), m.edge)
    e.renderOrder = 2
    e.userData.own = true
    g.add(f, e)
  } else {
    const f = new THREE.Mesh(PLANE, m.fill)
    f.position.y = LIFT
    f.scale.set(w, 1, d)
    f.renderOrder = 1
    f.name = 'fill'
    g.add(f)
    strip(g, m.edge, 0, (d - BORDER) / 2, w, BORDER)
    strip(g, m.edge, 0, -(d - BORDER) / 2, w, BORDER)
    strip(g, m.edge, (w - BORDER) / 2, 0, BORDER, d)
    strip(g, m.edge, -(w - BORDER) / 2, 0, BORDER, d)
  }
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
  })
  g.userData.w = w
  g.userData.d = d
  if (color !== ZONE_COLOR) g.userData.color = color
  else delete g.userData.color
  if (locked) g.userData.locked = true
  else delete g.userData.locked
}

/** A zone's rectangle on the floor: its centre, turn about Y, width (local x) and depth (z) */
export interface ZoneRect {
  x: number
  z: number
  r: number
  w: number
  d: number
}

/** Whether the point (x, z) on the floor lies inside a zone's rectangle (edges included) */
export function inRect(zone: ZoneRect, x: number, z: number) {
  const dx = x - zone.x
  const dz = z - zone.z
  const lx = dx * Math.cos(zone.r) - dz * Math.sin(zone.r)
  const lz = dx * Math.sin(zone.r) + dz * Math.cos(zone.r)
  const e = 1e-6
  return Math.abs(lx) <= zone.w / 2 + e && Math.abs(lz) <= zone.d / 2 + e
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
    },
    x,
    z,
  )

export const buildZone = (g: THREE.Group) => applyZone(g, { w: 2, d: 2 })
