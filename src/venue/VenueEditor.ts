import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CENTER, buildArchitecture, type Architecture } from './architecture'
import {
  FURNITURE,
  buildFurniture,
  isFurnitureType,
  isResizable,
  isWallItem,
  takesImage,
  type FurnitureType,
} from './furniture'
import type { LayoutItem } from './layout'
import { B, FM, YEL } from './materials'
import {
  POSTER_MIN,
  applyPoster,
  clampPosterSize,
  faceBottomY,
  faceCenterY,
  setFaceImage,
  type PosterFit,
} from './poster'
import type { CameraView, Vec3 } from './places'
import { bearing, linkPosts, withoutCutToward, type Post } from './stanchions'

export interface SelectionInfo {
  type: FurnitureType
  x: number
  z: number
  /** Rotation in whole degrees, 0–359 */
  deg: number
  /** Stanchions only: auto-linked belts at this post that have been removed */
  cutBelts: number
  /** Colour variant id, for types that have variants */
  variant?: string
  /** Height of the object's origin (a poster's centre) */
  y: number
  /** Resizable items only: width × height, editable in the panel. `presets` offers paper
   * sizes and only applies to wall items (posters); floor-standing ones (易拉展) don't get them. */
  size?: { w: number; h: number; lock: boolean; presets: boolean }
  /** Items with a printable face */
  image?: { hasImage: boolean }
}

export interface EditorCallbacks {
  /** Fired after every committed change to the placed objects */
  onChange: (items: LayoutItem[]) => void
  onSelect: (selection: SelectionInfo | null) => void
  onToast: (message: string) => void
}

export interface LabelAnchor {
  el: HTMLElement
  pos: Vec3
  offset: number
}

export interface ArrayOptions {
  cols: number
  rows: number
  dx: number
  dz: number
}

interface Fly {
  t0: number
  p0: THREE.Vector3
  g0: THREE.Vector3
  p1: THREE.Vector3
  g1: THREE.Vector3
}

const UNDO_LIMIT = 60
const UP = THREE.Object3D.DEFAULT_UP
/** Height of the belt cassette on the stanchion post */
const BELT_Y = 0.9
const BELT_GEO = B(1, 0.05, 0.006)
const X_AXIS = new THREE.Vector3(1, 0, 0)

const isPost = (o: THREE.Object3D) => o.userData.type === 'stanchion'
const onWall = (o: THREE.Object3D) => isWallItem(o.userData.type as FurnitureType)
const hasFace = (o: THREE.Object3D) => takesImage(o.userData.type as FurnitureType)
const resizable = (o: THREE.Object3D) => isResizable(o.userData.type as FurnitureType)
/** A resizable item with its proportions locked: resizing keeps the aspect ratio */
const lockedAspect = (o: THREE.Object3D) => !!o.userData.lock
/** Gap between a wall and a poster's back, so they never z-fight */
const WALL_GAP = 0.002
const HANDLE_GEO = new THREE.BoxGeometry(1, 1, 0.2)
const HANDLE_MAT = new THREE.MeshBasicMaterial({ color: YEL, depthTest: false })
const toPost = (o: THREE.Object3D): Post => ({
  x: o.position.x,
  z: o.position.z,
  cut: o.userData.cut as number[] | undefined,
})

/**
 * Owns the three.js scene: renderer, camera, architecture, placed furniture,
 * pointer/keyboard interaction and undo history. UI state lives in Vue; the
 * editor reports changes through {@link EditorCallbacks}.
 */
export class VenueEditor {
  readonly fixedSeats: number

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600)
  private readonly controls: OrbitControls
  private readonly archi: Architecture
  private readonly placed = new THREE.Group()
  /** Belts between stanchions, rebuilt from their positions (not part of the layout) */
  private readonly belts = new THREE.Group()
  /** Corner handles for resizing the selected poster */
  private readonly handles = new THREE.Group()
  /** Wall, glass and column meshes posters can hang on */
  private readonly wallMeshes: THREE.Mesh[] = []
  /** Poster images interned for undo snapshots: data URL ↔ short key */
  private readonly imgKeys = new Map<string, string>()
  private readonly imgByKey = new Map<string, string>()
  private readonly grid: THREE.GridHelper
  private readonly selBox = new THREE.Box3()
  private readonly selHelper: THREE.Box3Helper
  private readonly ray = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly held = new Set<string>()
  private readonly cleanups: (() => void)[] = []

  private labels: (LabelAnchor & { p: THREE.Vector3 })[] = []
  private labelsVisible = true
  private selected: THREE.Object3D | null = null
  /** View mode turns this off: the camera still moves, but nothing can be placed or changed */
  private editable = true
  private snap = true
  private undoStack: string[] = []
  private drag: { o: THREE.Object3D; dx: number; dz: number; moved: boolean } | null = null
  private resizing: {
    o: THREE.Object3D
    sx: number
    sy: number
    anchor: THREE.Vector3
    aspect: number
    moved: boolean
  } | null = null
  private downPt: { x: number; y: number } | null = null
  private placing: { type: FurnitureType; obj: THREE.Group | null; sx: number; sy: number } | null =
    null
  private fly: Fly | null = null
  private firstFit = true
  private lastT = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stageEl: HTMLElement,
    private readonly cb: EditorCallbacks,
  ) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }))
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    const { scene, camera } = this
    scene.background = new THREE.Color('#f3f0e8')
    camera.position.set(-29, 62, 82)

    const controls = (this.controls = new OrbitControls(camera, canvas))
    controls.target.copy(CENTER)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = 3
    controls.maxDistance = 220
    controls.screenSpacePanning = false
    controls.panSpeed = 1.2
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }

    scene.add(new THREE.HemisphereLight('#ffffff', '#d8d0bf', 1.7))
    const sun = new THREE.DirectionalLight('#ffffff', 1.9)
    sun.position.set(-11, 60, 45)
    sun.target.position.copy(CENTER)
    scene.add(sun.target)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      near: 1,
      far: 160,
    })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.03
    scene.add(sun)

    this.archi = buildArchitecture(scene)
    this.fixedSeats = this.archi.fixedSeats
    scene.add(this.placed, this.belts, this.handles)
    this.archi.wallsG.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.wallMeshes.push(o as THREE.Mesh)
    })
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const h = new THREE.Mesh(HANDLE_GEO, HANDLE_MAT)
      h.renderOrder = 1000
      h.userData = { sx, sy }
      this.handles.add(h)
    }
    this.handles.visible = false

    const grid = (this.grid = new THREE.GridHelper(90, 180, '#cdbf9d', '#e4dccb'))
    grid.position.set(19, 0.015, 17.5)
    const gm = grid.material as THREE.Material
    gm.transparent = true
    gm.opacity = 0.55
    grid.visible = false
    scene.add(grid)

    const selHelper = (this.selHelper = new THREE.Box3Helper(this.selBox, new THREE.Color(YEL)))
    ;(selHelper.material as THREE.Material).depthTest = false
    selHelper.renderOrder = 999
    selHelper.visible = false
    scene.add(selHelper)

    this.bindEvents()
    this.resizeObserver = new ResizeObserver(this.fit)
    this.resizeObserver.observe(stageEl)
    this.fit()
    renderer.setAnimationLoop(this.tick)
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.cleanups.forEach((f) => f())
    this.controls.dispose()
    this.renderer.dispose()
    document.body.classList.remove('placing')
  }

  // ---------------- Public API ----------------

  serialize(): LayoutItem[] {
    return this.placed.children.map((o) => this.itemOf(o))
  }

  /** Replace the whole layout. Pass `record` to make it undoable. */
  load(items: readonly LayoutItem[], { record = false } = {}) {
    if (record) this.pushUndo()
    this.select(null)
    this.placed.clear()
    items.forEach((i) => this.add(i))
    this.commit()
  }

  clear() {
    if (!this.placed.children.length) return
    this.load([], { record: true })
  }

  get count() {
    return this.placed.children.length
  }

  undo() {
    const s = this.undoStack.pop()
    if (!s) return
    const items = (JSON.parse(s) as LayoutItem[]).map((i) =>
      i.img ? { ...i, img: this.imgByKey.get(i.img) } : i,
    )
    this.load(items)
    this.cb.onToast('已復原')
  }

  /** Switch between edit mode and view-only mode. */
  setEditable(on: boolean) {
    this.editable = on
    if (on) return
    this.drag = null
    this.resizing = null
    this.controls.enabled = true
    this.grid.visible = false
    this.canvas.style.cursor = ''
    this.select(null)
  }

  setSnap(on: boolean) {
    this.snap = on
  }

  setWallsCut(on: boolean) {
    this.archi.wallsG.scale.y = on ? 0.28 : 1
  }

  setLabelsVisible(on: boolean) {
    this.labelsVisible = on
  }

  setLabels(anchors: LabelAnchor[]) {
    this.labels = anchors.map((a) => ({ ...a, p: new THREE.Vector3(...a.pos) }))
  }

  flyTo(view: CameraView) {
    const to = view.position
      ? { position: new THREE.Vector3(...view.position), target: new THREE.Vector3(...view.target) }
      : this.overview()
    this.fly = {
      t0: performance.now(),
      p0: this.camera.position.clone(),
      g0: this.controls.target.clone(),
      p1: to.position,
      g1: to.target,
    }
  }

  rotate(deg: number) {
    const s = this.selected
    if (!s || onWall(s)) return
    this.pushUndo()
    s.rotation.y += THREE.MathUtils.degToRad(deg)
    this.updSel()
    this.commit()
  }

  duplicate() {
    const s = this.selected
    if (!s) return
    this.pushUndo()
    const type = s.userData.type as FurnitureType
    const item = this.itemOf(s)
    let o: THREE.Object3D | null
    if (onWall(s)) {
      // next to it along the wall, same height
      const off = new THREE.Vector3((item.w ?? 0) + 0.1, 0, 0).applyAxisAngle(UP, s.rotation.y)
      o = this.add({ ...item, x: s.position.x + off.x, z: s.position.z + off.z })
    } else {
      const off = new THREE.Vector3(FURNITURE[type].arr[0], 0, 0).applyAxisAngle(UP, s.rotation.y)
      o = this.add({
        ...item,
        x: this.sn(s.position.x + off.x),
        y: undefined,
        z: this.sn(s.position.z + off.z),
        cut: undefined,
      })
    }
    this.select(o)
    this.commit()
  }

  remove() {
    const s = this.selected
    if (!s) return
    this.pushUndo()
    this.placed.remove(s)
    this.select(null)
    this.commit()
  }

  /** Repeat the selected object `cols` to its right and `rows` behind it. */
  arrayFromSelected({ cols, rows, dx, dz }: ArrayOptions) {
    const s = this.selected
    if (!s || onWall(s)) return
    cols = Math.max(1, Math.min(60, Math.trunc(cols) || 1))
    rows = Math.max(1, Math.min(60, Math.trunc(rows) || 1))
    dx = dx || 1
    dz = dz || 1
    if (cols * rows < 2) return
    this.pushUndo()
    const type = s.userData.type as FurnitureType
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (!r && !c) continue
        const v = new THREE.Vector3(c * dx, 0, -r * dz).applyAxisAngle(UP, s.rotation.y)
        this.add({
          ...this.itemOf(s),
          x: s.position.x + v.x,
          y: undefined,
          z: s.position.z + v.z,
          cut: undefined,
        })
      }
    this.commit()
    this.cb.onToast(
      `已產生 ${cols * rows - 1} 個「${FURNITURE[type].name}」（向右 ${cols} 個、向後 ${rows} 排）`,
    )
  }

  /** Rebuild the selected object in another colour variant, in the same spot. */
  setVariant(v: string) {
    const s = this.selected
    if (!s || s.userData.variant === v) return
    this.pushUndo()
    this.select(this.rebuild(s, { v }))
    this.commit()
  }

  /**
   * Resize the selected item around its anchor (metres) — a poster's centre, or a
   * floor-standing item's base. A locked item keeps its ratio, following whichever side
   * changed, unless `exact` (a paper-size preset) sets both. A poster's face is just
   * rescaled in place; a floor-standing item's hardware is rebuilt to match its new size.
   */
  setPosterSize(w: number, h: number, exact = false) {
    const s = this.selected
    if (!s || !resizable(s)) return
    const w0 = s.userData.w as number
    const h0 = s.userData.h as number
    if (lockedAspect(s) && !exact) {
      // follow whichever side was changed
      if (w !== w0) h = w / (w0 / h0)
      else w = h * (w0 / h0)
    }
    w = clampPosterSize(w, w0)
    h = clampPosterSize(h, h0)
    if (w === w0 && h === h0) return
    this.pushUndo()
    if (onWall(s)) {
      applyPoster(s, { w, h, img: s.userData.img as string | undefined })
      this.keepAboveFloor(s)
      this.updSel()
    } else {
      this.select(this.rebuild(s, { w, h }))
    }
    this.commit()
  }

  /**
   * Put an image on the selected item's printable face (or clear it). The image is always
   * cropped to fill. On a resizable item, 'image' fit reshapes it to the image's `aspect`
   * and locks it; 'poster' fit keeps its size and unlocks it. Without `fit` (the image
   * already matches) it locks too. A face with no adjustable size just crops in place. A
   * reshaped floor-standing item has its hardware rebuilt to match, same as {@link setPosterSize}.
   */
  setPosterImage(img: string | null, aspect?: number, fit?: PosterFit) {
    const s = this.selected
    if (!s || !hasFace(s)) return
    this.pushUndo()
    if (resizable(s)) {
      const w = s.userData.w as number
      const h0 = s.userData.h as number
      let h = h0
      let lock = !!s.userData.lock
      if (img && aspect) {
        lock = fit !== 'poster'
        if (lock) h = clampPosterSize(w / aspect, h0)
      }
      if (onWall(s)) {
        s.userData.lock = lock
        applyPoster(s, { w, h, img: img ?? undefined })
        this.keepAboveFloor(s)
        this.updSel()
      } else {
        this.select(this.rebuild(s, { w, h, img: img ?? undefined, lock }))
      }
    } else {
      setFaceImage(s, img ?? undefined)
      this.updSel()
    }
    this.commit()
  }

  /** Lock or unlock the selected item's aspect ratio. */
  setPosterLock(on: boolean) {
    const s = this.selected
    if (!s || !resizable(s) || !!s.userData.lock === on) return
    this.pushUndo()
    s.userData.lock = on
    this.updSel()
    this.commit()
  }

  /** Re-link every belt removed at the selected stanchion. */
  restoreBelts() {
    const s = this.selected
    if (!s || !isPost(s)) return
    this.pushUndo()
    s.userData.cut = []
    const me = toPost(s)
    for (const o of this.placed.children)
      if (o !== s && isPost(o)) o.userData.cut = withoutCutToward(toPost(o), bearing(toPost(o), me))
    this.commit()
    this.updSel()
    this.cb.onToast('已恢復紅帶連接')
  }

  /** Begin drag-placing a new object from the palette (call from a pointerdown). */
  startPlace(e: PointerEvent, type: FurnitureType) {
    if (!this.editable) return
    // Touch: let the browser keep vertical panning (the palette uses touch-action: pan-y);
    // if it takes the gesture over as a scroll we get pointercancel and abort below.
    if (e.pointerType !== 'touch') e.preventDefault()
    // Touch pointers are implicitly captured by the tile; release so move/up events
    // target whatever is under the finger (needed for the over-canvas check).
    const src = e.target as Element | null
    if (src?.hasPointerCapture?.(e.pointerId)) src.releasePointerCapture(e.pointerId)
    this.placing = { type, obj: null, sx: e.clientX, sy: e.clientY }
    document.body.classList.add('placing')
    const mv = (ev: PointerEvent) => {
      const pl = this.placing
      if (!pl) return
      if (this.overCanvas(ev)) {
        if (!pl.obj) {
          pl.obj = buildFurniture(type)
          this.placed.add(pl.obj)
          this.grid.visible = true
        }
        if (onWall(pl.obj)) {
          const hit = this.wallHit(ev)
          if (hit) this.hangOn(pl.obj, hit.point, hit.normal)
          pl.obj.visible = !!hit
        } else {
          const p = this.floorHit(ev)
          if (p) {
            this.moveTo(pl.obj, p.x, p.z)
            pl.obj.visible = true
          }
        }
      } else if (pl.obj) pl.obj.visible = false
    }
    const end = () => {
      removeEventListener('pointermove', mv)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', cancel)
      document.body.classList.remove('placing')
      this.grid.visible = false
    }
    const cancel = () => {
      end()
      if (this.placing?.obj) this.placed.remove(this.placing.obj)
      this.placing = null
    }
    const up = (ev: PointerEvent) => {
      end()
      const pl = this.placing
      this.placing = null
      if (!pl) return
      const clicked = Math.hypot(ev.clientX - pl.sx, ev.clientY - pl.sy) < 5
      if (pl.obj && pl.obj.visible && this.overCanvas(ev)) {
        // snapshot undo without the in-flight object
        this.placed.remove(pl.obj)
        this.pushUndo()
        this.placed.add(pl.obj)
        this.select(pl.obj)
        this.commit()
      } else {
        if (pl.obj) this.placed.remove(pl.obj)
        if (clicked && isWallItem(type)) {
          // hang it on whatever wall is in the middle of the view
          this.ray.setFromCamera(this.ndc.set(0, 0), this.camera)
          const hit = this.wallHitFromRay()
          if (!hit) {
            this.cb.onToast(`請把「${FURNITURE[type].name}」拖曳到牆面上`)
            return
          }
          this.pushUndo()
          const o = buildFurniture(type)
          this.placed.add(o)
          this.hangOn(o, hit.point, hit.normal)
          this.select(o)
          this.commit()
          this.cb.onToast(`已將「${FURNITURE[type].name}」貼在畫面中央的牆上，可拖曳調整`)
        } else if (clicked) {
          this.pushUndo()
          const t = this.controls.target
          this.select(this.add({ t: type, x: this.sn(t.x), z: this.sn(t.z), r: 0 }))
          this.commit()
          this.cb.onToast(`已放置「${FURNITURE[type].name}」於畫面中央，可拖曳調整`)
        }
      }
    }
    addEventListener('pointermove', mv)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', cancel)
  }

  // ---------------- Internals ----------------

  /** Place an item; with no `y` it is dropped onto the floor below (x, z). */
  private add({ t, x, y, z, r, v, cut, w, h, img, lock }: LayoutItem) {
    if (!isFurnitureType(t)) return null
    const o = buildFurniture(t, v, w && h ? { w, h } : undefined)
    o.position.set(x, y ?? this.floorY(x, z), z)
    o.rotation.y = r
    if (cut?.length) o.userData.cut = [...cut]
    if (w && h) applyPoster(o, { w, h, img })
    else if (img) setFaceImage(o, img)
    if (lock) o.userData.lock = true
    this.placed.add(o)
    return o
  }

  /** Remove `o` and rebuild it fresh with `overrides` merged onto its current item, in place. */
  private rebuild(o: THREE.Object3D, overrides: Partial<LayoutItem>) {
    const item = this.itemOf(o)
    this.placed.remove(o)
    return this.add({ ...item, ...overrides })
  }

  private itemOf(o: THREE.Object3D): LayoutItem {
    const ud = o.userData
    const cut = ud.cut as number[] | undefined
    return {
      t: ud.type as FurnitureType,
      x: +o.position.x.toFixed(3),
      y: +o.position.y.toFixed(3),
      z: +o.position.z.toFixed(3),
      r: +o.rotation.y.toFixed(4),
      ...(ud.variant ? { v: ud.variant as string } : {}),
      ...(cut?.length ? { cut: cut.map((c) => +c.toFixed(3)) } : {}),
      ...(ud.img && hasFace(o) ? { img: ud.img as string } : {}),
      ...(resizable(o)
        ? {
            w: +(ud.w as number).toFixed(3),
            h: +(ud.h as number).toFixed(3),
            ...(ud.lock ? { lock: true } : {}),
          }
        : {}),
    }
  }

  /** Short stand-in for a poster image in undo snapshots, so each one doesn't copy the data URL */
  private imgKey(img: string) {
    let k = this.imgKeys.get(img)
    if (!k) {
      k = `img${this.imgKeys.size}`
      this.imgKeys.set(img, k)
      this.imgByKey.set(k, img)
    }
    return k
  }

  /** First vertical wall face under the current ray, with its normal turned toward the camera */
  private wallHitFromRay() {
    const hits: THREE.Intersection[] = []
    // walls opt out of raycasting (see buildArchitecture), so call the mesh raycast directly
    for (const m of this.wallMeshes) THREE.Mesh.prototype.raycast.call(m, this.ray, hits)
    hits.sort((a, b) => a.distance - b.distance)
    for (const h of hits) {
      if (!h.face) continue
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
      if (Math.abs(n.y) > 0.3) continue
      n.setY(0).normalize()
      if (n.dot(this.ray.ray.direction) > 0) n.negate()
      return { point: h.point, normal: n }
    }
    return null
  }

  private wallHit(e: PointerEvent) {
    this.setRay(e)
    return this.wallHitFromRay()
  }

  /** Hang a wall item centred on `point`, facing out along `normal`. */
  private hangOn(o: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3) {
    o.rotation.set(0, Math.atan2(normal.x, normal.z), 0)
    o.position.copy(point).addScaledVector(normal, WALL_GAP)
    this.keepAboveFloor(o)
  }

  /** Keep a poster's bottom edge off the floor in front of its wall. */
  private keepAboveFloor(o: THREE.Object3D) {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion)
    const p = o.position
    const floor = this.floorY(p.x + n.x * 0.3, p.z + n.z * 0.3)
    p.y = Math.max(p.y, floor + (o.userData.h as number) / 2 + 0.02)
  }

  /** Position the resize handles on the selected poster's corners, sized for the current zoom. */
  private updHandles() {
    const s = this.selected
    this.handles.visible = !!s && resizable(s)
    if (!s || !this.handles.visible) return
    s.updateMatrixWorld()
    const w = s.userData.w as number
    const h = s.userData.h as number
    const cy = faceCenterY(s)
    for (const hd of this.handles.children) {
      const { sx, sy } = hd.userData as { sx: number; sy: number }
      hd.position.copy(s.localToWorld(new THREE.Vector3((sx * w) / 2, cy + (sy * h) / 2, 0.01)))
      hd.quaternion.copy(s.quaternion)
      const k = THREE.MathUtils.clamp(
        this.camera.position.distanceTo(hd.position) * 0.012,
        0.03,
        0.4,
      )
      hd.scale.set(k, k, k)
    }
  }

  private pickHandle(e: PointerEvent) {
    if (!this.handles.visible) return null
    this.setRay(e)
    return this.ray.intersectObjects(this.handles.children, false)[0]?.object ?? null
  }

  /** Drag a poster corner: the opposite corner stays put. Shift keeps the aspect ratio. */
  private resizeTo(e: PointerEvent) {
    const r = this.resizing
    if (!r) return
    const { o } = r
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion)
    this.setRay(e)
    let w: number
    let h: number
    if (onWall(o)) {
      // a poster's own centre moves: the dragged corner follows the pointer, the opposite
      // corner (the fixed `anchor`) stays put
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
      const p = this.ray.ray.intersectPlane(
        new THREE.Plane().setFromNormalAndCoplanarPoint(normal, r.anchor),
        new THREE.Vector3(),
      )
      if (!p) return
      const d = p.sub(r.anchor)
      w = clampPosterSize(r.sx * d.dot(right), POSTER_MIN)
      h = clampPosterSize(r.sy * d.y, POSTER_MIN)
      if (e.shiftKey || lockedAspect(o)) {
        if (w / h > r.aspect) h = clampPosterSize(w / r.aspect, POSTER_MIN)
        else w = clampPosterSize(h * r.aspect, POSTER_MIN)
      }
      applyPoster(o, { w, h, img: o.userData.img as string | undefined })
      o.position
        .copy(r.anchor)
        .addScaledVector(right, (r.sx * w) / 2)
        .add(new THREE.Vector3(0, (r.sy * h) / 2, 0))
    } else {
      // floor-standing: the object never moves — width grows symmetrically about its own
      // centre-line, height grows from its fixed base. This is a live preview of the face
      // only; on release its hardware is rebuilt to match (see the pointerup handler)
      const p = this.ray.ray.intersectPlane(
        new THREE.Plane().setFromNormalAndCoplanarPoint(normal, o.position),
        new THREE.Vector3(),
      )
      if (!p) return
      const local = o.worldToLocal(p)
      w = clampPosterSize(Math.abs(local.x) * 2, POSTER_MIN)
      h = clampPosterSize(local.y - faceBottomY(o), POSTER_MIN)
      if (e.shiftKey || lockedAspect(o)) {
        if (w / h > r.aspect) h = clampPosterSize(w / r.aspect, POSTER_MIN)
        else w = clampPosterSize(h * r.aspect, POSTER_MIN)
      }
      applyPoster(o, { w, h, img: o.userData.img as string | undefined })
    }
    this.updSel()
  }

  private commit() {
    this.updateBelts()
    this.cb.onChange(this.serialize())
  }

  /** Redraw the belts between stanchion posts from their current positions. */
  private updateBelts() {
    this.belts.clear()
    const posts = this.placed.children.filter(isPost)
    for (const [i, j] of linkPosts(posts.map(toPost)).belts) {
      const a = posts[i]!.position.clone().setY(posts[i]!.position.y + BELT_Y)
      const b = posts[j]!.position.clone().setY(posts[j]!.position.y + BELT_Y)
      const d = b.clone().sub(a)
      const m = new THREE.Mesh(BELT_GEO, FM.belt)
      m.castShadow = true
      m.position.copy(a).add(b).multiplyScalar(0.5)
      m.scale.x = d.length()
      m.quaternion.setFromUnitVectors(X_AXIS, d.normalize())
      m.userData.ends = [posts[i], posts[j]]
      this.belts.add(m)
    }
  }

  private pickBelt(e: PointerEvent) {
    this.setRay(e)
    return this.ray.intersectObjects(this.belts.children, false)[0]?.object ?? null
  }

  /** Remove an auto-linked belt; the cut is stored on its first post so it survives saves. */
  private cutBelt(belt: THREE.Object3D) {
    const [a, b] = belt.userData.ends as [THREE.Object3D, THREE.Object3D]
    this.pushUndo()
    a.userData.cut = [
      ...((a.userData.cut as number[] | undefined) ?? []),
      bearing(toPost(a), toPost(b)),
    ]
    this.commit()
    this.updSel()
    this.cb.onToast('已拆除紅帶，選取紅龍柱可恢復連接')
  }

  private pushUndo() {
    const items = this.serialize().map((i) => (i.img ? { ...i, img: this.imgKey(i.img) } : i))
    this.undoStack.push(JSON.stringify(items))
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
  }

  private select(o: THREE.Object3D | null) {
    this.selected = o
    this.selHelper.visible = !!o
    if (o) this.updSel()
    else {
      this.updHandles()
      this.cb.onSelect(null)
    }
  }

  private updSel() {
    const s = this.selected
    if (!s) return
    this.selBox.setFromObject(s)
    const deg = (Math.round(THREE.MathUtils.radToDeg(s.rotation.y) % 360) + 360) % 360
    let cutBelts = 0
    if (isPost(s)) {
      const posts = this.placed.children.filter(isPost)
      const me = posts.indexOf(s)
      cutBelts = linkPosts(posts.map(toPost)).cut.filter((p) => p.includes(me)).length
    }
    this.updHandles()
    this.cb.onSelect({
      type: s.userData.type,
      x: s.position.x,
      y: s.position.y,
      z: s.position.z,
      deg,
      cutBelts,
      variant: s.userData.variant,
      ...(resizable(s)
        ? {
            size: {
              w: s.userData.w,
              h: s.userData.h,
              lock: !!s.userData.lock,
              presets: onWall(s),
            },
          }
        : {}),
      ...(hasFace(s) ? { image: { hasImage: !!s.userData.img } } : {}),
    })
  }

  private sn(v: number) {
    return this.snap ? Math.round(v * 4) / 4 : v
  }

  private setRay(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    )
    this.ray.setFromCamera(this.ndc, this.camera)
  }

  private floorY(x: number, z: number) {
    this.ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0))
    const h = this.ray.intersectObjects(this.archi.walk, false)[0]
    return h ? h.point.y : 0
  }

  private floorHit(e: PointerEvent) {
    this.setRay(e)
    const h = this.ray.intersectObjects(this.archi.walk, false)[0]
    return h
      ? h.point
      : this.ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          new THREE.Vector3(),
        )
  }

  private pickObj(e: PointerEvent) {
    this.setRay(e)
    const h = this.ray.intersectObjects(this.placed.children, true)[0]
    if (!h) return null
    let o = h.object
    while (o.parent && o.parent !== this.placed) o = o.parent
    return o
  }

  private moveTo(o: THREE.Object3D, x: number, z: number) {
    x = this.sn(x)
    z = this.sn(z)
    o.position.set(x, this.floorY(x, z), z)
  }

  private overCanvas(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    return inside && !(e.target as Element | null)?.closest?.('[data-stage-ui]')
  }

  /** Overview camera framed to the viewport aspect, with the building centred left–right on screen. */
  private overview() {
    const aspect = this.camera.aspect
    const a = Number.isFinite(aspect) && aspect > 0 ? Math.max(0.5, aspect) : 1.4
    const s = Math.max(1, 1.75 / a)
    const target = CENTER.clone()
    const position = new THREE.Vector3(-48, 62, 52).multiplyScalar(s * 0.92).add(CENTER)

    // The plan isn't symmetric around CENTER from this angle: pan sideways until the
    // walls are centred on screen, and back off if they don't fit (narrow screens).
    // A few passes let the perspective settle.
    const points: THREE.Vector3[] = []
    const mb = new THREE.Box3()
    this.archi.wallsG.updateMatrixWorld(true)
    this.archi.wallsG.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      mb.setFromObject(o, true)
      for (let i = 0; i < 8; i++)
        points.push(
          new THREE.Vector3(
            i & 1 ? mb.max.x : mb.min.x,
            i & 2 ? mb.max.y : mb.min.y,
            i & 4 ? mb.max.z : mb.min.z,
          ),
        )
    })
    const cam = this.camera.clone()
    const right = new THREE.Vector3()
    const v = new THREE.Vector3()
    for (let pass = 0; pass < 4; pass++) {
      cam.position.copy(position)
      cam.lookAt(target)
      cam.updateMatrixWorld()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const pt of points) {
        v.copy(pt).project(cam)
        minX = Math.min(minX, v.x)
        maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y)
        maxY = Math.max(maxY, v.y)
      }
      const halfW =
        Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * position.distanceTo(target) * cam.aspect
      right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize()
      const shift = right.multiplyScalar(((minX + maxX) / 2) * halfW)
      position.add(shift)
      target.add(shift)
      // keep ~8% margin on each side; only ever zoom out
      const over = Math.max((maxX - minX) / 1.84, (maxY - minY) / 1.7)
      if (over > 1) position.sub(target).multiplyScalar(over).add(target)
    }
    return { position, target }
  }

  private resize() {
    const w = this.stageEl.clientWidth
    const h = this.stageEl.clientHeight
    if (!w || !h) return false
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    return true
  }

  private fit = () => {
    if (this.resize() && this.firstFit) {
      const { position, target } = this.overview()
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.firstFit = false
    }
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn as EventListener, opts)
    this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts))
  }

  private bindEvents() {
    const { canvas } = this
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault())
    this.listen(window, 'keyup', (e) => this.held.delete(e.key.toLowerCase()))
    this.listen(window, 'blur', () => this.held.clear())
    this.listen(window, 'keydown', this.onKeyDown)

    this.listen(
      this.stageEl,
      'pointerdown',
      (e) => {
        if (e.target !== canvas || e.button !== 0) return
        canvas.focus()
        this.downPt = { x: e.clientX, y: e.clientY }
        if (!this.editable) return
        const hd = this.pickHandle(e)
        if (hd && this.selected) {
          e.stopPropagation()
          e.preventDefault()
          const s = this.selected
          const { sx, sy } = hd.userData as { sx: number; sy: number }
          const w = s.userData.w as number
          const h = s.userData.h as number
          const cy = faceCenterY(s)
          const anchor = s.localToWorld(new THREE.Vector3((-sx * w) / 2, cy - (sy * h) / 2, 0))
          this.resizing = { o: s, sx, sy, anchor, aspect: w / h, moved: false }
          this.controls.enabled = false
          return
        }
        const o = this.pickObj(e)
        if (!o) return
        e.stopPropagation()
        e.preventDefault()
        this.select(o)
        if (onWall(o)) {
          // remember where on the poster it was grabbed, in its own (right, up) axes
          const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion)
          this.setRay(e)
          const p = this.ray.ray.intersectPlane(
            new THREE.Plane().setFromNormalAndCoplanarPoint(n, o.position),
            new THREE.Vector3(),
          )
          const g = p ? o.worldToLocal(p) : new THREE.Vector3()
          this.drag = { o, dx: g.x, dz: g.y, moved: false }
        } else {
          const p = this.floorHit(e) ?? o.position.clone()
          this.drag = { o, dx: o.position.x - p.x, dz: o.position.z - p.z, moved: false }
        }
        this.controls.enabled = false
        canvas.style.cursor = 'grabbing'
      },
      true,
    )
    this.listen(window, 'pointermove', (e) => {
      const r = this.resizing
      if (r) {
        if (!r.moved) {
          this.pushUndo()
          r.moved = true
        }
        this.resizeTo(e)
        return
      }
      const d = this.drag
      if (d && onWall(d.o)) {
        const hit = this.wallHit(e)
        if (!hit) return
        if (!d.moved) {
          this.pushUndo()
          d.moved = true
        }
        this.hangOn(d.o, hit.point, hit.normal)
        // shift so the grabbed spot, not the centre, follows the pointer
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(d.o.quaternion)
        d.o.position.addScaledVector(right, -d.dx).setY(d.o.position.y - d.dz)
        this.keepAboveFloor(d.o)
        this.updSel()
        return
      }
      if (d) {
        const p = this.floorHit(e)
        if (!p) return
        if (!d.moved) {
          this.pushUndo()
          d.moved = true
          this.grid.visible = true
        }
        this.moveTo(d.o, p.x + d.dx, p.z + d.dz)
        if (isPost(d.o)) this.updateBelts()
        this.updSel()
        return
      }
      if (this.placing || !this.editable) return
      if (e.target === canvas && e.buttons === 0) {
        const hd = this.pickHandle(e)
        canvas.style.cursor = hd
          ? hd.userData.sx * hd.userData.sy > 0
            ? 'nesw-resize'
            : 'nwse-resize'
          : this.pickObj(e)
            ? 'grab'
            : this.pickBelt(e)
              ? 'pointer'
              : ''
      }
    })
    this.listen(window, 'pointerup', (e) => {
      if (this.resizing) {
        const { o, moved } = this.resizing
        if (moved) {
          // a floor item's hardware wasn't kept in sync during the live drag; rebuild it now
          if (!onWall(o)) this.select(this.rebuild(o, {}))
          this.commit()
        }
        this.resizing = null
        this.controls.enabled = true
        this.downPt = null
        return
      }
      if (this.drag) {
        if (this.drag.moved) this.commit()
        this.drag = null
        this.controls.enabled = true
        this.grid.visible = false
        canvas.style.cursor = 'grab'
        return
      }
      const d = this.downPt
      if (d && e.target === canvas && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
        const belt = this.editable && this.pickBelt(e)
        if (belt) this.cutBelt(belt)
        else this.select(null)
      }
      this.downPt = null
    })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
    // keys pressed in a dialog (e.g. Esc / Delete) belong to it, not to the scene
    if (target?.closest?.('dialog')) return
    const kk = e.key.toLowerCase()
    const mod = e.metaKey || e.ctrlKey
    if (
      !mod &&
      ((kk.length === 1 && 'wasd'.includes(kk)) ||
        (!this.selected && kk.startsWith('arrow')) ||
        kk === 'shift')
    ) {
      this.held.add(kk)
      if (kk !== 'shift') {
        e.preventDefault()
        return
      }
    }
    // everything below changes the layout
    if (!this.editable) return
    if (mod && kk === 'z') {
      e.preventDefault()
      this.undo()
      return
    }
    const s = this.selected
    if (!s) return
    if (mod && kk === 'd') {
      e.preventDefault()
      this.duplicate()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      this.remove()
    } else if (kk === 'q') this.rotate(15)
    else if (kk === 'e') this.rotate(-15)
    else if (kk === 'r') this.rotate(-90)
    else if (e.key === 'Escape') this.select(null)
    else if (e.key.startsWith('Arrow') && onWall(s)) {
      // posters slide along their wall: left/right sideways, up/down in height
      e.preventDefault()
      const st = e.shiftKey ? 0.25 : 0.05
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.quaternion)
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-st, 0],
        ArrowRight: [st, 0],
        ArrowUp: [0, st],
        ArrowDown: [0, -st],
      }
      const [dx, dy] = nudge[e.key] ?? [0, 0]
      this.pushUndo()
      s.position.addScaledVector(right, dx).setY(s.position.y + dy)
      this.keepAboveFloor(s)
      this.updSel()
      this.commit()
    } else if (e.key.startsWith('Arrow')) {
      // nudge the selection along the world axis closest to the screen direction
      e.preventDefault()
      const st = e.shiftKey ? 1 : 0.25
      const f = new THREE.Vector3()
      this.camera.getWorldDirection(f)
      f.y = 0
      f.normalize()
      const rgt = new THREE.Vector3(-f.z, 0, f.x)
      const v = {
        ArrowUp: f,
        ArrowDown: f.clone().negate(),
        ArrowRight: rgt,
        ArrowLeft: rgt.clone().negate(),
      }[e.key]
      if (!v) return
      const ax =
        Math.abs(v.x) > Math.abs(v.z)
          ? new THREE.Vector3(Math.sign(v.x), 0, 0)
          : new THREE.Vector3(0, 0, Math.sign(v.z))
      this.pushUndo()
      const p = s.position
      p.set(p.x + ax.x * st, 0, p.z + ax.z * st)
      p.y = this.floorY(p.x, p.z)
      this.updSel()
      this.commit()
    }
  }

  /** WASD / arrow-key camera walking */
  private walkCam(dt: number) {
    const { held, camera, controls } = this
    if (!held.size) return
    const f = new THREE.Vector3()
    camera.getWorldDirection(f)
    f.y = 0
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1)
    f.normalize()
    const r = new THREE.Vector3(-f.z, 0, f.x)
    const m = new THREE.Vector3()
    if (held.has('w')) m.add(f)
    if (held.has('s')) m.sub(f)
    if (held.has('d')) m.add(r)
    if (held.has('a')) m.sub(r)
    if (!this.selected) {
      if (held.has('arrowup')) m.add(f)
      if (held.has('arrowdown')) m.sub(f)
      if (held.has('arrowright')) m.add(r)
      if (held.has('arrowleft')) m.sub(r)
    }
    if (!m.lengthSq()) return
    const sp =
      Math.max(4, camera.position.distanceTo(controls.target) * 0.6) * (held.has('shift') ? 2.5 : 1)
    m.normalize().multiplyScalar(sp * dt)
    camera.position.add(m)
    controls.target.add(m)
    this.fly = null
  }

  private readonly v = new THREE.Vector3()

  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000)
    this.lastT = now
    this.walkCam(dt)
    const { fly, camera, controls } = this
    if (fly) {
      let k = Math.min(1, (now - fly.t0) / 800)
      k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(fly.p0, fly.p1, k)
      controls.target.lerpVectors(fly.g0, fly.g1, k)
      if (k >= 1) this.fly = null
    }
    controls.update()
    if (this.selected) {
      this.selBox.setFromObject(this.selected)
      if (this.handles.visible) this.updHandles()
    }
    this.renderer.render(this.scene, camera)
    if (this.labelsVisible) this.layoutLabels()
  }

  /** Project label anchors to screen space and hide ones that would overlap. */
  private layoutLabels() {
    const w = this.stageEl.clientWidth
    const h = this.stageEl.clientHeight
    const rects: { x: number; y: number; r: number; b: number }[] = []
    const v = this.v
    for (const l of this.labels) {
      v.copy(l.p).project(this.camera)
      const st = l.el.style
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
        st.display = 'none'
        continue
      }
      st.display = ''
      st.visibility = ''
      const bw = l.el.offsetWidth
      const bh = l.el.offsetHeight
      const x = ((v.x + 1) / 2) * w - bw / 2
      const y = ((1 - v.y) / 2) * h - bh - l.offset
      const r = { x: x - 3, y: y - 3, r: x + bw + 3, b: y + bh + 3 }
      if (rects.some((q) => r.x < q.r && r.r > q.x && r.y < q.b && r.b > q.y)) {
        st.visibility = 'hidden'
        continue
      }
      rects.push(r)
      st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
    }
  }
}
