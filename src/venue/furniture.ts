import * as THREE from 'three'
import { B, Cy, EF, FM, mesh } from './materials'

/** Builds a piece into `g`; `v` is the colour variant id when the type has variants */
type Builder = (g: THREE.Group, v?: string) => void

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Round rod from a to b (a Cylinder is Y-aligned, so rotate it onto the a→b direction) */
function rod(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const d = b.clone().sub(a)
  const c = mesh(Cy(r, r, d.length(), 10), m, g, 0, 0, 0, { e: null })
  c.position.copy(a).add(b).multiplyScalar(0.5)
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  return c
}
/** The same rod on both sides of the chair (mirrored in x) */
function rods(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  rod(g, a, b, r, m)
  rod(g, V(-a.x, a.y, a.z), V(-b.x, b.y, b.z), r, m)
}

/**
 * Upright curved wall in plan: an annulus sector of outer radius `r` and thickness `t`,
 * from y0 to y0 + h. Angles are in degrees with 90° pointing to the back (−z); `sz`
 * squashes the circle front-to-back into an ellipse.
 */
function arcWall(
  g: THREE.Object3D,
  r: number,
  t: number,
  y0: number,
  h: number,
  from: number,
  to: number,
  m: THREE.Material,
  sz = 1,
) {
  const a0 = THREE.MathUtils.degToRad(from)
  const a1 = THREE.MathUtils.degToRad(to)
  const s = new THREE.Shape()
  s.absarc(0, 0, r, a0, a1, false)
  s.absarc(0, 0, r - t, a1, a0, true)
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 24 })
  const w = mesh(geo, m, g, 0, y0, 0, { e: EF })
  w.rotation.x = -Math.PI / 2
  w.scale.y = sz
  return w
}

/** Elliptical disc (seat cushion, bowl) of width w and depth d, centred at height y */
function disc(g: THREE.Object3D, w: number, d: number, h: number, y: number, m: THREE.Material) {
  const c = mesh(Cy(w / 2, w / 2, h, 32), m, g, 0, y, 0, { e: EF })
  c.scale.z = d / w
  return c
}

function caster(g: THREE.Object3D, x: number, z: number) {
  const c = mesh(Cy(0.025, 0.025, 0.02, 12), FM.black, g, x, 0.025, z, { e: null })
  c.rotation.z = Math.PI / 2
}

/** Tub chair body: bowl + cushion + a shell that is taller at the back than at the arms */
function tub(
  g: THREE.Object3D,
  {
    w,
    d,
    y0,
    backH,
    armH,
    arm,
    m,
  }: {
    w: number
    d: number
    y0: number
    backH: number
    armH: number
    /** how far past the sides (degrees) the arms wrap toward the front */
    arm: number
    m: THREE.Material
  },
) {
  const sz = d / w
  const r = w / 2
  mesh(Cy(r, r * 0.85, 0.1, 32), m, g, 0, y0 + 0.05, 0, { e: EF }).scale.z = sz
  disc(g, w - 0.1, d - 0.08, 0.08, y0 + 0.12, m)
  arcWall(g, r, 0.07, y0 + 0.1, backH - 0.1, 25, 155, m, sz)
  arcWall(g, r, 0.07, y0 + 0.1, armH - 0.1, -arm, 25, m, sz)
  arcWall(g, r, 0.07, y0 + 0.1, armH - 0.1, 155, 180 + arm, m, sz)
}

// W500 × D510 × H900 — leather tub seat (grey / brown) on four black legs with a footrest
const stoolHigh: Builder = (g, v) => {
  const top = 0.17
  const foot = 0.21
  const seatY = 0.62
  const at = (y: number) => foot + ((top - foot) * y) / seatY
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const)
    rod(g, V(sx * foot, 0, sz * foot), V(sx * top, seatY, sz * top), 0.011, FM.blackMetal)
  // footrest: front bar and two side bars at 0.3m
  const f = at(0.3)
  rod(g, V(-f, 0.3, f), V(f, 0.3, f), 0.01, FM.blackMetal)
  rods(g, V(f, 0.3, f), V(f, 0.3, -f), 0.01, FM.blackMetal)
  tub(g, {
    w: 0.5,
    d: 0.51,
    y0: seatY - 0.04,
    backH: 0.32,
    armH: 0.2,
    arm: 35,
    m: v === 'brown' ? FM.brownLeather : FM.greyLeather,
  })
}

// W450 × D420 × H780 — light grey shell back, blue seat pad, chrome sled base
const studentChair: Builder = (g) => {
  const x = 0.2
  rods(g, V(x, 0.012, 0.19), V(x, 0.012, -0.2), 0.009, FM.chrome)
  rods(g, V(x, 0.012, 0.19), V(x, 0.44, 0.16), 0.009, FM.chrome)
  rods(g, V(x, 0.012, -0.2), V(x, 0.44, -0.15), 0.009, FM.chrome)
  rods(g, V(x, 0.44, -0.16), V(x, 0.62, -0.2), 0.009, FM.chrome)
  mesh(B(0.45, 0.025, 0.41), FM.shell, g, 0, 0.44, 0, { e: EF })
  mesh(B(0.43, 0.035, 0.38), FM.blue, g, 0, 0.47, 0.01, { e: EF })
  const bk = mesh(B(0.45, 0.34, 0.015), FM.shell, g, 0, 0.61, -0.2, { e: EF })
  bk.rotation.x = -0.12
}

// W573 × D552 × backrest H742 × seat H410 — black mesh back, dark grey frame on casters
const foldBlack: Builder = (g) => {
  const x = 0.25
  rods(g, V(x, 0.05, -0.25), V(x, 0.74, -0.2), 0.012, FM.frame)
  rods(g, V(x + 0.01, 0.05, 0.25), V(x, 0.45, -0.04), 0.012, FM.frame)
  rods(g, V(x, 0.4, -0.22), V(x, 0.42, 0.18), 0.01, FM.frame)
  for (const sx of [1, -1]) {
    caster(g, sx * x, -0.25)
    caster(g, sx * (x + 0.01), 0.25)
    // folding hinge block
    mesh(B(0.04, 0.06, 0.16), FM.silver, g, sx * (x + 0.02), 0.45, 0.02, { e: EF })
  }
  mesh(B(0.48, 0.06, 0.44), FM.black, g, 0, 0.41, 0.03, { e: EF })
  const bk = mesh(B(0.48, 0.32, 0.02), FM.mesh, g, 0, 0.56, -0.215, { e: EF })
  bk.rotation.x = -0.08
}

// W400 × D410 × backrest H750 × seat H420 — classic folding chair, patterned padding
const foldBeige: Builder = (g) => {
  const x = 0.19
  // front legs run up and back to become the backrest uprights
  rods(g, V(x, 0.008, 0.16), V(x, 0.75, -0.18), 0.011, FM.frame)
  rods(g, V(x - 0.02, 0.008, -0.22), V(x - 0.02, 0.42, 0.14), 0.011, FM.frame)
  rod(g, V(-x, 0.1, 0.11), V(x, 0.1, 0.11), 0.008, FM.frame)
  mesh(B(0.39, 0.05, 0.37), FM.pattern, g, 0, 0.44, 0.01, { e: EF })
  const zAt = (y: number) => 0.16 - (0.34 * y) / 0.75
  const bk = mesh(B(0.38, 0.2, 0.04), FM.pattern, g, 0, 0.64, zAt(0.64) + 0.02, { e: EF })
  bk.rotation.x = -Math.atan(0.34 / 0.75)
}

// W800 × D800 × H750 — oak top on white scissor legs
const foldTable: Builder = (g) => {
  mesh(B(0.8, 0.03, 0.8), FM.oak, g, 0, 0.735, 0, { e: EF })
  for (const x of [-0.33, 0.33]) {
    mesh(B(0.03, 0.03, 0.72), FM.white, g, x, 0.705, 0, { e: null })
    rod(g, V(x, 0.01, -0.33), V(x, 0.69, 0.3), 0.013, FM.white)
    rod(g, V(x, 0.01, 0.33), V(x, 0.69, -0.3), 0.013, FM.white)
  }
}

// W×450×H710 — grey laminate top, silver cantilever legs on casters, perforated front panel
function tableN(g: THREE.Group, W: number) {
  mesh(B(W, 0.025, 0.45), FM.laminate, g, 0, 0.6975, 0, { e: EF })
  for (const sx of [1, -1]) {
    const x = sx * (W / 2 - 0.08)
    mesh(B(0.04, 0.03, 0.4), FM.silver, g, x, 0.67, 0, { e: null })
    mesh(B(0.04, 0.035, 0.42), FM.silver, g, x, 0.07, 0, { e: null })
    rod(g, V(x, 0.66, 0.08), V(x, 0.08, -0.14), 0.02, FM.silver)
    caster(g, x, 0.19)
    caster(g, x, -0.19)
  }
  mesh(B(W - 0.24, 0.3, 0.01), FM.white, g, 0, 0.5, 0.2, { e: EF })
}

// W600 × D460 × H780 — red-orange tub on a black swivel star base
const redSofa: Builder = (g) => {
  for (let k = 0; k < 4; k++) {
    const l = mesh(B(0.3, 0.025, 0.04), FM.black, g, 0, 0.0125, 0, { e: null })
    l.geometry.translate(0.15, 0, 0)
    l.rotation.y = Math.PI / 4 + (k * Math.PI) / 2
  }
  mesh(Cy(0.03, 0.03, 0.36, 12), FM.black, g, 0, 0.2, 0, { e: null })
  tub(g, { w: 0.6, d: 0.46, y0: 0.38, backH: 0.4, armH: 0.25, arm: 40, m: FM.redOrange })
}

// W800 × D760 × H660 — grey leather box armchair on short metal feet
const armchair: Builder = (g) => {
  const [W, D, H, y] = [0.8, 0.76, 0.66, 0.03]
  mesh(B(W, 0.35, D), FM.greyLeather, g, 0, y + 0.175, 0, { e: EF })
  mesh(B(W, H - y - 0.35, 0.16), FM.greyLeather, g, 0, (H + y + 0.35) / 2, -D / 2 + 0.08, { e: EF })
  for (const sx of [1, -1])
    mesh(B(0.16, H - y - 0.35, D), FM.greyLeather, g, sx * (W / 2 - 0.08), (H + y + 0.35) / 2, 0, {
      e: EF,
    })
  mesh(B(W - 0.32, 0.08, D - 0.18), FM.greyLeather, g, 0, y + 0.39, 0.08, { e: EF })
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const)
    mesh(B(0.08, y, 0.05), FM.silver, g, sx * (W / 2 - 0.1), y / 2, sz * (D / 2 - 0.08), {
      e: null,
    })
}

// W660 × D580 × H710 — leather tub (orange / green) on a chrome wire sled
const shapeSofa: Builder = (g, v) => {
  const x = 0.24
  rods(g, V(x, 0.01, 0.24), V(x, 0.01, -0.24), 0.008, FM.chrome)
  rods(g, V(x, 0.01, 0.24), V(x, 0.38, 0.15), 0.008, FM.chrome)
  rods(g, V(x, 0.01, -0.24), V(x, 0.38, -0.14), 0.008, FM.chrome)
  const m = v === 'green' ? FM.olive : FM.tan
  tub(g, { w: 0.66, d: 0.58, y0: 0.36, backH: 0.35, armH: 0.3, arm: 30, m })
}

// W710 × D750 × H760 — cream box sofa framed by chrome tubes at the arm corners
const whiteSofa: Builder = (g) => {
  const [W, D, H, y, armH] = [0.71, 0.75, 0.76, 0.06, 0.6]
  mesh(B(W - 0.16, 0.34, D - 0.04), FM.cream, g, 0, y + 0.17, 0.02, { e: EF })
  mesh(B(W - 0.16, H - y, 0.16), FM.cream, g, 0, (H + y) / 2, -D / 2 + 0.08, { e: EF })
  mesh(B(W - 0.24, 0.08, D - 0.2), FM.cream, g, 0, y + 0.38, 0.08, { e: EF })
  for (const sx of [1, -1]) {
    const x = sx * (W / 2 - 0.08)
    mesh(B(0.1, armH - y, D - 0.08), FM.cream, g, x, (armH + y) / 2, 0, { e: EF })
    for (const z of [D / 2 - 0.04, -D / 2 + 0.04])
      mesh(Cy(0.035, 0.035, armH, 16), FM.chrome, g, sx * (W / 2 - 0.035), armH / 2, z, { e: null })
  }
}

// Ø500 × H600 — white top on a white column with a three-prong foot
const teaWhite: Builder = (g) => {
  mesh(Cy(0.25, 0.25, 0.025, 32), FM.white, g, 0, 0.5875, 0, { e: EF })
  mesh(Cy(0.022, 0.022, 0.55, 12), FM.white, g, 0, 0.3, 0, { e: null })
  for (let k = 0; k < 3; k++) {
    const f = mesh(B(0.24, 0.025, 0.045), FM.white, g, 0, 0.0125, 0, { e: null })
    f.geometry.translate(0.12, 0, 0)
    f.rotation.y = (k * Math.PI * 2) / 3 + Math.PI / 2
  }
}

// Ø500 × H550 — walnut tray top, black stem curving down to a ring base
const teaWood: Builder = (g) => {
  mesh(Cy(0.25, 0.25, 0.025, 32), FM.walnut, g, 0, 0.5225, 0, { e: EF })
  const rim = mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 40), FM.walnut, g, 0, 0.537, 0, {
    e: null,
  })
  rim.rotation.x = Math.PI / 2
  rod(g, V(0, 0.51, 0), V(0, 0.12, 0), 0.016, FM.blackMetal)
  rod(g, V(0, 0.12, 0), V(0, 0.02, -0.16), 0.016, FM.blackMetal)
  arcWall(g, 0.2, 0.06, 0, 0.02, 0, 360, FM.blackMetal)
}

// W610 × D450 × H760–1055 — walnut top with concave sides on a single column and caster star
const liftLectern: Builder = (g) => {
  const [w, d] = [0.61, 0.45]
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -d / 2)
  s.lineTo(w / 2, -d / 2)
  s.quadraticCurveTo(w / 2 - 0.05, 0, w / 2, d / 2)
  s.lineTo(-w / 2, d / 2)
  s.quadraticCurveTo(-w / 2 + 0.05, 0, -w / 2, -d / 2)
  const tilt = new THREE.Group()
  tilt.position.set(0, 0.95, 0)
  tilt.rotation.x = 0.15
  g.add(tilt)
  const top = mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false }),
    FM.walnut,
    tilt,
    0,
    0,
    0,
    { e: EF },
  )
  top.rotation.x = -Math.PI / 2
  mesh(B(0.012, 0.004, 0.16), FM.black, tilt, 0.1, 0.027, 0, { e: null })
  // column sits off-centre under the top; the caster star stays inside the top's footprint
  const cx0 = -0.1
  mesh(B(0.06, 0.03, 0.12), FM.frame, g, cx0, 0.93, 0, { e: null })
  mesh(Cy(0.028, 0.028, 0.84, 12), FM.silver, g, cx0, 0.5, 0, { e: null })
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const [cx, cz] = [cx0 + Math.cos(a) * 0.2, Math.sin(a) * 0.2]
    rod(g, V(cx0, 0.08, 0), V(cx, 0.05, cz), 0.015, FM.silver)
    caster(g, cx, cz)
  }
}

// W800 × D600 × H1050 — oak podium with a grey front panel and sloped top
const woodLectern: Builder = (g) => {
  mesh(B(0.76, 0.04, 0.56), FM.black, g, 0, 0.02, 0, { e: null })
  mesh(B(0.8, 0.96, 0.6), FM.oak, g, 0, 0.52, 0, { e: EF })
  const t = mesh(B(0.8, 0.04, 0.45), FM.oak, g, 0, 1.005, 0.05, { e: EF })
  t.rotation.x = 0.12
  mesh(B(0.52, 0.62, 0.01), FM.panel, g, 0, 0.56, 0.305, { e: EF })
}

// Open-back view of the oak podium: two shelves inside
const woodTeacher: Builder = (g) => {
  mesh(B(0.8, 0.04, 0.6), FM.oak, g, 0, 1.03, 0, { e: EF })
  mesh(B(0.8, 1.01, 0.03), FM.oak, g, 0, 0.505, 0.285, { e: EF })
  for (const x of [-0.385, 0.385]) mesh(B(0.03, 1.01, 0.6), FM.oak, g, x, 0.505, 0, { e: EF })
  for (const y of [0.04, 0.55, 0.82]) mesh(B(0.74, 0.03, 0.57), FM.oak, g, 0, y, 0.005, { e: EF })
}

// W620 × D650 × H1100 — charcoal cabinet with silver trim, sloped top, open shelves at the back, on casters
const infoLectern: Builder = (g) => {
  const [W, D] = [0.62, 0.65]
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    caster(g, sx * (W / 2 - 0.05), sz * (D / 2 - 0.05))
    mesh(B(0.03, 0.94, 0.03), FM.silver, g, sx * (W / 2 - 0.015), 0.53, sz * (D / 2 - 0.015), {
      e: null,
    })
  }
  mesh(B(W, 0.03, D), FM.silver, g, 0, 0.065, 0, { e: EF })
  for (const sx of [1, -1])
    mesh(B(0.02, 0.9, D - 0.06), FM.charcoal, g, sx * (W / 2 - 0.02), 0.53, 0, { e: EF })
  mesh(B(W - 0.06, 0.9, 0.02), FM.charcoal, g, 0, 0.53, D / 2 - 0.02, { e: EF })
  // presenter side (−z) is open: dark interior with two shelves and a drawer strip
  mesh(B(W - 0.06, 0.9, 0.01), FM.black, g, 0, 0.53, 0, { e: null })
  for (const y of [0.33, 0.62])
    mesh(B(W - 0.06, 0.02, D / 2 - 0.03), FM.black, g, 0, y, -D / 4, { e: EF })
  mesh(B(W - 0.06, 0.1, 0.02), FM.silver, g, 0, 0.9, -D / 2 + 0.02, { e: EF })
  // sloped top: silver frame with a dark inset, higher on the audience side
  const tilt = new THREE.Group()
  tilt.position.set(0, 1.035, 0)
  tilt.rotation.x = -0.12
  g.add(tilt)
  mesh(B(W, 0.04, D - 0.02), FM.silver, tilt, 0, 0, 0, { e: EF })
  mesh(B(W - 0.1, 0.005, D - 0.1), FM.charcoal, tilt, 0, 0.022, 0, { e: null })
}

// Stainless steel post on a domed base, black belt cassette at the top
const stanchion: Builder = (g) => {
  mesh(Cy(0.17, 0.17, 0.02, 32), FM.chrome, g, 0, 0.01, 0, { e: null })
  mesh(Cy(0.05, 0.16, 0.04, 32), FM.chrome, g, 0, 0.04, 0, { e: null })
  mesh(Cy(0.032, 0.032, 0.86, 16), FM.chrome, g, 0, 0.49, 0, { e: null })
  mesh(Cy(0.04, 0.04, 0.09, 16), FM.black, g, 0, 0.92, 0, { e: null })
  mesh(Cy(0.042, 0.042, 0.015, 16), FM.chrome, g, 0, 0.972, 0, { e: null })
}

// A3 poster frame on a chrome pole with a teal weighted base
const sign: Builder = (g) => {
  mesh(Cy(0.17, 0.19, 0.04, 32), FM.teal, g, 0, 0.02, 0, { e: EF })
  mesh(Cy(0.012, 0.012, 1.2, 12), FM.chrome, g, 0, 0.64, 0, { e: null })
  mesh(B(0.33, 0.45, 0.015), FM.silver, g, 0, 1.44, 0, { e: EF })
  mesh(B(0.297, 0.42, 0.004), FM.white, g, 0, 1.44, 0.008, { e: null })
}

export interface FurnitureVariant {
  id: string
  name: string
  /** CSS colour for the swatch button */
  swatch: string
}

export interface FurnitureDef {
  name: string
  size: string
  build: Builder
  /** Colour options; the first is the default */
  variants?: readonly FurnitureVariant[]
  /** Default array spacing [left-right, front-back] in metres */
  arr: [number, number]
  /** Rental price per slot: [自助搬運, 含搬運] */
  price: [number, number]
}

// 附件五 家具設備租借費用表（單位 mm → m；價格：自助 / 含搬運）
export const FURNITURE = {
  stoolHigh: {
    name: '高腳椅',
    size: 'W500×D510×H900',
    build: stoolHigh,
    variants: [
      { id: 'grey', name: '灰', swatch: '#5a5a5c' },
      { id: 'brown', name: '咖啡', swatch: '#6e4b3b' },
    ],
    arr: [0.6, 0.7],
    price: [350, 550],
  },
  studentChair: {
    name: '學生椅',
    size: 'W450×D420×H780',
    build: studentChair,
    arr: [0.55, 0.9],
    price: [300, 500],
  },
  foldBlack: {
    name: '收納椅（黑）',
    size: 'W573×D552×H742',
    build: foldBlack,
    arr: [0.65, 0.95],
    price: [300, 800],
  },
  foldBeige: {
    name: '收納椅（米）',
    size: 'W400×D410×H750',
    build: foldBeige,
    arr: [0.5, 0.9],
    price: [200, 700],
  },
  foldTable: {
    name: '收納桌',
    size: 'W800×D800×H750',
    build: foldTable,
    arr: [0.9, 0.9],
    price: [200, 700],
  },
  table3: {
    name: '三人桌',
    size: 'W1800×D450×H710',
    build: (g) => tableN(g, 1.8),
    arr: [1.85, 1.2],
    price: [300, 500],
  },
  table2: {
    name: '二人桌',
    size: 'W1200×D450×H710',
    build: (g) => tableN(g, 1.2),
    arr: [1.25, 1.2],
    price: [300, 500],
  },
  redSofa: {
    name: '紅色造型沙發',
    size: 'W600×D460×H780',
    build: redSofa,
    arr: [0.8, 0.8],
    price: [600, 1100],
  },
  armchair: {
    name: '單人沙發',
    size: 'W800×D760×H660',
    build: armchair,
    arr: [1, 1.2],
    price: [590, 1090],
  },
  shapeSofa: {
    name: '造型沙發',
    size: 'W660×D580×H710',
    build: shapeSofa,
    variants: [
      { id: 'orange', name: '橘', swatch: '#c27a3e' },
      { id: 'green', name: '綠', swatch: '#9cb23c' },
    ],
    arr: [0.8, 1],
    price: [600, 1100],
  },
  whiteSofa: {
    name: '白面沙發',
    size: 'W710×D750×H760',
    build: whiteSofa,
    arr: [0.9, 1.2],
    price: [900, 1400],
  },
  teaWhite: {
    name: '白面圓形茶几',
    size: 'Ø500×H600',
    build: teaWhite,
    arr: [0.8, 0.8],
    price: [350, 850],
  },
  teaWood: {
    name: '木面圓形小茶几',
    size: 'Ø500×H550',
    build: teaWood,
    arr: [0.8, 0.8],
    price: [350, 850],
  },
  liftLectern: {
    name: '移動升降講桌',
    size: 'W610×D450×H760–1055',
    build: liftLectern,
    arr: [1, 1],
    price: [700, 900],
  },
  woodLectern: {
    name: '木作可移動講桌',
    size: 'W800×D600×H1050',
    build: woodLectern,
    arr: [1.2, 1],
    price: [900, 1100],
  },
  infoLectern: {
    name: '資訊可移動講桌',
    size: 'W620×D650×H1100',
    build: infoLectern,
    arr: [1, 1],
    price: [900, 1100],
  },
  woodTeacher: {
    name: '木作講師桌',
    size: 'W800×D600×H1050',
    build: woodTeacher,
    arr: [1.2, 1],
    price: [900, 1100],
  },
  stanchion: {
    name: '伸縮紅龍柱',
    size: '支',
    build: stanchion,
    arr: [1.5, 1.5],
    price: [100, 300],
  },
  sign: { name: '直式立架', size: 'A1 / A3 / A4', build: sign, arr: [1, 1], price: [300, 500] },
} satisfies Record<string, FurnitureDef>

export type FurnitureType = keyof typeof FURNITURE
export const FURNITURE_TYPES = Object.keys(FURNITURE) as FurnitureType[]

export const isFurnitureType = (t: unknown): t is FurnitureType =>
  typeof t === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE, t)

export const variantsOf = (type: FurnitureType): readonly FurnitureVariant[] =>
  (FURNITURE[type] as FurnitureDef).variants ?? []

/** A known variant id for `type`, falling back to its default (undefined when it has none) */
export function resolveVariant(type: FurnitureType, v?: unknown) {
  const vs = variantsOf(type)
  return (vs.find((x) => x.id === v) ?? vs[0])?.id
}

/** Thumbnail key: the type alone, or `type.variant` for non-default colours */
export const thumbKey = (type: FurnitureType, v?: string) =>
  v && v !== variantsOf(type)[0]?.id ? `${type}.${v}` : type

export function buildFurniture(type: FurnitureType, v?: string) {
  const g = new THREE.Group()
  const variant = resolveVariant(type, v)
  g.name = type
  g.userData.type = type
  if (variant) g.userData.variant = variant
  FURNITURE[type].build(g, variant)
  return g
}

/** Render a small isometric preview of every furniture type and colour, keyed by {@link thumbKey}. */
export function renderThumbnails(): Record<string, string> {
  const out: Record<string, string> = {}
  const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  tr.setSize(240, 180)
  tr.setPixelRatio(1)
  const ts = new THREE.Scene()
  ts.add(new THREE.HemisphereLight('#fff', '#cfc6b3', 2))
  const dl = new THREE.DirectionalLight('#fff', 1.6)
  dl.position.set(-2, 4, 3)
  ts.add(dl)
  const tc = new THREE.PerspectiveCamera(28, 4 / 3, 0.01, 100)
  const dir = new THREE.Vector3(0.75, 0.6, 1.1).normalize()
  const shots = FURNITURE_TYPES.flatMap((type): [FurnitureType, string | undefined][] => {
    const vs = variantsOf(type)
    return vs.length ? vs.map((v) => [type, v.id]) : [[type, undefined]]
  })
  for (const [type, v] of shots) {
    const o = buildFurniture(type, v)
    ts.add(o)
    const bb = new THREE.Box3().setFromObject(o)
    const c = bb.getCenter(new THREE.Vector3())
    const r = bb.getSize(new THREE.Vector3()).length() / 2
    tc.position
      .copy(c)
      .add(dir.clone().multiplyScalar((r / Math.sin(THREE.MathUtils.degToRad(14))) * 0.9))
    tc.lookAt(c)
    tr.render(ts, tc)
    out[thumbKey(type, v)] = tr.domElement.toDataURL()
    ts.remove(o)
  }
  tr.dispose()
  tr.forceContextLoss()
  return out
}
