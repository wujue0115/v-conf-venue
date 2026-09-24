import * as THREE from 'three'
import { mat, mesh } from './materials'

/*
 * 點心盤: a long silver platter with angled ends, a raised rim and a paper doily, laid with
 * one kind of pastry. It only ever rests on a table; its origin is the tray's underside centre.
 */

/** Platter footprint, metres: length along local x, width along z */
export const TRAY_L = 0.42
export const TRAY_W = 0.29
/** How far the angled ends cut in, and the corners' rounding */
const CHAMFER = 0.06
const ROUND = 0.03
/** The flat base inside the rim, and the rim's height */
const WELL = 0.035
const DEPTH = 0.022
const SAMPLES = 96

/** The platter's outline (a long octagon with rounded corners), inset by `inset` */
function outline(inset = 0) {
  const l = TRAY_L / 2 - inset
  const w = TRAY_W / 2 - inset
  const c = Math.max(0.01, CHAMFER - inset * 0.4)
  const corners: [number, number][] = [
    [-l + c, -w],
    [l - c, -w],
    [l, -w + c],
    [l, w - c],
    [l - c, w],
    [-l + c, w],
    [-l, w - c],
    [-l, -w + c],
  ]
  const r = Math.max(0.004, ROUND - inset * 0.5)
  const s = new THREE.Shape()
  corners.forEach(([x, z], k) => {
    // round each corner: stop short of it, then curve through it to the next side
    const [px, pz] = corners[(k + corners.length - 1) % corners.length]!
    const [nx, nz] = corners[(k + 1) % corners.length]!
    const toward = (ax: number, az: number) => {
      const d = Math.hypot(ax - x, az - z)
      const t = Math.min(r, d / 2) / d
      return [x + (ax - x) * t, z + (az - z) * t] as const
    }
    const [ax, az] = toward(px, pz)
    const [bx, bz] = toward(nx, nz)
    if (k === 0) s.moveTo(ax, az)
    else s.lineTo(ax, az)
    s.quadraticCurveTo(x, z, bx, bz)
  })
  s.closePath()
  return s
}

/** Evenly spaced points round an outline (the same count for every inset, so rings line up) */
const ring = (inset: number) => outline(inset).getSpacedPoints(SAMPLES).slice(0, SAMPLES)

/**
 * The dish as one smooth surface: a loft through outline rings from the flat base, up a
 * curved rim, over a rolled lip and back down the outside to the foot.
 */
function dishGeometry() {
  // [inset, height] along the rim's cross-section, inside to outside
  const profile: [number, number][] = [
    [WELL, 0.003],
    [WELL - 0.008, 0.005],
    [WELL - 0.018, 0.011],
    [WELL - 0.026, 0.017],
    [0.004, DEPTH - 0.002],
    [0, DEPTH],
    [-0.002, DEPTH - 0.004],
    [0.004, 0.008],
    [0.02, 0],
  ]
  const rings = profile.map(([inset]) => ring(inset))
  const pos: number[] = []
  const idx: number[] = []
  rings.forEach((pts, k) => {
    const y = profile[k]![1]
    for (const p of pts) pos.push(p.x, y, p.y)
  })
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < SAMPLES; i++) {
      const a = k * SAMPLES + i
      const b = k * SAMPLES + ((i + 1) % SAMPLES)
      const c = a + SAMPLES
      const d = b + SAMPLES
      idx.push(a, c, b, b, c, d)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  // the flat base inside the rim
  const floor = new THREE.ShapeGeometry(outline(WELL), 12)
    .rotateX(Math.PI / 2)
    .translate(0, 0.003, 0)
  return { rim: geo, floor }
}

/** The doily: the base's outline with a scalloped paper edge */
function doilyGeometry() {
  const pts = outline(WELL + 0.004)
    .getSpacedPoints(180)
    .slice(0, 180)
  const s = new THREE.Shape(
    pts.map((p, i) => {
      const n = pts[(i + 1) % pts.length]!.clone().sub(pts[(i + pts.length - 1) % pts.length]!)
      const bump = 0.004 * Math.abs(Math.sin((i * Math.PI) / 3))
      return new THREE.Vector2(p.x + (n.y / n.length()) * bump, p.y - (n.x / n.length()) * bump)
    }),
  )
  return new THREE.ShapeGeometry(s, 1).rotateX(Math.PI / 2).translate(0, 0.0045, 0)
}

const DISH = dishGeometry()
const DOILY = doilyGeometry()
/**
 * Polished stainless steel. The scene has no environment map for a metal to reflect, so a
 * metallic material renders grey; instead a near-white base carries the brightness, a
 * clearcoat gives it steel's glossy highlights, and a touch of emissive keeps the side away
 * from the lights from going dull. Both sides of the thin rim are lit.
 */
const steel = new THREE.MeshPhysicalMaterial({
  color: '#f6f7f9',
  metalness: 0.15,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  emissive: '#2a2d33',
  side: THREE.DoubleSide,
  name: 'tray_steel',
})
const doilyMat = mat('#fbfaf6', { roughness: 0.9, side: THREE.DoubleSide, name: 'doily' })

const M = {
  puff: mat('#e7b45c', { roughness: 0.7, name: 'puff' }),
  sugar: mat('#fbf7ee', { roughness: 0.9, name: 'sugar' }),
  sponge: mat('#4a2a1c', { roughness: 0.8, name: 'chocolate' }),
  cream: mat('#fbf7f0', { roughness: 0.6, name: 'cream' }),
  cherry: mat('#6e0f1a', { roughness: 0.3, name: 'cherry' }),
  crust: mat('#d99f55', { roughness: 0.7, name: 'crust' }),
  custard: mat('#f6d36c', { roughness: 0.5, name: 'custard' }),
}
const PUFF = new THREE.SphereGeometry(0.026, 12, 8)
const DOT = new THREE.SphereGeometry(0.01, 8, 6)
const TART = new THREE.CylinderGeometry(0.03, 0.024, 0.018, 16)
const FILL = new THREE.CylinderGeometry(0.023, 0.023, 0.004, 16)

/** Centres laid out in rows over the doily, each row nudged half a step like the photos */
function grid(cols: number, rows: number, dx: number, dz: number, stagger = true) {
  const out: [number, number][] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * dx + (stagger && r % 2 ? dx / 2 : 0)
      if (Math.abs(x) > TRAY_L / 2 - WELL - 0.03) continue
      out.push([x, (r - (rows - 1) / 2) * dz])
    }
  return out
}

const TOP = 0.005

const pastries: Record<string, (g: THREE.Group) => void> = {
  // 泡芙: golden choux puffs dusted with sugar
  puff: (g) => {
    for (const [x, z] of grid(7, 4, 0.052, 0.05)) {
      mesh(PUFF, M.puff, g, x, TOP + 0.02, z, { e: null }).scale.y = 0.8
      mesh(DOT, M.sugar, g, x, TOP + 0.04, z, { e: null }).scale.set(1.4, 0.5, 1.4)
    }
  },
  // 黑森林: two chocolate sponge slabs topped with cream dots and cherries
  cake: (g) => {
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.15, 0.045, 0.17), M.sponge, g, sx * 0.078, TOP + 0.0225, 0, {
        e: null,
      })
    }
    for (const [x, z] of grid(7, 4, 0.042, 0.042, false)) {
      if (Math.abs(x) > 0.15) continue
      mesh(DOT, M.cream, g, x, TOP + 0.052, z, { e: null }).scale.set(1.2, 0.8, 1.2)
      mesh(DOT, M.cherry, g, x, TOP + 0.064, z, { e: null })
    }
  },
  // 蛋塔: round egg tarts with a yellow custard top
  tart: (g) => {
    for (const [x, z] of grid(6, 3, 0.062, 0.064)) {
      mesh(TART, M.crust, g, x, TOP + 0.009, z, { e: null })
      mesh(FILL, M.custard, g, x, TOP + 0.019, z, { e: null })
    }
  },
}

export function buildSnack(g: THREE.Group, v = 'puff') {
  mesh(DISH.rim, steel, g, 0, 0, 0, { e: null })
  mesh(DISH.floor, steel, g, 0, 0, 0, { e: null })
  mesh(DOILY, doilyMat, g, 0, 0, 0, { e: null })
  ;(pastries[v] ?? pastries.puff!)(g)
}
