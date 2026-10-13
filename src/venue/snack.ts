import * as THREE from 'three'
import { mat, mesh } from './materials'

/*
 * 點心盤: a long platter with angled ends and a raised rim, laid with one of the tea-party snacks
 * (茶會點心) of Daily Bakery (dailybakery.com.tw). Its variant is the snack, then the platter's
 * colour (silver steel, or black). Its length and width can be set, 440 × 288 mm as it comes.
 * It only ever rests on a table; its origin is the tray's underside centre.
 */

/** Platter footprint as it comes, metres: length along local x, width along z */
export const TRAY_L = 0.44
export const TRAY_W = 0.288
/** The sizes a platter can be set to, metres */
const TRAY_MIN = 0.2
const TRAY_MAX = 1.2
export const clampTray = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(TRAY_MAX, Math.max(TRAY_MIN, n)) : fallback
/** How far the angled ends cut in, and the corners' rounding */
const CHAMFER = 0.06
const ROUND = 0.03
/** The flat base inside the rim, and the rim's height */
const WELL = 0.035
const DEPTH = 0.022
const SAMPLES = 96

/** The platter's outline (a long octagon with rounded corners), `L` × `W`, inset by `inset` */
function outline(L: number, W: number, inset = 0) {
  const l = L / 2 - inset
  const w = W / 2 - inset
  const c = Math.max(0.01, Math.min(CHAMFER, W * 0.2) - inset * 0.4)
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
const ring = (L: number, W: number, inset: number) =>
  outline(L, W, inset).getSpacedPoints(SAMPLES).slice(0, SAMPLES)

/**
 * The dish as one smooth surface: a loft through outline rings from the flat base, up a
 * curved rim, over a rolled lip and back down the outside to the foot.
 */
function dishGeometry(L: number, W: number) {
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
  const rings = profile.map(([inset]) => ring(L, W, inset))
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
  const floor = new THREE.ShapeGeometry(outline(L, W, WELL), 12)
    .rotateX(Math.PI / 2)
    .translate(0, 0.003, 0)
  return { rim: geo, floor }
}

/** The dish for each size made so far (by L × W in mm) */
const dishes = new Map<string, { rim: THREE.BufferGeometry; floor: THREE.BufferGeometry }>()
function dishOf(L: number, W: number) {
  const k = `${Math.round(L * 1000)}x${Math.round(W * 1000)}`
  let d = dishes.get(k)
  if (!d) dishes.set(k, (d = dishGeometry(L, W)))
  return d
}
/**
 * Polished stainless steel. The scene has no environment map for a metal to reflect, so a
 * metallic material renders grey; instead a near-white base carries the brightness, a
 * clearcoat gives it steel's glossy highlights, and a touch of emissive keeps the side away
 * from the lights from going dull. Both sides of the thin rim are lit.
 */
export const steel = new THREE.MeshPhysicalMaterial({
  color: '#f6f7f9',
  metalness: 0.15,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  emissive: '#2a2d33',
  side: THREE.DoubleSide,
  name: 'tray_steel',
})
/** Glossy black, the bakery's other platter */
const blackTray = new THREE.MeshPhysicalMaterial({
  color: '#1b1c1f',
  metalness: 0.1,
  roughness: 0.25,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
  name: 'tray_black',
})
/** The platter's colours, the first as it comes */
export const TRAY_COLOURS = [
  { id: 'silver', swatch: '#d9dce1' },
  { id: 'black', swatch: '#1b1c1f' },
] as const

/** One material per colour, made once */
const mats = new Map<string, THREE.Material>()
function paint(color: string) {
  let m = mats.get(color)
  if (!m) mats.set(color, (m = mat(color, { roughness: 0.7, name: `snack_${color}` })))
  return m
}

/** Unit shapes, scaled to each piece */
const BOX = new THREE.BoxGeometry(1, 1, 1)
const BALL = new THREE.SphereGeometry(0.5, 14, 10)
const DISC = new THREE.CylinderGeometry(0.5, 0.5, 1, 18)
const CUP = new THREE.CylinderGeometry(0.5, 0.4, 1, 18)
/** A croissant: half a ring, its ends toward -x */
const HORN = new THREE.TorusGeometry(0.42, 0.3, 10, 16, Math.PI)

/** The dish's flat base, which the pieces stand on */
const TOP = 0.003

/**
 * One shape of `color`, its size (sx, sy, sz) and its middle at (x, y above the dish's base, z),
 * turned `ry` about the vertical
 */
function part(
  g: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: string,
  [x, y, z]: [number, number, number],
  [sx, sy, sz]: [number, number, number],
  ry = 0,
) {
  const m = mesh(geo, paint(color), g, x, TOP + y, z, { e: null })
  m.scale.set(sx, sy, sz)
  m.rotation.y = ry
  return m
}

/** How one snack is laid: the room each piece takes along x and z, and the piece at (x, z) */
interface Lay {
  pitch: [number, number]
  /** Each other row nudged half a step, as the photos have them */
  stagger?: boolean
  piece: (g: THREE.Object3D, x: number, z: number, k: number) => void
}
/** Or strewn over the dish, for the platters (a salad, fruit) */
type Strew = (g: THREE.Object3D, L: number, W: number) => void

const C = {
  bread: '#d9a055',
  toast: '#c8873d',
  white: '#f3ead6',
  crust: '#d99f55',
  horn: '#c97d32',
  ham: '#e6a3a0',
  egg: '#f3d36b',
  lettuce: '#7fae4a',
  chicken: '#dcb88e',
  pork: '#9a5a2e',
  sausage: '#9b3b2a',
  cheese: '#f2c94c',
  cream: '#fbf7f0',
  sugar: '#f4efe6',
  choc: '#4a2a1c',
  cocoa: '#6b4430',
  custard: '#f6d36c',
  berry: '#2c2f5e',
  strawberry: '#d63b3b',
}

// ─── The shapes, by kind ───────────────────────────────────────────────────

/** Slices of baguette with a topping */
const toast = (top: string): Lay => ({
  pitch: [0.064, 0.05],
  stagger: true,
  piece: (g, x, z) => {
    part(g, DISC, C.toast, [x, 0.006, z], [0.06, 0.012, 0.044])
    part(g, DISC, top, [x, 0.014, z], [0.05, 0.005, 0.036])
  },
})
/** Crustless sandwiches: bread, filling, bread */
const sandwich = (bread: string, fill: string): Lay => ({
  pitch: [0.053, 0.053],
  piece: (g, x, z) => {
    part(g, BOX, bread, [x, 0.007, z], [0.045, 0.014, 0.045])
    part(g, BOX, fill, [x, 0.018, z], [0.043, 0.008, 0.043])
    part(g, BOX, bread, [x, 0.029, z], [0.045, 0.014, 0.045])
  },
})
/** Long soft buns, split along the top for a filling (and a sausage) */
const bun = (color: string, fill: string, sausage = false): Lay => ({
  pitch: [0.085, 0.056],
  stagger: true,
  piece: (g, x, z) => {
    part(g, BALL, color, [x, 0.018, z], [0.078, 0.036, 0.046])
    part(g, BALL, fill, [x, 0.034, z], [0.064, 0.012, 0.018])
    if (sausage) part(g, BALL, C.sausage, [x, 0.04, z], [0.072, 0.014, 0.016])
  },
})
/** Little burgers: bun, filling, sesame-topped bun */
const burger = (fill: string): Lay => ({
  pitch: [0.064, 0.064],
  stagger: true,
  piece: (g, x, z) => {
    part(g, DISC, C.bread, [x, 0.008, z], [0.054, 0.016, 0.054])
    part(g, DISC, C.lettuce, [x, 0.018, z], [0.058, 0.004, 0.058])
    part(g, DISC, fill, [x, 0.023, z], [0.054, 0.008, 0.054])
    part(g, BALL, C.bread, [x, 0.03, z], [0.054, 0.034, 0.054])
  },
})
/** Croissants, with a filling between their horns when they have one */
const croissant = (color: string, fill?: string, dusted = false): Lay => ({
  pitch: [0.08, 0.058],
  stagger: true,
  piece: (g, x, z, k) => {
    const turn = k % 2 ? Math.PI : 0
    const h = part(g, HORN, color, [x, 0.012, z], [0.07, 0.07, 0.045], turn)
    h.rotation.x = -Math.PI / 2
    part(g, BALL, color, [x, 0.016, z], [0.05, 0.03, 0.034], turn)
    if (fill) part(g, BALL, fill, [x, 0.03, z], [0.04, 0.012, 0.02], turn)
    if (dusted) part(g, BALL, C.sugar, [x, 0.032, z], [0.04, 0.006, 0.026], turn)
  },
})
/** Puff-pastry squares */
const square = (color: string): Lay => ({
  pitch: [0.052, 0.052],
  piece: (g, x, z) => {
    part(g, BOX, color, [x, 0.01, z], [0.046, 0.02, 0.046])
    part(g, BOX, C.crust, [x, 0.021, z], [0.036, 0.003, 0.036])
  },
})
/** Half-moon pastries */
const halfMoon = (color: string): Lay => ({
  pitch: [0.058, 0.04],
  stagger: true,
  piece: (g, x, z) => part(g, BALL, color, [x, 0.012, z], [0.054, 0.024, 0.034]),
})
/** Round flaky pastries with sesame on top */
const round = (color: string, seeds: string, dome = false): Lay => ({
  pitch: [0.056, 0.056],
  stagger: true,
  piece: (g, x, z) => {
    if (dome) part(g, BALL, color, [x, 0.016, z], [0.05, 0.036, 0.05])
    else part(g, DISC, color, [x, 0.009, z], [0.052, 0.018, 0.052])
    part(g, BALL, seeds, [x, dome ? 0.03 : 0.019, z], [0.038, 0.008, 0.038])
  },
})
/** Little cakes baked in a cup, with a glaze on top */
const cupcake = (color: string, glaze: string): Lay => ({
  pitch: [0.05, 0.05],
  stagger: true,
  piece: (g, x, z) => {
    part(g, CUP, color, [x, 0.014, z], [0.044, 0.028, 0.044])
    part(g, BALL, glaze, [x, 0.03, z], [0.042, 0.014, 0.042])
  },
})
/** Tarts: a crust, its filling, and what's on top */
const tart = (fill: string, top?: (g: THREE.Object3D, x: number, z: number) => void): Lay => ({
  pitch: [0.062, 0.064],
  stagger: true,
  piece: (g, x, z) => {
    part(g, CUP, C.crust, [x, 0.009, z], [0.06, 0.018, 0.06])
    part(g, DISC, fill, [x, 0.0185, z], [0.048, 0.003, 0.048])
    top?.(g, x, z)
  },
})
/** On a tart: a dome (of chocolate, meringue…) */
const dome =
  (color: string, h = 0.022) =>
  (g: THREE.Object3D, x: number, z: number) =>
    part(g, BALL, color, [x, 0.02, z], [0.04, h, 0.04])
/** On a tart: small round things (fruit, nuts), by colour */
const dots =
  (...colors: string[]) =>
  (g: THREE.Object3D, x: number, z: number) =>
    colors.forEach((c, k) => {
      const a = (k / colors.length) * Math.PI * 2
      part(
        g,
        BALL,
        c,
        [x + Math.cos(a) * 0.01, 0.024, z + Math.sin(a) * 0.01],
        [0.016, 0.012, 0.016],
      )
    })
/** Truffle-like balls */
const ball = (color: string): Lay => ({
  pitch: [0.044, 0.044],
  stagger: true,
  piece: (g, x, z) => part(g, BALL, color, [x, 0.016, z], [0.034, 0.032, 0.034]),
})
/** Chiffon cakes, square and dusted with sugar */
const chiffon = (color: string): Lay => ({
  pitch: [0.056, 0.056],
  piece: (g, x, z) => {
    part(g, BALL, color, [x, 0.022, z], [0.05, 0.046, 0.05])
    part(g, BALL, C.sugar, [x, 0.04, z], [0.036, 0.01, 0.036])
  },
})
/** Slices of a rolled cake, the cut face up and the cream's spiral showing */
const roll = (sponge: string, filling: string): Lay => ({
  pitch: [0.052, 0.05],
  stagger: true,
  piece: (g, x, z) => {
    part(g, DISC, sponge, [x, 0.015, z], [0.046, 0.03, 0.046])
    part(g, DISC, filling, [x, 0.0155, z], [0.026, 0.031, 0.026])
  },
})
/** Dacquoise: two oval meringue biscuits round a filling */
const dacquoise = (shell: string, fill: string): Lay => ({
  pitch: [0.06, 0.04],
  stagger: true,
  piece: (g, x, z) => {
    part(g, BALL, shell, [x, 0.006, z], [0.052, 0.012, 0.032])
    part(g, BALL, fill, [x, 0.013, z], [0.046, 0.008, 0.028])
    part(g, BALL, shell, [x, 0.02, z], [0.052, 0.014, 0.032])
  },
})
/** Choux puffs with a crackled sugar top */
const puff: Lay = {
  pitch: [0.054, 0.052],
  stagger: true,
  piece: (g, x, z) => {
    part(g, BALL, '#e3ad5a', [x, 0.02, z], [0.05, 0.04, 0.05])
    part(g, BALL, '#f0cf8a', [x, 0.034, z], [0.038, 0.014, 0.038])
  },
}

/** A pseudo-random sequence, the same every time, so a platter always looks the same */
function seeded(n: number) {
  let s = n
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
/** The salad: leaves heaped over the dish, egg, tomato and carrot among them */
const salad: Strew = (g, L, W) => {
  const r = seeded(7)
  const leaves = ['#6f9e3d', '#8cbf4f', '#4f7d2e', '#a3c968']
  const bits = ['#f6e08a', '#fbf7ee', '#d63b3b', '#f08a3c', '#7a3b5a']
  const n = Math.round(L * W * 1200)
  for (let k = 0; k < n; k++) {
    const x = (r() - 0.5) * (L - 2 * WELL - 0.02)
    const z = (r() - 0.5) * (W - 2 * WELL - 0.02)
    const leaf = k % 4 !== 0
    const c = leaf ? leaves[k % leaves.length]! : bits[k % bits.length]!
    const s = leaf ? 0.03 + r() * 0.02 : 0.016
    part(g, BALL, c, [x, 0.006 + r() * 0.02, z], [s, 0.008, s * 0.7], r() * Math.PI)
  }
}
/** The fruit: bands of melon, tomatoes and pineapple across the platter */
const fruit: Strew = (g, L, W) => {
  const bands = ['#a8d07a', '#d63b3b', '#f4cf4a']
  const l = L - 2 * WELL - 0.02
  const w = W - 2 * WELL - 0.02
  const step = 0.03
  for (let i = 0; i * step < l; i++)
    for (let j = 0; j * step < w; j++) {
      const x = -l / 2 + (i + 0.5) * step
      const z = -w / 2 + (j + 0.5) * step
      const band = Math.min(2, Math.floor(((x + l / 2) / l) * 3))
      const c = bands[band]!
      if (band === 1) part(g, BALL, c, [x, 0.011, z], [0.024, 0.022, 0.024])
      else part(g, BOX, c, [x, 0.01, z], [0.024, 0.02, 0.024], (i * j) % 3)
    }
}

/**
 * The bakery's tea-party snacks (茶會點心), in its order; the ids name them in i18n (variants.
 * snack). 泡芙 and 小蛋塔 keep the ids of the two the tray offered before.
 */
export const SNACKS: readonly (readonly [id: string, lay: Lay | Strew])[] = [
  ['garlic', toast('#9cb85a')],
  ['tunaCorn', toast('#f0d27a')],
  ['mentaiko', toast('#f08a5d')],
  ['classicSandwich', sandwich(C.white, C.ham)],
  ['frenchSandwich', sandwich(C.toast, C.cheese)],
  ['chickenSandwich', sandwich(C.white, C.lettuce)],
  ['eggSandwich', sandwich(C.white, C.egg)],
  ['frankfurter', bun(C.bread, C.lettuce, true)],
  ['hamEggBun', bun(C.bread, C.egg)],
  ['veggieBun', bun(C.bread, C.lettuce)],
  ['porkBurger', burger(C.pork)],
  ['hazelnutHorn', croissant(C.cocoa, undefined, true)],
  ['croissantHam', croissant(C.horn, C.ham)],
  ['croissantChicken', croissant(C.horn, C.chicken)],
  ['croissantPork', croissant(C.horn, C.pork)],
  ['croissantFruit', croissant(C.horn, C.strawberry)],
  ['croissantEgg', croissant(C.horn, C.egg)],
  ['danishSausage', bun(C.horn, C.sausage, true)],
  ['handRoll', bun('#e8c58a', '#3d4a2c')],
  ['chickenPie', square('#d79a46')],
  ['curryPuff', halfMoon('#dfa055')],
  ['radishCake', round('#e9c88e', '#f5ead2')],
  ['sesameBun', round('#7a6a58', '#3e352c', true)],
  ['lemonBomb', cupcake('#f2a83c', '#f6c95a')],
  ['tart', tart(C.custard)],
  ['portugueseTart', tart('#e9b049', dots('#b8641f', '#b8641f'))],
  ['brownie', ball(C.choc)],
  ['chiffon', chiffon('#f3dca8')],
  ['chiffonChoc', chiffon('#8a6a58')],
  ['flossRoll', roll('#c8782e', '#f1d9a6')],
  ['coffeeRoll', roll('#b88a5e', C.cream)],
  ['caramelRoll', roll('#f0dc9c', C.cream)],
  ['chocRoll', roll('#6b4430', C.cream)],
  ['matchaRoll', roll('#8fae5a', '#6e2f2a')],
  ['quiche', tart('#e2c55e', dots('#5f8f3a', '#5f8f3a', '#d63b3b'))],
  ['dacquoiseChoc', dacquoise('#5a3a28', '#b8865a')],
  ['dacquoiseHam', dacquoise('#d8b07a', C.cheese)],
  ['puff', puff],
  ['cheeseTart', tart('#e7b35a', dome('#efc46a', 0.008))],
  ['fruitCustardTart', tart(C.custard, dots('#f29a3a', '#8cbf3f', '#f29a3a'))],
  ['fruitCheeseTart', tart('#f7efd8', dots('#c9d77a', C.berry, C.strawberry))],
  ['hazelnutTart', tart(C.cocoa, dome('#6b4430'))],
  ['lemonTart', tart('#f4e27a', dots(C.cream, '#9cc94a'))],
  ['chocTart', tart('#7a4a33', dots('#7a4a33', '#7a4a33', C.berry))],
  ['macadamiaTart', tart('#c48a4a', dots('#efdcb4', '#efdcb4', '#efdcb4', '#efdcb4'))],
  ['salad', salad],
  ['fruit', fruit],
]
const BY_ID = new Map(SNACKS)

/** Pieces in rows over the base of a platter `L` × `W`, as many as fit */
function layOut(g: THREE.Object3D, lay: Lay, L: number, W: number) {
  const [dx, dz] = lay.pitch
  const l = L - 2 * WELL - 0.016
  const w = W - 2 * WELL - 0.016
  const rows = Math.max(1, Math.floor(w / dz))
  let k = 0
  for (let r = 0; r < rows; r++) {
    const nudge = lay.stagger && r % 2 ? dx / 2 : 0
    const cols = Math.max(1, Math.floor((l - nudge) / dx))
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * dx + nudge / 2
      lay.piece(g, x, (r - (rows - 1) / 2) * dz, k++)
    }
  }
}

/**
 * A platter for variant `v` (the snack, then the platter's colour), `size.w` long and `size.h`
 * wide (as it comes without)
 */
export function buildSnack(g: THREE.Group, v?: string, size?: { w: number; h: number }) {
  const [snack, colour] = (v ?? '').split('-')
  const L = clampTray(size?.w, TRAY_L)
  const W = clampTray(size?.h, TRAY_W)
  // its size, kept with it like a poster's (see furniture's resizable)
  g.userData.w = L
  g.userData.h = W
  const d = dishOf(L, W)
  const dish = colour === 'black' ? blackTray : steel
  // the dish casts no shadow: its thin, two-sided rim shadowing itself streaks it with acne
  mesh(d.rim, dish, g, 0, 0, 0, { e: null, cast: false })
  mesh(d.floor, dish, g, 0, 0, 0, { e: null, cast: false })
  const lay = BY_ID.get(snack ?? '') ?? SNACKS[0]![1]
  if (typeof lay === 'function') lay(g, L, W)
  else layOut(g, lay, L, W)
}
