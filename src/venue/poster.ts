import * as THREE from 'three'
import { EF, FM, mesh } from './materials'

/** Default size: A1 portrait, in metres */
export const POSTER_W = 0.594
export const POSTER_H = 0.841
export const POSTER_MIN = 0.1
export const POSTER_MAX = 6
/** Paper sizes offered as presets in the selection panel (portrait, metres) */
export const POSTER_PRESETS = [
  { name: 'A2', w: 0.42, h: 0.594 },
  { name: 'A1', w: 0.594, h: 0.841 },
  { name: 'A0', w: 0.841, h: 1.189 },
] as const

const THICK = 0.006
/** Longest edge an uploaded image is scaled down to before it is stored */
const IMAGE_MAX_PX = 1600

export const clampPosterSize = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(POSTER_MAX, Math.max(POSTER_MIN, n))
    : fallback

export const isImageDataUrl = (s: unknown): s is string =>
  typeof s === 'string' && s.startsWith('data:image/')

const blankFace = new THREE.MeshStandardMaterial({
  color: '#f6e7b8',
  roughness: 0.8,
  name: 'poster_blank',
})
/** Upload choice: reshape the poster to the image's proportions, or keep the poster's and crop */
export type PosterFit = 'image' | 'poster'

interface Loaded {
  tex: THREE.Texture
  /** width / height once decoded */
  aspect?: number
  /** per-poster callbacks waiting for the decode */
  waiting: (() => void)[]
}
const loaded = new Map<string, Loaded>()

function source(img: string) {
  let e = loaded.get(img)
  if (!e) {
    const entry: Loaded = { tex: new THREE.Texture(), waiting: [] }
    entry.tex = new THREE.TextureLoader().load(img, (t) => {
      const { width, height } = t.image as { width: number; height: number }
      entry.aspect = width / height
      entry.waiting.splice(0).forEach((f) => f())
    })
    entry.tex.colorSpace = THREE.SRGBColorSpace
    entry.tex.anisotropy = 4
    e = entry
    loaded.set(img, e)
  }
  return e
}

/** Crop the texture to fill a w × h poster without stretching (centred, like CSS `cover`). */
function cover(tex: THREE.Texture, imgAspect: number, w: number, h: number) {
  const pa = w / h
  if (imgAspect > pa) tex.repeat.set(pa / imgAspect, 1)
  else tex.repeat.set(1, imgAspect / pa)
  tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2)
}

/** Point a poster's face at `img`, cropped to its current size. Each poster owns its material. */
function dressFace(face: THREE.Mesh, img: string | undefined, w: number, h: number) {
  const old = face.material as THREE.MeshStandardMaterial
  if (!img) {
    if (old !== blankFace) disposeFace(old)
    face.material = blankFace
    face.userData.img = undefined
    return
  }
  let m = old
  if (face.userData.img !== img || old === blankFace) {
    if (old !== blankFace) disposeFace(old)
    // a clone shares the decoded image but has its own crop (repeat / offset)
    m = new THREE.MeshStandardMaterial({ map: source(img).tex.clone(), roughness: 0.7 })
    face.material = m
    face.userData.img = img
  }
  const src = source(img)
  const tex = m.map
  if (!tex) return
  const fit = () => {
    cover(tex, src.aspect ?? w / h, w, h)
    tex.needsUpdate = true
  }
  if (src.aspect) fit()
  else src.waiting.push(fit)
}

function disposeFace(m: THREE.MeshStandardMaterial) {
  m.map?.dispose()
  m.dispose()
}

/**
 * A poster hangs from its group origin: the centre of its back face, which sits on the
 * wall. Local +z points out of the wall. Size lives in the children's scale so resizing
 * never rebuilds geometry.
 */
export function buildPoster(g: THREE.Group) {
  const panel = mesh(new THREE.BoxGeometry(1, 1, THICK), FM.white, g, 0, 0, THICK / 2, { e: EF })
  panel.name = 'panel'
  const face = mesh(new THREE.PlaneGeometry(1, 1), blankFace, g, 0, 0, THICK + 0.0005, {
    e: null,
  })
  face.name = 'face'
  applyPoster(g, { w: POSTER_W, h: POSTER_H })
}

export function applyPoster(
  g: THREE.Object3D,
  { w, h, img }: { w: number; h: number; img?: string },
) {
  g.userData.w = w
  g.userData.h = h
  if (img) g.userData.img = img
  else delete g.userData.img
  for (const name of ['panel', 'face']) g.getObjectByName(name)?.scale.set(w, h, 1)
  const face = g.getObjectByName('face') as THREE.Mesh | undefined
  if (face) dressFace(face, img, w, h)
}

/** Read an image file, scale it down and re-encode it so layouts stay small enough to save. */
export async function readPosterImage(file: File): Promise<{ url: string; aspect: number }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, IMAGE_MAX_PX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  // JPEG has no alpha: paint transparent areas white like paper
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return { url: c.toDataURL('image/jpeg', 0.85), aspect: c.width / c.height }
}
