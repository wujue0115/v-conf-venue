import * as THREE from 'three'

/*
 * 區域: a rectangle marked on the floor — a light tint of its colour with a solid border.
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
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

const mats = new Map<string, { fill: THREE.Material; edge: THREE.Material }>()
function zoneMats(color: string) {
  let m = mats.get(color)
  if (!m) {
    // drawn over the floor without fighting it, and never hiding what stands on it
    const base = { color, transparent: true, depthWrite: false, polygonOffset: true }
    m = {
      fill: new THREE.MeshBasicMaterial({ ...base, opacity: 0.22, polygonOffsetFactor: -1 }),
      edge: new THREE.MeshBasicMaterial({ ...base, opacity: 0.85, polygonOffsetFactor: -2 }),
    }
    mats.set(color, m)
  }
  return m
}

function strip(g: THREE.Object3D, m: THREE.Material, x: number, z: number, sx: number, sz: number) {
  const s = new THREE.Mesh(PLANE, m)
  s.position.set(x, LIFT, z)
  s.scale.set(sx, 1, sz)
  s.renderOrder = 2
  g.add(s)
}

/** (Re)draw a zone at w × d metres in `color` */
export function applyZone(
  g: THREE.Object3D,
  { w, d, color = ZONE_COLOR }: { w: number; d: number; color?: string },
) {
  g.clear()
  const { fill, edge } = zoneMats(color)
  const f = new THREE.Mesh(PLANE, fill)
  f.position.y = LIFT
  f.scale.set(w, 1, d)
  f.renderOrder = 1
  f.name = 'fill'
  g.add(f)
  strip(g, edge, 0, (d - BORDER) / 2, w, BORDER)
  strip(g, edge, 0, -(d - BORDER) / 2, w, BORDER)
  strip(g, edge, (w - BORDER) / 2, 0, BORDER, d)
  strip(g, edge, -(w - BORDER) / 2, 0, BORDER, d)
  g.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
  })
  g.userData.w = w
  g.userData.d = d
  if (color !== ZONE_COLOR) g.userData.color = color
  else delete g.userData.color
}

export const buildZone = (g: THREE.Group) => applyZone(g, { w: 2, d: 2 })
