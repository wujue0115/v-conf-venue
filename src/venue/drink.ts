import * as THREE from 'three'
import type { Footprint, VariantAxis } from './furniture'
import { mat, mesh } from './materials'

/*
 * 飲料桶: the bakery's stainless insulated tea barrel (不鏽鋼保溫茶桶) for its tea-party coffee,
 * tea and juice. A matte steel drum on a black base with short feet, a black shoulder and domed
 * lid under an arched carry handle, and a black tap at the front (+z) near its foot. It stands
 * on a table; its origin is its underside centre. Its variant is the size: 大桶 (10 litres, about
 * 25 cm across and 38 cm to the lid, as sellers list it) or 中桶 (8 litres, 24 × 33 cm).
 */

export const DRINK_AXES: readonly VariantAxis[] = [
  {
    label: 'size',
    options: [
      { id: 'large', swatch: '' },
      { id: 'medium', swatch: '' },
    ],
  },
]

/** Each size: the drum's radius and its height to the top of the lid, metres */
const SIZES: Record<string, { r: number; h: number }> = {
  large: { r: 0.125, h: 0.38 },
  medium: { r: 0.12, h: 0.33 },
}
const sizeOf = (v?: string) => SIZES[v ?? ''] ?? SIZES.large!

/** The feet and the black base above them, the black shoulder, and the lid's dome */
const FEET = 0.015
const BASE = 0.03
const SHOULDER = 0.035
const DOME = 0.04
/** How far the tap stands out in front */
const TAP_OUT = 0.06

const black = mat('#1d1e21', { roughness: 0.45, name: 'drink_black' })
/**
 * Brushed (霧面) stainless steel, with a soft shine. The scene has nothing for a metal to
 * reflect, so it reflects a small studio of its own (studio()): a bright ceiling, light walls
 * with softbox bands and a darker floor. Fine vertical brush streaks and broad bands of shade
 * round the drum are painted over it.
 */
let brushed: THREE.Material | null = null
function steel() {
  if (brushed) return brushed
  const canvas = typeof document !== 'undefined'
  brushed = new THREE.MeshStandardMaterial({
    color: canvas ? '#ffffff' : '#cfd2d6',
    map: canvas ? brushedTexture() : null,
    envMap: canvas ? studio() : null,
    metalness: 0.9,
    roughness: 0.2,
    name: 'drink_steel',
  })
  return brushed
}

/** A seeded pseudo-random sequence, so the streaks come out the same every time */
function seeded(n: number) {
  let s = n
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function brushedTexture() {
  const W = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = 4
  const ctx = c.getContext('2d')!
  const rand = seeded(3)
  for (let x = 0; x < W; x++) {
    // broad bands of shade round the drum, and the brush's fine streaks
    const a = (x / W) * Math.PI * 2
    const band = 0.9 + 0.05 * Math.cos(a * 2) + 0.03 * Math.cos(a * 5 + 1)
    const v = Math.round(255 * Math.min(1, band + (rand() - 0.5) * 0.06))
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`
    ctx.fillRect(x, 0, 1, 4)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** The studio the steel reflects, as a cube of painted faces (+x, -x, +y, -y, +z, -z) */
function studio() {
  const S = 64
  const face = (paint: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = c.height = S
    paint(c.getContext('2d')!)
    return c
  }
  // a wall: lighter up top, with two bright softbox bands across it
  const wall = (ctx: CanvasRenderingContext2D) => {
    const g = ctx.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#e9ebee')
    g.addColorStop(0.55, '#8d9198')
    g.addColorStop(1, '#3f4349')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, S * 0.18, S, S * 0.1)
    ctx.fillRect(0, S * 0.4, S, S * 0.05)
    // and an upright one, for a highlight down the drum
    ctx.fillRect(S * 0.42, 0, S * 0.1, S * 0.7)
  }
  const flat = (color: string) => (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, S, S)
  }
  const t = new THREE.CubeTexture([
    face(wall),
    face(wall),
    face(flat('#ffffff')),
    face(flat('#55595f')),
    face(wall),
    face(wall),
  ])
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

/** Where it stands on a table: the drum and its tap, the tap's side further out */
export function drinkFootprint(v?: string): Footprint {
  const { r } = sizeOf(v)
  return [2 * r + 0.01, 2 * r + TAP_OUT, TAP_OUT / 2]
}

export function buildDrinkBarrel(g: THREE.Group, v?: string) {
  const { r, h } = sizeOf(v)
  const top = h - SHOULDER - DOME
  // four short feet under a black base ring
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    mesh(
      new THREE.CylinderGeometry(0.012, 0.014, FEET, 12),
      black,
      g,
      Math.cos(a) * r * 0.75,
      FEET / 2,
      Math.sin(a) * r * 0.75,
      { e: null },
    )
  }
  mesh(new THREE.CylinderGeometry(r + 0.004, r, BASE, 40), black, g, 0, FEET + BASE / 2, 0, {
    e: null,
  })
  // the steel drum
  const body = top - FEET - BASE
  mesh(new THREE.CylinderGeometry(r, r, body, 40), steel(), g, 0, FEET + BASE + body / 2, 0, {
    e: null,
  })
  // the black shoulder, rounding in to the domed lid and its knob
  mesh(
    new THREE.CylinderGeometry(r * 0.94, r + 0.004, SHOULDER, 40),
    black,
    g,
    0,
    top + SHOULDER / 2,
    0,
    {
      e: null,
    },
  )
  const dome = mesh(
    new THREE.SphereGeometry(r * 0.94, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    black,
    g,
    0,
    top + SHOULDER,
    0,
    { e: null },
  )
  dome.scale.y = DOME / (r * 0.94)
  mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.014, 20), black, g, 0, h + 0.004, 0, { e: null })
  // the carry handle: an arch over the lid from one side of the shoulder to the other
  const handle = mesh(
    new THREE.TorusGeometry(r * 0.98, 0.007, 8, 32, Math.PI),
    black,
    g,
    0,
    top + SHOULDER * 0.6,
    0,
    { e: null },
  )
  handle.scale.y = 0.85
  // the tap: a block on the drum, a lever on top and the spout pointing down
  const z = r + TAP_OUT * 0.4
  mesh(
    new THREE.BoxGeometry(0.03, 0.045, TAP_OUT * 0.8),
    black,
    g,
    0,
    FEET + BASE + 0.05,
    z - 0.008,
    {
      e: null,
    },
  )
  mesh(new THREE.BoxGeometry(0.014, 0.035, 0.014), black, g, 0, FEET + BASE + 0.085, z, { e: null })
  mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.035, 12),
    black,
    g,
    0,
    FEET + BASE + 0.012,
    z + 0.006,
    {
      e: null,
    },
  )
}
