import * as THREE from 'three'
import type { VariantAxis } from './furniture'
import { mat, mesh } from './materials'

/*
 * 筆記型電腦: an open aluminium laptop (sized like Apple's M-series MacBooks), set on a table
 * facing +z, the way its user sits. The lid opens anywhere from shut to leaning well back while
 * the base stays put; the origin is the centre of the base's underside. Its variant id is
 * `<size>-<colour>`.
 */

interface Size {
  /** Closed size, metres: width, depth, height */
  w: number
  d: number
  h: number
  /** Speaker grilles either side of the keyboard (the thicker, Pro-style bodies) */
  grille: boolean
}

/** Apple's published sizes: 13" and 15" Air, 14" and 16" Pro */
const SIZES: Record<string, Size> = {
  s13: { w: 0.3041, d: 0.215, h: 0.0113, grille: false },
  s14: { w: 0.3126, d: 0.2212, h: 0.0155, grille: true },
  s15: { w: 0.3404, d: 0.2376, h: 0.0115, grille: false },
  s16: { w: 0.3557, d: 0.2481, h: 0.0168, grille: true },
}

export const LAPTOP_AXES: readonly VariantAxis[] = [
  {
    label: 'size',
    options: [
      { id: 's13', swatch: '' },
      { id: 's14', swatch: '' },
      { id: 's15', swatch: '' },
      { id: 's16', swatch: '' },
    ],
  },
  {
    label: 'colour',
    options: [
      { id: 'silver', swatch: '#e3e4e6' },
      { id: 'gray', swatch: '#7d7f83' },
      { id: 'black', swatch: '#2c2c2e' },
      { id: 'midnight', swatch: '#2e3642' },
      { id: 'starlight', swatch: '#e6dccb' },
      { id: 'sky', swatch: '#c5d5e2' },
    ],
  },
]

/** The lid's opening, degrees between it and the keyboard: its default and how far it goes */
export const LID_OPEN = 110
export const LID_MAX = 135
const LID = 0.0045

export const clampLid = (deg: unknown) =>
  typeof deg === 'number' && Number.isFinite(deg)
    ? Math.round(Math.min(LID_MAX, Math.max(0, deg)))
    : LID_OPEN

/** How far a lid opened `deg` reaches out behind the base, for a base `d` deep */
const leanBack = (d: number, deg: number) =>
  d * Math.max(0, -Math.cos(THREE.MathUtils.degToRad(deg)))

function parse(v?: string) {
  const [s, c] = (v ?? '').split('-')
  const colour = LAPTOP_AXES[1]!.options.find((o) => o.id === c) ?? LAPTOP_AXES[1]!.options[0]!
  return { size: SIZES[s ?? ''] ?? SIZES.s13!, colour: colour.swatch }
}

/**
 * Footprint on a table, metres: length along local x, width along z, and how far its centre
 * sits along z from the origin (a lid leaning out behind the base pulls it back)
 */
export function laptopFootprint(v?: string, open = LID_OPEN): [number, number, number] {
  const { size } = parse(v)
  const back = leanBack(size.d, open)
  return [size.w, size.d + back, -back / 2]
}

/** Open a built laptop's lid to `deg` (0 shut, 90 upright); the base doesn't move */
export function setLaptopOpen(g: THREE.Object3D, deg: number) {
  const hinge = g.getObjectByName('laptop_lid')
  if (!hinge) return
  g.userData.open = deg
  hinge.rotation.x = THREE.MathUtils.degToRad(90 - deg)
}

/**
 * A rounded rectangle w × d, `h` tall from y = 0, with its edges finely chamfered (the cut
 * edges catch the light like a machined aluminium body)
 */
function slab(w: number, d: number, h: number, r: number) {
  const b = Math.min(0.0012, h / 4)
  const [x, z] = [w / 2 - b, d / 2 - b]
  const s = new THREE.Shape()
  s.moveTo(-x + r, -z)
  s.lineTo(x - r, -z)
  s.quadraticCurveTo(x, -z, x, -z + r)
  s.lineTo(x, z - r)
  s.quadraticCurveTo(x, z, x - r, z)
  s.lineTo(-x + r, z)
  s.quadraticCurveTo(-x, z, -x, z - r)
  s.lineTo(-x, -z + r)
  s.quadraticCurveTo(-x, -z, -x + r, -z)
  return new THREE.ExtrudeGeometry(s, {
    depth: h - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 6,
  })
    .rotateX(Math.PI / 2)
    .translate(0, h - b, 0)
}

/** Drawn once, on first use (canvases only exist in the browser) */
let tex: { keys: THREE.Texture; screen: THREE.Texture; env: THREE.CubeTexture } | null = null
function textures() {
  if (tex) return tex
  const canvas = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    paint(c.getContext('2d')!)
    return c
  }
  const draw = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const t = new THREE.CanvasTexture(canvas(w, h, paint))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  // six rows of keys (relative widths), the function row half height, a wide space bar
  const keys = draw(512, 200, (c) => {
    c.fillStyle = '#15161a'
    c.fillRect(0, 0, 512, 200)
    c.fillStyle = '#2a2c31'
    const one = (n: number) => Array<number>(n).fill(1)
    const rows = [
      one(14),
      [...one(13), 1.5],
      [1.5, ...one(13)],
      [1.8, ...one(11), 1.8],
      [2.3, ...one(10), 2.3],
      [...one(4), 5.4, 1, 1, 1],
    ]
    const gap = 4
    let y = gap
    rows.forEach((row, r) => {
      const kh = r === 0 ? 16 : 30
      const unit = (512 - gap * (row.length + 1)) / row.reduce((a, b) => a + b, 0)
      let x = gap
      for (const k of row) {
        c.fillRect(x, y, k * unit, kh)
        x += k * unit + gap
      }
      y += kh + gap
    })
  })
  // a soft macOS-like wallpaper with the menu bar across the top
  const screen = draw(320, 208, (c) => {
    const g = c.createLinearGradient(0, 0, 320, 208)
    g.addColorStop(0, '#1d3b8a')
    g.addColorStop(0.5, '#6c4bc4')
    g.addColorStop(1, '#e58b6a')
    c.fillStyle = g
    c.fillRect(0, 0, 320, 208)
    c.fillStyle = 'rgba(20, 20, 30, 0.55)'
    c.fillRect(0, 0, 320, 9)
    c.fillStyle = 'rgba(255, 255, 255, 0.35)'
    c.fillRect(110, 190, 100, 12)
  })
  /*
   * The scene has no environment for metal to reflect, so the aluminium carries its own: a
   * bright room (light ceiling, pale walls with window strips, a darker floor). Without one a
   * metallic surface only shows the lights' highlights and renders flat grey.
   */
  const N = 64
  const side = canvas(N, N, (c) => {
    const g = c.createLinearGradient(0, 0, 0, N)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.48, '#c9cbcf')
    g.addColorStop(0.52, '#8d8a84')
    g.addColorStop(1, '#55524c')
    c.fillStyle = g
    c.fillRect(0, 0, N, N)
    c.fillStyle = 'rgba(255, 255, 255, 0.85)'
    c.fillRect(N * 0.2, N * 0.08, N * 0.14, N * 0.36)
    c.fillRect(N * 0.62, N * 0.08, N * 0.14, N * 0.36)
  })
  const ceiling = canvas(N, N, (c) => {
    c.fillStyle = '#eceef0'
    c.fillRect(0, 0, N, N)
    c.fillStyle = '#ffffff'
    c.fillRect(N * 0.25, N * 0.25, N * 0.5, N * 0.5)
  })
  const floor = canvas(N, N, (c) => {
    c.fillStyle = '#4d4a45'
    c.fillRect(0, 0, N, N)
  })
  const env = new THREE.CubeTexture([side, side, ceiling, floor, side, side])
  env.colorSpace = THREE.SRGBColorSpace
  env.needsUpdate = true
  return (tex = { keys, screen, env })
}

/**
 * The keys, trackpad, grilles, bezel and screen are flat layers a fraction of a millimetre
 * above the surface under them. From across the hall that gap is below the depth buffer's
 * precision and they flicker (z-fight), so like a poster's face each is also biased toward
 * the camera in depth terms: `layer` 1 sits on the body, 2 on top of a layer 1.
 */
const layer = (n: number) => ({
  polygonOffset: true,
  polygonOffsetFactor: -n,
  polygonOffsetUnits: -n,
})

const dark = mat('#101114', { roughness: 0.4, name: 'bezel', ...layer(1) })
/** Anodised / bead-blasted aluminium in each colour */
const metals = new Map<string, THREE.Material>()
function metal(colour: string, roughness: number) {
  const key = `${colour}/${roughness}`
  let m = metals.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: colour,
      metalness: 1,
      roughness,
      envMap: textures().env,
      name: 'aluminium',
    })
    metals.set(key, m)
  }
  return m
}

/** A flat rounded rectangle w × d lying face up */
function roundRect(w: number, d: number, r: number) {
  const [x, z] = [w / 2, d / 2]
  const s = new THREE.Shape()
  s.moveTo(-x + r, -z)
  s.lineTo(x - r, -z)
  s.quadraticCurveTo(x, -z, x, -z + r)
  s.lineTo(x, z - r)
  s.quadraticCurveTo(x, z, x - r, z)
  s.lineTo(-x + r, z)
  s.quadraticCurveTo(-x, z, -x, z - r)
  s.lineTo(-x, -z + r)
  s.quadraticCurveTo(-x, -z, -x + r, -z)
  return new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2)
}

/**
 * The trackpad: glass tinted to the body, a shade darker and glossier than the blasted
 * aluminium so it reads against the deck, set in a thin dark seam
 */
const pads = new Map<string, { glass: THREE.Material; seam: THREE.Material }>()
function padMats(colour: string) {
  let p = pads.get(colour)
  if (!p) {
    const c = new THREE.Color(colour)
    p = {
      glass: new THREE.MeshStandardMaterial({
        color: c.clone().multiplyScalar(0.86),
        metalness: 0.55,
        roughness: 0.12,
        envMap: textures().env,
        name: 'trackpad',
        ...layer(2),
      }),
      seam: mat(c.clone().multiplyScalar(0.45), {
        roughness: 0.6,
        name: 'trackpad_seam',
        ...layer(1),
      }),
    }
    pads.set(colour, p)
  }
  return p
}

export function buildLaptop(g: THREE.Group, v?: string) {
  const { size: m, colour } = parse(v)
  const body = metal(colour, 0.34)
  const t = textures()
  const root = new THREE.Group()
  g.add(root)

  const base = m.h - LID
  mesh(slab(m.w, m.d, base, 0.012), body, root, 0, 0, 0, { e: null })
  // keyboard well and trackpad on the deck
  const kw = m.w * (m.grille ? 0.74 : 0.86)
  const kd = m.d * 0.42
  const keys = new THREE.Mesh(
    new THREE.PlaneGeometry(kw, kd).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: t.keys,
      roughness: 0.6,
      name: 'keyboard',
      ...layer(1),
    }),
  )
  keys.position.set(0, base + 0.0004, -m.d / 2 + 0.018 + kd / 2)
  root.add(keys)
  const [pw, pd] = [m.w * 0.4, m.d * 0.36]
  const pm = padMats(colour)
  const seam = new THREE.Mesh(roundRect(pw + 0.0024, pd + 0.0024, 0.0072), pm.seam)
  seam.position.set(0, base + 0.0002, m.d / 2 - 0.012 - pd / 2)
  root.add(seam)
  const pad = new THREE.Mesh(roundRect(pw, pd, 0.006), pm.glass)
  pad.position.set(0, base + 0.0004, seam.position.z)
  root.add(pad)
  if (m.grille) {
    // speaker grilles either side of the keys
    for (const sx of [-1, 1]) {
      const grille = new THREE.Mesh(
        new THREE.PlaneGeometry((m.w - kw) / 2 - 0.014, kd).rotateX(-Math.PI / 2),
        mat('#1b1c20', { roughness: 0.9, name: 'grille', ...layer(1) }),
      )
      grille.position.set((sx * (m.w / 2 + kw / 2)) / 2, base + 0.0003, keys.position.z)
      root.add(grille)
    }
  }

  // the lid, hinged along the base's top back edge; upright, its back is behind the hinge
  // and the screen faces +z, so shut it lies on the deck with the screen face down
  const hinge = new THREE.Group()
  hinge.name = 'laptop_lid'
  hinge.position.set(0, base, -m.d / 2)
  root.add(hinge)
  const lid = mesh(slab(m.w, m.d, LID, 0.012), body, hinge, 0, 0, 0, { e: null })
  // stand the slab up: its front edge becomes the top of the lid
  lid.rotation.x = Math.PI / 2
  lid.position.set(0, m.d / 2, -LID)
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(m.w - 0.006, m.d - 0.006), dark)
  bezel.position.set(0, m.d / 2, 0.0003)
  hinge.add(bezel)
  const sw = m.w - 0.022
  const sh = m.d - 0.03
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshStandardMaterial({
      map: t.screen,
      emissive: '#ffffff',
      emissiveMap: t.screen,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      name: 'display',
      ...layer(2),
    }),
  )
  screen.position.set(0, m.d / 2 + 0.004, 0.0006)
  // the screen can show an uploaded image (see setFaceImage), lit and cropped to fill it
  screen.name = 'face'
  Object.assign(screen.userData, { w: sw, h: sh, glow: true, layer: 2, blank: screen.material })
  hinge.add(screen)
  for (const o of [keys, seam, pad, bezel, screen]) o.receiveShadow = true
  setLaptopOpen(g, LID_OPEN)
  delete g.userData.open
}
