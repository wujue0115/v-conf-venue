import * as THREE from 'three'
import { B, Cy, mat, mesh, noRay } from './materials'

/*
 * 動線 (paths) on the floor: 動線點 (path points), each linking to others. A link is kept on the
 * point it was drawn from (`links`, the other points' ids), so drawing or removing one changes a
 * single item, and it runs from that point to the other: arrows point along it that way. Points
 * linked together, directly or through others, make one path. 人員 standing on a link walk
 * along it on their own when it is set to (kept with the link, in its point's `auto`: the ids
 * of the points it links to that way; its arrows creep along), or are dragged along it by hand.
 * A path has one colour (`color`), which every point of it keeps the same.
 */

export const PATH_COLOR = '#2a9d8f'

const paints = new Map<string, THREE.Material>()
/** The solid paint of a path's points and links in `color` */
export function pathMat(color: string) {
  let m = paints.get(color)
  if (!m) paints.set(color, (m = mat(color, { roughness: 0.6, name: 'path' })))
  return m
}
const hub = mat('#ffffff', { roughness: 0.6, name: 'path_hub' })

const ghosts = new Map<string, THREE.Material>()
/** See-through paint, for the point and link about to be drawn */
function ghostMat(color: string) {
  let m = ghosts.get(color)
  if (!m)
    ghosts.set(
      color,
      (m = mat(color, { transparent: true, opacity: 0.45, depthWrite: false, name: 'path_ghost' })),
    )
  return m
}
const ghostHub = mat('#ffffff', { transparent: true, opacity: 0.45, depthWrite: false })

/** A 動線點: a disc on the floor with a white middle; the origin is its middle on the floor */
export function buildPathNode(g: THREE.Group) {
  mesh(Cy(0.14, 0.14, 0.012, 32), pathMat(PATH_COLOR), g, 0, 0.006, 0, { e: null })
  mesh(Cy(0.055, 0.055, 0.014, 24), hub, g, 0, 0.007, 0, { e: null, cast: false })
}

/** A path point's colour */
export const pathColorOf = (g: THREE.Object3D) =>
  (g.userData.color as string | undefined) ?? PATH_COLOR

/** Paint a path point `color` (the default is kept as no colour) */
export function setPathNodeColor(g: THREE.Object3D, color: string) {
  ;(g.children[0] as THREE.Mesh).material = pathMat(color)
  if (color === PATH_COLOR) delete g.userData.color
  else g.userData.color = color
}

/** A see-through 動線點, under the pointer while drawing */
export function ghostNode() {
  const g = new THREE.Group()
  for (const m of [
    mesh(Cy(0.14, 0.14, 0.012, 32), ghostMat(PATH_COLOR), g, 0, 0.006, 0, { e: null }),
    mesh(Cy(0.055, 0.055, 0.014, 24), ghostHub, g, 0, 0.007, 0, { e: null }),
  ]) {
    m.castShadow = false
    m.raycast = noRay
  }
  return g
}

export const paintGhostNode = (g: THREE.Object3D, color: string) =>
  void ((g.children[0] as THREE.Mesh).material = ghostMat(color))

/** How wide a link's strip is, how far above the floor it runs (under the points' discs) */
const LINK_W = 0.07
const LINK_Y = 0.004
/**
 * Arrows along a link, like the markings on a conveyor belt: one every this many metres,
 * creeping this fast (m/s)
 */
const ARROW_STEP = 0.12
const ARROW_SPEED = 0.25
const X_AXIS = new THREE.Vector3(1, 0, 0)

let arrows: { creeping: THREE.MeshBasicMaterial; still: THREE.MeshBasicMaterial } | null = null
/**
 * Bold white chevrons pointing along +u, repeating: shallow and running the strip's whole
 * width, as on a conveyor belt (the canvas is ARROW_STEP long by the strip's width, near enough
 * the same pixels per metre both ways). Made the first time a link is drawn, twice over: ones
 * that creep along (a path whose 人員 walk on their own), and ones that keep still.
 */
function arrowMat(creeping: boolean) {
  if (!arrows) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')!
    g.strokeStyle = '#ffffff'
    g.lineWidth = 26
    g.lineJoin = 'miter'
    g.beginPath()
    g.moveTo(38, -8)
    g.lineTo(70, 32)
    g.lineTo(38, 72)
    g.stroke()
    const paint = () => {
      const tex = new THREE.CanvasTexture(c)
      tex.wrapS = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      return new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    }
    arrows = { creeping: paint(), still: paint() }
  }
  return creeping ? arrows.creeping : arrows.still
}

/** Creep the arrows of every link whose 人員 walk on their own on along it */
export function stepArrows(dt: number) {
  const map = arrows?.creeping.map
  if (map) map.offset.x = (map.offset.x - (dt * ARROW_SPEED) / ARROW_STEP) % 1
}

/**
 * A link's strip along the floor from `from` to `to`, in `color`: solid with arrows along it,
 * creeping on (`creeping`, its path's 人員 walking on their own) or still, or see-through
 * (`ghost`, while drawing) without. Null when the two points meet.
 */
export function linkMesh(
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: string,
  { ghost = false, creeping = false } = {},
) {
  const p = from.clone().setY(from.y + LINK_Y)
  const d = to
    .clone()
    .setY(to.y + LINK_Y)
    .sub(p)
  const len = d.length()
  if (len < 1e-3) return null
  const m = new THREE.Mesh(B(len, 0.006, LINK_W), ghost ? ghostMat(color) : pathMat(color))
  m.position.copy(p).addScaledVector(d, 0.5)
  m.quaternion.setFromUnitVectors(X_AXIS, d.divideScalar(len))
  m.receiveShadow = !ghost
  if (ghost) {
    m.raycast = noRay
    return m
  }
  const g = new THREE.PlaneGeometry(len, LINK_W).rotateX(-Math.PI / 2)
  // one arrow every ARROW_STEP along the link
  const uv = g.attributes.uv!
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / ARROW_STEP)
  const a = new THREE.Mesh(g, arrowMat(creeping))
  a.position.y = 0.0035
  a.raycast = noRay
  m.add(a)
  return m
}

/** An arrow flat on the floor, pointing along +x from its tail at the origin */
const arrowShape = (shaft: number, head: number, x0: number, neck: number, tip: number) =>
  new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(x0, -shaft),
      new THREE.Vector2(neck, -shaft),
      new THREE.Vector2(neck, -head),
      new THREE.Vector2(tip, 0),
      new THREE.Vector2(neck, head),
      new THREE.Vector2(neck, shaft),
      new THREE.Vector2(x0, shaft),
    ]),
  ).rotateX(-Math.PI / 2)
/** Its colour, the shaft as wide as a link; and a thin white edge round it */
const LINKER_EDGE = 0.008
const LINKER_FILL = arrowShape(LINK_W / 2, 0.075, 0, 0.17, 0.28)
const LINKER_RIM = arrowShape(
  LINK_W / 2 + LINKER_EDGE,
  0.075 + LINKER_EDGE * 1.6,
  -LINKER_EDGE,
  0.163,
  0.295,
)

/**
 * The arrow by the selected 動線點, dragged to another to link them: flat on the floor, its
 * coloured shaft as wide as a link, thinly white edged, in the path's colour; see-through till
 * the pointer is on it (see paintLinker). It has paint of its own, to fade on its own.
 */
export function linkerArrow() {
  const g = new THREE.Group()
  const fade = { transparent: true, depthWrite: false }
  const rim = new THREE.Mesh(LINKER_RIM, new THREE.MeshBasicMaterial({ color: '#ffffff', ...fade }))
  const fill = new THREE.Mesh(LINKER_FILL, mat(PATH_COLOR, { ...fade, roughness: 0.6 }))
  fill.position.y = 0.001
  // see-through things are drawn furthest first, and these two write no depth: the colour goes
  // on after the white edge always, else the edge (the bigger) could cover it
  rim.renderOrder = 1
  fill.renderOrder = 2
  g.add(rim, fill)
  return g
}

/** How see-through the arrow is till the pointer is on it */
const LINKER_FADED = 0.45

/** The arrow in the path's `color`, solid while the pointer is on it or drags it (`hot`) */
export function paintLinker(g: THREE.Object3D, color: string, hot: boolean) {
  const [rim, fill] = g.children.map((m) => (m as THREE.Mesh).material as THREE.MeshBasicMaterial)
  fill!.color.set(color)
  rim!.opacity = fill!.opacity = hot ? 1 : LINKER_FADED
}

/** Free a link's strip (and its arrows) once it's taken down */
export function disposeLink(m: THREE.Object3D) {
  m.traverse((c) => (c as THREE.Mesh).geometry?.dispose())
}

const RING = new THREE.RingGeometry(0.3, 0.38, 48).rotateX(-Math.PI / 2)
const rings = new Map<string, THREE.Material>()
/** The paint of the ring round a 人員 standing on a path, in the path's colour */
export function ringMat(color: string) {
  let m = rings.get(color)
  if (!m)
    rings.set(
      color,
      (m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })),
    )
  return m
}
/** A ring on the floor, round a 人員 standing on a path */
export function pathRing() {
  const r = new THREE.Mesh(RING, ringMat(PATH_COLOR))
  r.raycast = noRay
  return r
}

export interface PathPoint {
  id: string
  links?: readonly string[]
  /** Those of its links whose 人員 walk on their own */
  auto?: readonly string[]
}

/** A link's name: the point it's drawn from, then the one it goes to */
export const linkKey = (from: string, to: string) => `${from}|${to}`

export interface PathGraph {
  /** Each point's neighbours */
  adj: Map<string, Set<string>>
  /** Each link once, from the point it was drawn from */
  links: [string, string][]
  /** Where the links from each point lead, the way they were drawn */
  out: Map<string, string[]>
  /** The path each point is on, named by one of its points */
  path: Map<string, string>
  /** The links (see linkKey) whose 人員 walk on their own */
  auto: Set<string>
}

/** The links between these points (ones to points not among them are left out) and their paths */
export function pathGraph(points: readonly PathPoint[]): PathGraph {
  const adj = new Map<string, Set<string>>(points.map((p) => [p.id, new Set()]))
  const links: [string, string][] = []
  const out = new Map<string, string[]>(points.map((p) => [p.id, []]))
  for (const p of points)
    for (const q of p.links ?? []) {
      const near = adj.get(q)
      if (!near || q === p.id || near.has(p.id)) continue
      near.add(p.id)
      adj.get(p.id)!.add(q)
      links.push([p.id, q])
      out.get(p.id)!.push(q)
    }
  const path = new Map<string, string>()
  for (const p of points) {
    if (path.has(p.id)) continue
    const todo = [p.id]
    path.set(p.id, p.id)
    while (todo.length)
      for (const q of adj.get(todo.pop()!)!)
        if (!path.has(q)) {
          path.set(q, p.id)
          todo.push(q)
        }
  }
  const drawn = new Set(links.map(([a, b]) => linkKey(a, b)))
  const auto = new Set(
    points.flatMap((p) => (p.auto ?? []).map((q) => linkKey(p.id, q))).filter((k) => drawn.has(k)),
  )
  return { adj, links, out, path, auto }
}

/**
 * The nearest spot to (x, z) on a link, of any or those `which` lets through: the link, how far
 * along, how far off
 */
export function nearestOnPath(
  graph: PathGraph,
  at: (id: string) => { x: number; z: number },
  x: number,
  z: number,
  which?: (a: string, b: string) => boolean,
) {
  let best: { a: string; b: string; x: number; z: number; off: number } | null = null
  for (const [a, b] of graph.links) {
    if (which && !which(a, b)) continue
    const p = at(a)
    const q = at(b)
    const dx = q.x - p.x
    const dz = q.z - p.z
    const len2 = dx * dx + dz * dz
    const k = len2 ? Math.min(1, Math.max(0, ((x - p.x) * dx + (z - p.z) * dz) / len2)) : 0
    const sx = p.x + dx * k
    const sz = p.z + dz * k
    const off = Math.hypot(x - sx, z - sz)
    if (!best || off < best.off) best = { a, b, x: sx, z: sz, off }
  }
  return best
}
