import * as THREE from 'three'
import { B, Cy, EF, FM, M, mesh } from './materials'

type Builder = (g: THREE.Group) => void

function legs(
  g: THREE.Group,
  w: number,
  d: number,
  hh: number,
  r = 0.014,
  m: THREE.Material = M.leg,
) {
  for (const [x, z] of [
    [-w, -d],
    [w, -d],
    [-w, d],
    [w, d],
  ] as const)
    mesh(Cy(r, r, hh, 8), m, g, x, hh / 2, z, { e: null })
}
function chair(
  g: THREE.Group,
  W: number,
  D: number,
  SH: number,
  BH: number,
  seatM: THREE.Material,
  frameM: THREE.Material = M.leg,
) {
  mesh(B(W, 0.05, D), seatM, g, 0, SH, 0, { e: EF })
  mesh(B(W, BH - SH - 0.06, 0.04), seatM, g, 0, (SH + BH) / 2 + 0.03, -D / 2 + 0.03, { e: EF })
  legs(g, W / 2 - 0.03, D / 2 - 0.03, SH - 0.02, 0.012, frameM)
}
function sofaBox(g: THREE.Group, W: number, D: number, H: number, m: THREE.Material, arms = true) {
  const sh = 0.42
  mesh(B(W, sh, D), m, g, 0, sh / 2, 0, { e: EF })
  mesh(B(W, H - sh, 0.14), m, g, 0, (H + sh) / 2, -D / 2 + 0.07, { e: EF })
  if (arms) {
    mesh(B(0.12, H * 0.85 - sh, D), m, g, -W / 2 + 0.06, (H * 0.85 + sh) / 2, 0, { e: EF })
    mesh(B(0.12, H * 0.85 - sh, D), m, g, W / 2 - 0.06, (H * 0.85 + sh) / 2, 0, { e: EF })
  }
}
function tableN(g: THREE.Group, W: number) {
  mesh(B(W, 0.03, 0.45), M.top, g, 0, 0.695, 0, { e: EF })
  mesh(B(W - 0.1, 0.3, 0.02), M.top, g, 0, 0.52, 0.2, { e: EF })
  legs(g, W / 2 - 0.04, 0.19, 0.68, 0.016)
}

// W500 × D510 × H900
const stoolHigh: Builder = (g) => {
  mesh(Cy(0.25, 0.25, 0.05, 24), M.wood, g, 0, 0.65, 0, { e: EF })
  mesh(B(0.44, 0.14, 0.03), M.wood, g, 0, 0.83, -0.24, { e: EF })
  mesh(B(0.03, 0.2, 0.03), M.leg, g, -0.16, 0.72, -0.24, { e: null })
  mesh(B(0.03, 0.2, 0.03), M.leg, g, 0.16, 0.72, -0.24, { e: null })
  legs(g, 0.22, 0.22, 0.63, 0.012)
  const r = mesh(new THREE.TorusGeometry(0.23, 0.01, 6, 32), M.leg, g, 0, 0.28, 0, { e: null })
  r.rotation.x = Math.PI / 2
}
const redSofa: Builder = (g) => {
  const c = mesh(Cy(0.3, 0.3, 0.42, 32), FM.red, g, 0, 0.21, 0, { e: EF })
  c.scale.z = 0.77
  const bk = mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.36, 32, 1, true, Math.PI * 0.6, Math.PI * 0.8),
    FM.red,
    g,
    0,
    0.6,
    0,
    { e: null },
  )
  bk.scale.z = 0.77
}
const teaWhite: Builder = (g) => {
  mesh(Cy(0.25, 0.25, 0.03, 32), FM.white, g, 0, 0.585, 0, { e: EF })
  mesh(Cy(0.025, 0.025, 0.57, 12), M.leg, g, 0, 0.285, 0, { e: null })
  mesh(Cy(0.18, 0.18, 0.02, 24), M.leg, g, 0, 0.01, 0, { e: null })
}
const teaWood: Builder = (g) => {
  mesh(Cy(0.25, 0.25, 0.03, 32), M.wood, g, 0, 0.535, 0, { e: EF })
  legs(g, 0.13, 0.13, 0.52, 0.014, M.wood)
}
const liftLectern: Builder = (g) => {
  mesh(B(0.61, 0.9, 0.08), M.steel, g, 0, 0.47, -0.18, { e: EF })
  const t = mesh(B(0.61, 0.03, 0.45), M.top, g, 0, 0.98, 0, { e: EF })
  t.rotation.x = 0.15
  mesh(B(0.61, 0.03, 0.45), M.leg, g, 0, 0.03, 0, { e: EF })
}
const woodLectern: Builder = (g) => {
  mesh(B(0.8, 1, 0.6), M.wood, g, 0, 0.5, 0, { e: EF })
  const t = mesh(B(0.8, 0.04, 0.45), M.wood, g, 0, 1.025, 0.05, { e: EF })
  t.rotation.x = 0.12
  mesh(B(0.4, 0.4, 0.01), M.green, g, 0, 0.6, 0.305, { e: null })
}
const woodTeacher: Builder = (g) => {
  mesh(B(0.8, 0.04, 0.6), M.wood, g, 0, 1.03, 0, { e: EF })
  mesh(B(0.8, 1.01, 0.03), M.wood, g, 0, 0.505, 0.285, { e: EF })
  mesh(B(0.03, 1.01, 0.6), M.wood, g, -0.385, 0.505, 0, { e: EF })
  mesh(B(0.03, 1.01, 0.6), M.wood, g, 0.385, 0.505, 0, { e: EF })
}
const stanchion: Builder = (g) => {
  mesh(Cy(0.165, 0.165, 0.03, 24), M.leg, g, 0, 0.015, 0, { e: null })
  mesh(Cy(0.03, 0.03, 0.92, 16), M.leg, g, 0, 0.47, 0, { e: null })
  mesh(Cy(0.045, 0.045, 0.08, 16), FM.red, g, 0, 0.9, 0, { e: null })
  mesh(B(0.06, 0.05, 0.01), FM.red, g, 0.06, 0.9, 0, { e: null })
}
const sign: Builder = (g) => {
  for (const x of [-0.3, 0.3]) {
    const l = mesh(B(0.03, 1.6, 0.03), M.leg, g, x, 0.8, 0.05, { e: null })
    l.rotation.x = -0.06
  }
  const bl = mesh(B(0.03, 1.5, 0.03), M.leg, g, 0, 0.74, -0.25, { e: null })
  bl.rotation.x = 0.2
  mesh(B(0.63, 0.88, 0.02), M.top, g, 0, 1.08, 0.08, { e: EF })
  mesh(B(0.594, 0.841, 0.005), FM.orange, g, 0, 1.08, 0.093, { e: null })
}

export interface FurnitureDef {
  name: string
  size: string
  build: Builder
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
    arr: [0.6, 0.7],
    price: [350, 550],
  },
  studentChair: {
    name: '學生椅',
    size: 'W450×D420×H780',
    build: (g) => chair(g, 0.45, 0.42, 0.45, 0.78, M.navy),
    arr: [0.55, 0.9],
    price: [300, 500],
  },
  foldBlack: {
    name: '收納椅（黑）',
    size: 'W573×D552×H742',
    build: (g) => chair(g, 0.573, 0.552, 0.41, 0.742, FM.black, M.dark),
    arr: [0.65, 0.95],
    price: [300, 800],
  },
  foldBeige: {
    name: '收納椅（米）',
    size: 'W400×D410×H750',
    build: (g) => chair(g, 0.4, 0.41, 0.42, 0.75, FM.beige),
    arr: [0.5, 0.9],
    price: [200, 700],
  },
  foldTable: {
    name: '收納桌',
    size: 'W800×D800×H750',
    build: (g) => {
      mesh(B(0.8, 0.03, 0.8), M.top, g, 0, 0.735, 0, { e: EF })
      legs(g, 0.37, 0.37, 0.72, 0.016)
    },
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
    build: (g) => sofaBox(g, 0.8, 0.76, 0.66, FM.fabric),
    arr: [1, 1.2],
    price: [590, 1090],
  },
  shapeO: {
    name: '造型沙發（橘）',
    size: 'W660×D580×H710',
    build: (g) => sofaBox(g, 0.66, 0.58, 0.71, FM.orange, false),
    arr: [0.8, 1],
    price: [600, 1100],
  },
  shapeG: {
    name: '造型沙發（綠）',
    size: 'W660×D580×H710',
    build: (g) => sofaBox(g, 0.66, 0.58, 0.71, FM.lime, false),
    arr: [0.8, 1],
    price: [600, 1100],
  },
  whiteSofa: {
    name: '白面沙發',
    size: 'W710×D750×H760',
    build: (g) => sofaBox(g, 0.71, 0.75, 0.76, FM.white),
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

export function buildFurniture(type: FurnitureType) {
  const g = new THREE.Group()
  g.name = type
  g.userData.type = type
  FURNITURE[type].build(g)
  return g
}

/** Render a small isometric preview of every furniture type as a data URL. */
export function renderThumbnails(): Partial<Record<FurnitureType, string>> {
  const out: Partial<Record<FurnitureType, string>> = {}
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
  for (const type of FURNITURE_TYPES) {
    const o = buildFurniture(type)
    ts.add(o)
    const bb = new THREE.Box3().setFromObject(o)
    const c = bb.getCenter(new THREE.Vector3())
    const r = bb.getSize(new THREE.Vector3()).length() / 2
    tc.position
      .copy(c)
      .add(dir.clone().multiplyScalar((r / Math.sin(THREE.MathUtils.degToRad(14))) * 0.9))
    tc.lookAt(c)
    tr.render(ts, tc)
    out[type] = tr.domElement.toDataURL()
    ts.remove(o)
  }
  tr.dispose()
  tr.forceContextLoss()
  return out
}
