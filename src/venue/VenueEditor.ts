import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CENTER, buildArchitecture, type Architecture } from './architecture'
import { FURNITURE, buildFurniture, isFurnitureType, type FurnitureType } from './furniture'
import type { LayoutItem } from './layout'
import { YEL } from './materials'
import type { CameraView, Vec3 } from './places'

export interface SelectionInfo {
  type: FurnitureType
  x: number
  z: number
  /** Rotation in whole degrees, 0–359 */
  deg: number
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
  private snap = true
  private undoStack: string[] = []
  private drag: { o: THREE.Object3D; dx: number; dz: number; moved: boolean } | null = null
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
    scene.add(this.placed)

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
    return this.placed.children.map((o) => ({
      t: o.userData.type as FurnitureType,
      x: +o.position.x.toFixed(3),
      y: +o.position.y.toFixed(3),
      z: +o.position.z.toFixed(3),
      r: +o.rotation.y.toFixed(4),
    }))
  }

  /** Replace the whole layout. Pass `record` to make it undoable. */
  load(items: readonly LayoutItem[], { record = false } = {}) {
    if (record) this.pushUndo()
    this.select(null)
    this.placed.clear()
    items.forEach((i) => this.add(i.t, i.x, i.y, i.z, i.r))
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
    this.load(JSON.parse(s))
    this.cb.onToast('已復原')
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
    if (!s) return
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
    const off = new THREE.Vector3(FURNITURE[type].arr[0], 0, 0).applyAxisAngle(UP, s.rotation.y)
    const o = this.add(
      type,
      this.sn(s.position.x + off.x),
      undefined,
      this.sn(s.position.z + off.z),
      s.rotation.y,
    )
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
    if (!s) return
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
        this.add(type, s.position.x + v.x, undefined, s.position.z + v.z, s.rotation.y)
      }
    this.commit()
    this.cb.onToast(
      `已產生 ${cols * rows - 1} 個「${FURNITURE[type].name}」（向右 ${cols} 個、向後 ${rows} 排）`,
    )
  }

  /** Begin drag-placing a new object from the palette (call from a pointerdown). */
  startPlace(e: PointerEvent, type: FurnitureType) {
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
        const p = this.floorHit(ev)
        if (p) {
          this.moveTo(pl.obj, p.x, p.z)
          pl.obj.visible = true
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
        if (clicked) {
          this.pushUndo()
          const t = this.controls.target
          this.select(this.add(type, this.sn(t.x), undefined, this.sn(t.z)))
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

  private add(t: FurnitureType, x: number, y: number | undefined, z: number, r = 0) {
    if (!isFurnitureType(t)) return null
    const o = buildFurniture(t)
    o.position.set(x, y ?? this.floorY(x, z), z)
    o.rotation.y = r
    this.placed.add(o)
    return o
  }

  private commit() {
    this.cb.onChange(this.serialize())
  }

  private pushUndo() {
    this.undoStack.push(JSON.stringify(this.serialize()))
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
  }

  private select(o: THREE.Object3D | null) {
    this.selected = o
    this.selHelper.visible = !!o
    if (o) this.updSel()
    else this.cb.onSelect(null)
  }

  private updSel() {
    const s = this.selected
    if (!s) return
    this.selBox.setFromObject(s)
    const deg = (Math.round(THREE.MathUtils.radToDeg(s.rotation.y) % 360) + 360) % 360
    this.cb.onSelect({ type: s.userData.type, x: s.position.x, z: s.position.z, deg })
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
        const o = this.pickObj(e)
        if (!o) return
        e.stopPropagation()
        e.preventDefault()
        this.select(o)
        const p = this.floorHit(e) ?? o.position.clone()
        this.drag = { o, dx: o.position.x - p.x, dz: o.position.z - p.z, moved: false }
        this.controls.enabled = false
        canvas.style.cursor = 'grabbing'
      },
      true,
    )
    this.listen(window, 'pointermove', (e) => {
      const d = this.drag
      if (d) {
        const p = this.floorHit(e)
        if (!p) return
        if (!d.moved) {
          this.pushUndo()
          d.moved = true
          this.grid.visible = true
        }
        this.moveTo(d.o, p.x + d.dx, p.z + d.dz)
        this.updSel()
        return
      }
      if (this.placing) return
      if (e.target === canvas && e.buttons === 0)
        canvas.style.cursor = this.pickObj(e) ? 'grab' : ''
    })
    this.listen(window, 'pointerup', (e) => {
      if (this.drag) {
        if (this.drag.moved) this.commit()
        this.drag = null
        this.controls.enabled = true
        this.grid.visible = false
        canvas.style.cursor = 'grab'
        return
      }
      const d = this.downPt
      if (d && e.target === canvas && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4)
        this.select(null)
      this.downPt = null
    })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
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
    else if (e.key.startsWith('Arrow')) {
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
    if (this.selected) this.selBox.setFromObject(this.selected)
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
