import * as THREE from 'three'
import type { VariantAxis } from './furniture'
import { B, Cy, mat, mesh } from './materials'

/*
 * 可移動電視: a flat-screen TV on a floor stand: one column rising from a round base, the
 * screen on a bracket at its top. The column telescopes, an inner tube sliding up out of the
 * outer one, so raising or lowering the screen (its centre's height is the item's `lift`)
 * never leaves any column showing above it. The screen faces +z; the origin is the middle of
 * the base on the floor. Its variant id is `<size>-<orientation>-<colour>`: the whole TV, screen
 * frame and stand alike, white or black.
 */

/** Screen sizes in inches (the diagonal of a 16:9 panel) */
const INCHES: Record<string, number> = { s55: 55, s65: 65, s75: 75, s86: 86 }

export const TV_AXES: readonly VariantAxis[] = [
  {
    label: 'size',
    options: [
      { id: 's55', swatch: '' },
      { id: 's65', swatch: '' },
      { id: 's75', swatch: '' },
      { id: 's86', swatch: '' },
    ],
  },
  {
    label: 'orientation',
    options: [
      { id: 'land', swatch: '' },
      { id: 'port', swatch: '' },
    ],
  },
  {
    label: 'colour',
    options: [
      { id: 'white', swatch: '#f3f2ee' },
      { id: 'black', swatch: '#141518' },
    ],
  },
]

/** The screen's centre above the floor, metres: its default and how far the bracket goes */
export const TV_LIFT = 1.4
export const TV_LIFT_MIN = 1.1
export const TV_LIFT_MAX = 1.9

export const clampLift = (m: unknown) =>
  typeof m === 'number' && Number.isFinite(m)
    ? Math.round(Math.min(TV_LIFT_MAX, Math.max(TV_LIFT_MIN, m)) * 100) / 100
    : TV_LIFT

/** The panel's size, metres: width and height as it stands (turned, for portrait) */
function panelOf(v?: string) {
  const [s, o, c] = (v ?? '').split('-')
  const inch = INCHES[s ?? ''] ?? 55
  // a 16:9 panel's sides from its diagonal, plus a thin bezel all round
  const long = inch * 0.0254 * (16 / Math.hypot(16, 9)) + 0.02
  const short = inch * 0.0254 * (9 / Math.hypot(16, 9)) + 0.02
  return {
    inch,
    w: o === 'port' ? short : long,
    h: o === 'port' ? long : short,
    paint: c === 'black' ? BLACK : WHITE,
  }
}

/** The base's thickness, and the outer tube's top: the inner tube slides up out of it */
const BASE_H = 0.03
const SLEEVE_TOP = 0.95
/** How far the inner tube stays inside the outer one at its highest */
const OVERLAP = 0.12

/** Raise a built TV's screen so its centre stands `m` metres above the floor */
export function setTvLift(g: THREE.Object3D, m: number) {
  const bracket = g.getObjectByName('tv_lift')
  const inner = g.getObjectByName('tv_inner')
  if (!bracket || !inner) return
  g.userData.lift = m
  bracket.position.y = m
  // the inner tube runs from inside the outer one up to the bracket, and no further
  const from = SLEEVE_TOP - OVERLAP
  inner.scale.y = m - from
  inner.position.y = (m + from) / 2
}

/** Drawn once, on first use (canvases only exist in the browser): a dark slide-like screen */
let screenTex: THREE.Texture | null = null
function screen() {
  if (screenTex) return screenTex
  const c = document.createElement('canvas')
  c.width = 320
  c.height = 180
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 320, 180)
  g.addColorStop(0, '#1b2433')
  g.addColorStop(1, '#2d3d57')
  x.fillStyle = g
  x.fillRect(0, 0, 320, 180)
  x.fillStyle = 'rgba(255, 255, 255, 0.18)'
  x.fillRect(40, 60, 180, 14)
  x.fillRect(40, 86, 120, 10)
  screenTex = new THREE.CanvasTexture(c)
  screenTex.colorSpace = THREE.SRGBColorSpace
  return screenTex
}

/**
 * Powder coat in each colour: the frame, base and outer tube matt, the sliding inner tube a
 * shade glossier so it reads apart from the tube it comes out of
 */
const WHITE = {
  body: mat('#f3f2ee', { roughness: 0.45, name: 'tv_body' }),
  tube: mat('#e9e8e3', { roughness: 0.3, name: 'tv_tube' }),
}
const BLACK = {
  body: mat('#18191c', { roughness: 0.45, name: 'tv_body' }),
  tube: mat('#2a2b2f', { roughness: 0.3, name: 'tv_tube' }),
}

export function buildTvCart(g: THREE.Group, v?: string) {
  const { inch, w, h, paint } = panelOf(v)
  const { body, tube } = paint
  // bigger screens stand on a wider base
  const r = inch >= 75 ? 0.35 : 0.3

  // the round base, its edge eased down to the floor, and a collar where the column stands
  mesh(Cy(r - 0.012, r, BASE_H, 64), body, g, 0, BASE_H / 2, 0, { e: null })
  mesh(Cy(0.06, 0.075, 0.035, 32), body, g, 0, BASE_H + 0.0175, 0, { e: null })
  // the outer tube, fixed; the inner one slides out of it (scaled to length in setTvLift)
  mesh(Cy(0.04, 0.04, SLEEVE_TOP - BASE_H, 32), body, g, 0, (SLEEVE_TOP + BASE_H) / 2, 0, {
    e: null,
  })
  const inner = mesh(Cy(0.032, 0.032, 1, 32), tube, g, 0, 0, 0, { e: null })
  inner.name = 'tv_inner'

  // the bracket tops the inner tube and holds the screen just in front of the column
  const bracket = new THREE.Group()
  bracket.name = 'tv_lift'
  g.add(bracket)
  mesh(B(0.3, 0.3, 0.03), body, bracket, 0, 0, 0.05, { e: null })
  const screenAt = 0.09
  // the screen's frame and back
  mesh(B(w, h, 0.05), body, bracket, 0, 0, screenAt, { e: null })
  const sw = w - 0.02
  const sh = h - 0.02
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshStandardMaterial({
      map: screen(),
      emissive: '#ffffff',
      emissiveMap: screen(),
      emissiveIntensity: 0.45,
      roughness: 0.2,
      name: 'display',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  face.position.set(0, 0, screenAt + 0.0255)
  // the screen can show an uploaded image (see setFaceImage), lit and cropped to fill it
  face.name = 'face'
  Object.assign(face.userData, { w: sw, h: sh, glow: true, layer: 1, blank: face.material })
  face.receiveShadow = true
  bracket.add(face)
  setTvLift(g, TV_LIFT)
  delete g.userData.lift
}
