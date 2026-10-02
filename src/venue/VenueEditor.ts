import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { nameOf, t } from '@/i18n'
import { CENTER, buildArchitecture, type Architecture } from './architecture'
import {
  FURNITURE,
  buildFurniture,
  isFurnitureType,
  isResizable,
  isWallItem,
  takesImage,
  PERSON_COLOR,
  PERSON_TAG_Y,
  TAG_COLOR,
  SEATED_TAG_Y,
  SEATS,
  TABLES,
  footprintOf,
  onTableOnly,
  priceOf,
  type Footprint,
  applyPeople,
  type FurnitureType,
} from './furniture'
import { rebaseStep } from './history'
import { drawLabels, type LabelFace, type LabelMark, type TagMark } from './imageLabels'
import { LID_OPEN, clampLid, setLaptopOpen } from './laptop'
import { clampPeople, cleanInfo, cleanTag, isHexColor, type LayoutItem } from './layout'
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
import { ZONE_COLOR, ZONE_MIN, applyZone, clampZone, onZoneGrid } from './zone'

export interface SelectionInfo {
  /** How many items are selected; the rest describes the first of them */
  count: number
  /** Every selected item's id, the one described first */
  ids: string[]
  /** The group (群組) every selected item is in, if they share one */
  group?: string
  /** That group's tag ('' when none), tag colour and note ('' when none) */
  groupTag?: string
  groupColor?: string
  groupInfo?: string
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
  /** Its name tag ('' when none) */
  tag: string
  /** Anything but people and zones: its tag's colour (theirs wear the item's colour) */
  tagColor?: string
  /** Its note (補充資訊; '' when none) */
  info: string
  /** Rented items: whether it counts toward the rental total */
  billed?: boolean
  /** 人員 items: how many figures, their colour, and whether they sit on a seat */
  people?: { n: number; color: string; sit: boolean }
  /** 區域 items: width × depth in metres and colour */
  zone?: { w: number; d: number; color: string }
  /** Laptops: the lid's opening in degrees */
  laptop?: { open: number }
}

export interface EditorCallbacks {
  /** Fired after every committed change to the placed objects */
  onChange: (items: LayoutItem[]) => void
  onSelect: (selection: SelectionInfo | null) => void
  onToast: (message: string) => void
  /** Fired whenever there comes to be (or stops being) something to undo or redo */
  onHistory: (canUndo: boolean, canRedo: boolean) => void
  /** Items moving under the pointer, as they go (before the change is committed) */
  onLive?: (moves: LiveMove[]) => void
  /** The camera moved (by the person, a fly to a view, or following someone) */
  onCamera?: (cam: CameraState) => void
  /** Following someone's view stopped because the person moved the camera themselves */
  onFollowEnd?: () => void
  /** Where in the venue the pointer is, a few times a second; null once it leaves the stage */
  onPointer?: (point: Vec3 | null) => void
  /** The kind the next tap on the stage places changed (null: none armed); see armPlace */
  onArmed?: (type: FurnitureType | null) => void
}

/** Someone else's pointer, somewhere in the venue */
export interface RemoteCursor {
  key: string
  name: string
  color: string
  point: Vec3
}

/** Where the camera is and what it looks at */
export interface CameraState {
  p: Vec3
  t: Vec3
}

/** Where an item is while it's being dragged */
export interface LiveMove {
  id: string
  x: number
  y: number
  z: number
  r: number
}

/** Someone else has these items selected: they can't be picked here */
export interface Lock {
  name: string
  /** Their colour, for the outline */
  color: string
}

export interface LabelAnchor {
  el: HTMLElement
  pos: Vec3
  offset: number
  /** What it says, for drawing it on an exported picture */
  face: () => LabelFace
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

/** Around the building in each theme: the background (the page's) and the grid's lines */
const SCENE = {
  light: { background: '#f3f0e8', gridCenter: '#cdbf9d', grid: '#e4dccb' },
  dark: { background: '#16171a', gridCenter: '#6b6250', grid: '#3a3731' },
} as const

/**
 * A finger on an item it hasn't selected holds this long, without moving further than
 * HOLD_SLOP pixels, to pick the item up; moving sooner is the camera's drag
 */
const HOLD_MS = 300
const HOLD_SLOP = 8

const UNDO_LIMIT = 60
/**
 * How often the pointer's place in the venue is reported, at most (ms). Each report goes to
 * everyone with the project open, and Supabase's free plan allows 100 messages a second across
 * the whole app (a broadcast counting once sent and once per receiver): the cursors glide
 * between reports, so a few a second look smooth enough.
 */
const POINTER_EVERY = 200
/** An exported picture's building, in pixels along its longer side */
const IMAGE_SIZE = 2400
/** A picture this size (see IMAGE_SIZE) draws its tags and labels at the stage's size */
const LABEL_SIZE = 1000
const UP = THREE.Object3D.DEFAULT_UP
/** Height of the belt cassette on the stanchion post */
const BELT_Y = 0.9
const BELT_GEO = B(1, 0.05, 0.006)
const X_AXIS = new THREE.Vector3(1, 0, 0)

const isPost = (o: THREE.Object3D) => o.userData.type === 'stanchion'
const isPerson = (o: THREE.Object3D) => o.userData.type === 'person'
const isZone = (o: THREE.Object3D) => o.userData.type === 'zone'
/** Whether dark text reads better than white on this #rrggbb colour (WCAG relative luminance) */
function isLight(hex: string) {
  const lin = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5) > 0.36
}

/** Screen pixels a zone's tag is raised above its centre (matches the leader line in TagLayer) */
const ZONE_TAG_LIFT = 26
/** Turns a wall-facing handle to lie flat on the floor */
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
/** Separate tag layers: most tags float above their item, zones' sit in their middle */
export type TagKind = 'item' | 'zone'
const tagKindOf = (o: THREE.Object3D): TagKind => (isZone(o) ? 'zone' : 'item')
/** People and zones colour their tag with their own colour; everything else picks one */
const ownTagColor = (o: THREE.Object3D) => !isPerson(o) && !isZone(o)
/** Metres a floating tag sits above the top of its item (people use PERSON_TAG_Y instead) */
const TAG_CLEARANCE = 0.12
const tagBox = new THREE.Box3()
const seatOf = (o: THREE.Object3D) => SEATS[o.userData.type as string]
const tableOf = (o: THREE.Object3D) => TABLES[o.userData.type as string]
const onTable = (o: THREE.Object3D) => onTableOnly(o.userData.type as FurnitureType)
const footOf = (o: THREE.Object3D) =>
  footprintOf(
    o.userData.type as FurnitureType,
    o.userData.variant as string | undefined,
    o.userData.open as number | undefined,
  )
/** How far a tray's centre must stay inside a table top's edge */
const TABLE_MARGIN = 0.1
/** Space kept between two things on a table */
const TRAY_GAP = 0.015
/** Types that are placed turned toward the viewer; everything else starts square to the grid */
const facesViewer = (t: FurnitureType) => t === 'person' || t === 'laptop'
/** How close (metres, on the floor plan) a new seat must be to a table's edge to face it */
const TABLE_REACH = 1
/** How close (metres, on the floor plan) a person must be dropped to a seat to sit on it */
const SIT_REACH = 0.35

/** A member of a multiple selection being moved, from where it started */
interface GroupMember {
  o: THREE.Object3D
  start: THREE.Vector3
  riders: Rider[]
}

/** Someone sitting on a seat, remembered in the seat's frame so they move with it */
interface Rider {
  o: THREE.Object3D
  local: THREE.Vector3
  turn: number
}
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
  /** Kinds of item hidden from view (see setHiddenTypes) */
  private hidden = new Set<FurnitureType>()
  /** Corner handles for resizing the selected poster */
  private readonly handles = new THREE.Group()
  /** Wall, glass and column meshes posters can hang on */
  private readonly wallMeshes: THREE.Mesh[] = []
  /** Poster images interned for undo snapshots: data URL ↔ short key */
  private readonly imgKeys = new Map<string, string>()
  private readonly imgByKey = new Map<string, string>()
  private readonly grid: THREE.GridHelper
  private readonly sun: THREE.DirectionalLight
  private readonly selBox = new THREE.Box3()
  private readonly selHelper: THREE.Box3Helper
  private readonly ray = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly held = new Set<string>()
  private readonly cleanups: (() => void)[] = []

  private labels: (LabelAnchor & { p: THREE.Vector3 })[] = []
  private labelsVisible = true
  /** Per tag layer: where its tags are drawn, and each tagged object's element */
  private readonly tags: Record<
    TagKind,
    /** keyed by the tagged item, or by `group:<name>` for a group's row */
    { layer: HTMLElement | null; els: Map<THREE.Object3D | string, HTMLElement> }
  > = {
    item: { layer: null, els: new Map() },
    zone: { layer: null, els: new Map() },
  }
  /** Kinds of item whose tags are hidden (see setHiddenTagTypes) */
  private hiddenTags = new Set<FurnitureType>()
  /** Whether groups' tags, and groups' ⓘ notes, are hidden (設定 → 標籤顯示 / 資訊顯示) */
  private hiddenGroupTags = false
  private hiddenGroupInfo = false
  /** A frame around each group whose members are all selected, in the group's tag colour */
  private readonly groupFrames = new Map<string, { box: THREE.Box3; helper: THREE.Box3Helper }>()
  /** Kinds of item whose ⓘ note buttons are hidden (see setHiddenInfoTypes) */
  private hiddenInfo = new Set<FurnitureType>()
  /** The item whose note (補充資訊) box is open from its ⓘ button */
  private infoOpen: THREE.Object3D | string | null = null
  /** An unselected zone under the pointer: a click selects it, a drag still pans the camera */
  private zoneClick: THREE.Object3D | null = null
  /**
   * A finger down on an item it hasn't selected (touch only): lifted soon without moving, it
   * selects the item; held still for HOLD_MS, it picks the item up to drag; moved first, the
   * camera has it. `last` is where the finger is now.
   */
  private press: {
    o: THREE.Object3D
    id: number
    x: number
    y: number
    last: PointerEvent
    timer: ReturnType<typeof setTimeout>
  } | null = null
  /** The kind the next tap on the stage places (phones pick it in the palette first) */
  private armed: FurnitureType | null = null
  /** Where that tap began, until it turns out to be a drag or a pinch instead */
  private armDown: { id: number; x: number; y: number } | null = null
  private selected: THREE.Object3D | null = null
  /** Items selected along with `selected` (Shift/⌘-click, or a Shift-drag box) */
  private readonly group = new Set<THREE.Object3D>()
  /** An outline for each item in `group` */
  private readonly groupBoxes = new Map<
    THREE.Object3D,
    { box: THREE.Box3; helper: THREE.Box3Helper }
  >()
  /**
   * A selection box being drawn on the stage (Shift-drag, or any drag in 多選 mode). A touch
   * one is `pending` until it moves: the camera also saw that finger go down, so a second
   * finger can still turn it into a pinch or orbit instead.
   */
  private marquee: {
    x0: number
    y0: number
    el: HTMLDivElement
    id: number
    pending: boolean
  } | null = null
  /** 多選 mode (see setMultiSelect) */
  private multi = false
  /** View mode turns this off: the camera still moves, but nothing can be placed or changed */
  private editable = true
  private snap = true
  private undoStack: string[] = []
  /** Steps undone, newest last; any new change clears them */
  private redoStack: string[] = []
  /** The redo steps a new change just cleared, kept in case that change is dropped (dropUndo) */
  private redoCleared: string[] = []
  /** A laptop's lid is being dragged open or shut with the slider (its undo step is taken) */
  private lidLive = false
  private drag: {
    o: THREE.Object3D
    dx: number
    dz: number
    moved: boolean
    /** people sitting on a dragged seat, carried along with it */
    riders?: Rider[]
    /** Dragging a multiple selection: every member (but posters) from where it started */
    group?: GroupMember[]
    /**
     * What a tap (no drag) on it does: 'toggle' takes it out of the selection (多選),
     * 'single' selects just it, 'keep' leaves the selection (it was just picked up as a group)
     */
    tap?: 'toggle' | 'single' | 'keep'
  } | null = null
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
  /** Other people's pointers, drawn over the stage (see setCursors) */
  private readonly cursors = new Map<
    string,
    { el: HTMLElement; label: HTMLElement; at: THREE.Vector3; to: THREE.Vector3 }
  >()
  private cursorLayer: HTMLDivElement | null = null
  /** When the pointer's place in the venue was last reported */
  private pointerAt = 0
  /** A pointer move held back by the throttle, reported when its turn comes (so the last one isn't lost) */
  private pointerLater: ReturnType<typeof setTimeout> | undefined
  private pointerLast: PointerEvent | null = null
  /** Someone's view the camera is following (see follow) */
  private following: { p: THREE.Vector3; t: THREE.Vector3 } | null = null
  /** Items other people have selected, by id (see setLocks) */
  private locks = new Map<string, Lock>()
  /** An outline in its holder's colour round each locked item */
  private readonly lockBoxes = new Map<
    string,
    { o: THREE.Object3D; color: string; box: THREE.Box3; helper: THREE.Box3Helper }
  >()
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
    scene.background = new THREE.Color(SCENE.light.background)
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
    const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 1.9))
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

    const grid = (this.grid = new THREE.GridHelper(
      90,
      180,
      SCENE.light.gridCenter,
      SCENE.light.grid,
    ))
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

    // the person taking the camera (drag, pinch, wheel) stops following anyone
    controls.addEventListener('start', () => this.stopFollowing())
    controls.addEventListener('change', () => this.cb.onCamera?.(this.cameraState()))

    this.bindEvents()
    this.resizeObserver = new ResizeObserver(this.fit)
    this.resizeObserver.observe(stageEl)
    this.fit()
    renderer.setAnimationLoop(this.tick)
  }

  dispose() {
    this.cancelPress()
    this.cursorLayer?.remove()
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

  /**
   * Take in other people's saved changes: these items as they now are, these ids removed. Not
   * an undo step of its own; instead every undo step takes them on (see history.ts), so undo
   * only ever puts back this person's own changes. Items being dragged or resized here are
   * left alone: this person's change wins once it's saved.
   */
  applyRemote(upserts: readonly LayoutItem[], deletes: readonly string[]) {
    if (!upserts.length && !deletes.length) return
    const byId = this.byId()
    const busy = new Set<THREE.Object3D>()
    if (this.drag) {
      busy.add(this.drag.o)
      for (const m of this.drag.group ?? []) busy.add(m.o)
    }
    if (this.resizing) busy.add(this.resizing.o)
    const sel = this.selection
    const next = [...sel]
    const taken: LayoutItem[] = []
    const gone = new Set<string>()
    for (const id of deletes) {
      const o = byId.get(id)
      if (o && busy.has(o)) continue
      gone.add(id)
      if (!o) continue
      this.placed.remove(o)
      const i = next.indexOf(o)
      if (i >= 0) next.splice(i, 1)
    }
    for (const item of upserts) {
      const old = byId.get(item.id!)
      if (old && busy.has(old)) continue
      if (old) this.placed.remove(old)
      const o = this.add(item)
      if (!o) continue
      taken.push(item)
      const i = old ? next.indexOf(old) : -1
      if (i >= 0) next[i] = o
    }
    this.rebaseHistory(taken, gone)
    if (next.length !== sel.length || next.some((o, i) => o !== sel[i])) this.setSelection(next)
    else if (this.selected) this.updSel()
    this.commit()
  }

  /** Move items to where someone else is dragging them (their save follows when they let go) */
  applyLive(moves: readonly LiveMove[]) {
    const byId = this.byId()
    let posts = false
    for (const m of moves) {
      const o = byId.get(m.id)
      if (!o || o === this.drag?.o || o === this.resizing?.o) continue
      o.position.set(m.x, m.y, m.z)
      o.rotation.y = m.r
      if (isPost(o)) posts = true
    }
    if (posts) this.updateBelts()
  }

  /**
   * Items other people have selected, by id, with who: they're outlined in that person's colour
   * and can't be picked here. Any of them selected here already is let go.
   */
  setLocks(locks: ReadonlyMap<string, Lock>) {
    this.locks = new Map(locks)
    const sel = this.selection
    const lost = sel.find((o) => this.lockOf(o))
    if (lost) {
      if (this.drag && sel.includes(this.drag.o)) this.endDrag()
      this.setSelection(sel.filter((o) => !this.lockOf(o)))
      this.cb.onToast(t().collab.taken(this.lockOf(lost)!.name))
    }
    this.syncLockBoxes()
  }

  undo() {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(this.snapshot())
    this.restore(s)
    this.cb.onToast(t().toast.undone)
  }

  redo() {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(this.snapshot())
    this.restore(s)
    this.cb.onToast(t().toast.redone)
  }

  /** Switch between edit mode and view-only mode. */
  setEditable(on: boolean) {
    this.editable = on
    if (on) return
    this.armPlace(null)
    this.cancelPress()
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

  /**
   * 多選 mode, for touch screens (no Shift key): a tap adds an item to the selection or takes
   * it out, and a drag on empty space draws a selection box instead of panning.
   */
  setMultiSelect(on: boolean) {
    this.multi = on
  }

  setWallsCut(on: boolean) {
    this.archi.wallsG.scale.y = on ? 0.28 : 1
  }

  /** Light or dark around the building: the background and the grid (the page's theme) */
  setDark(on: boolean) {
    const c = on ? SCENE.dark : SCENE.light
    ;(this.scene.background as THREE.Color).set(c.background)
    this.grid.geometry.dispose()
    const fresh = new THREE.GridHelper(90, 180, c.gridCenter, c.grid)
    this.grid.geometry = fresh.geometry
    fresh.material.dispose()
  }

  /** Turn the sun's shadows on or off (off is lighter on slow devices) */
  setShadows(on: boolean) {
    this.sun.castShadow = on
  }

  /** The element a tag system is drawn into (one child per tagged object). */
  setTagLayer(kind: TagKind, el: HTMLElement | null) {
    const t = this.tags[kind]
    t.els.forEach((e) => e.remove())
    t.els.clear()
    t.layer = el
  }

  /** Hide the tags of every placed item of these kinds (the tags themselves are kept). */
  setHiddenTagTypes(types: readonly FurnitureType[]) {
    this.hiddenTags = new Set(types)
  }

  /** Show or hide groups' tags and groups' ⓘ notes (both are kept). */
  setGroupLabelsVisible({ tags, info }: { tags?: boolean; info?: boolean }) {
    if (tags !== undefined) this.hiddenGroupTags = !tags
    if (info !== undefined) this.hiddenGroupInfo = !info
  }

  /** Hide the ⓘ note buttons of every placed item of these kinds (the notes are kept). */
  setHiddenInfoTypes(types: readonly FurnitureType[]) {
    this.hiddenInfo = new Set(types)
  }

  /** Change the selected zone's size (metres, on the zone grid, about its centre) and/or colour. */
  setZone({ w, d, color }: { w?: number; d?: number; color?: string }) {
    const s = this.selected
    if (!s || !isZone(s)) return
    const w0 = s.userData.w as number
    const d0 = s.userData.d as number
    const c0 = (s.userData.color as string | undefined) ?? ZONE_COLOR
    const w1 = w === undefined ? w0 : clampZone(w, w0)
    const d1 = d === undefined ? d0 : clampZone(d, d0)
    const c1 = color && isHexColor(color) ? color.toLowerCase() : c0
    if (w1 === w0 && d1 === d0 && c1 === c0) return
    this.pushUndo()
    applyZone(s, { w: w1, d: d1, color: c1 })
    this.updSel()
    this.commit()
  }

  /** Change how many figures the selected 人員 item shows, and/or their colour. */
  setPeople({ n, color }: { n?: number; color?: string }) {
    const s = this.selected
    if (!s || s.userData.type !== 'person') return
    const n0 = (s.userData.n as number | undefined) ?? 1
    const c0 = (s.userData.color as string | undefined) ?? PERSON_COLOR
    // someone sitting is always one person
    const n1 = s.userData.sit ? 1 : n === undefined ? n0 : clampPeople(n)
    const c1 = color && isHexColor(color) ? color.toLowerCase() : c0
    if (n1 === n0 && c1 === c0) return
    this.pushUndo()
    applyPeople(s, n1, c1, !!s.userData.sit)
    this.updSel()
    this.commit()
  }

  /** Name the selected item; an empty tag removes it. */
  setTag(tag: string) {
    const s = this.selected
    if (!s) return
    const t = cleanTag(tag)
    if ((s.userData.tag ?? '') === t) return
    this.pushUndo()
    if (t) s.userData.tag = t
    else delete s.userData.tag
    this.updSel()
    this.commit()
  }

  /**
   * Count items toward the rental total or leave them out: the ones at these layout indices
   * (as in `serialize()`), or the selected item. One undo step for the lot.
   */
  setBilled(on: boolean, indices?: readonly number[]) {
    const list = indices
      ? indices.flatMap((k) => this.placed.children[k] ?? [])
      : this.selected
        ? [this.selected]
        : []
    const change = list.filter((o) => !o.userData.unbilled !== on)
    if (!change.length) return
    this.pushUndo()
    for (const o of change)
      if (on) delete o.userData.unbilled
      else o.userData.unbilled = true
    if (this.selected) this.updSel()
    this.commit()
  }

  /**
   * Fly to the item at this layout index, keeping the way the camera looks but coming in
   * close enough to see it; in edit mode it is selected too (unless it is hidden).
   */
  focusItem(index: number) {
    const o = this.placed.children[index]
    if (!o) return
    const target = o.position.clone()
    const back = this.camera.position.clone().sub(this.controls.target)
    const dist = THREE.MathUtils.clamp(back.length(), 5, 14)
    this.fly = {
      t0: performance.now(),
      p0: this.camera.position.clone(),
      g0: this.controls.target.clone(),
      p1: target.clone().add(back.setLength(dist)),
      g1: target,
    }
    if (this.editable && o.visible) this.select(o)
  }

  /** Give the selected item a note (補充資訊); an empty one removes it. */
  setInfo(info: string) {
    const s = this.selected
    if (!s) return
    const t = cleanInfo(info)
    if ((s.userData.info ?? '') === t) return
    this.pushUndo()
    if (t) s.userData.info = t
    else delete s.userData.info
    this.updSel()
    this.commit()
  }

  /** Colour the selected item's tag (#rrggbb); people and zones use their own colour instead. */
  setTagColor(color: string) {
    const s = this.selected
    if (!s || !ownTagColor(s) || !isHexColor(color)) return
    const c = color.toLowerCase()
    if (((s.userData.tagColor as string | undefined) ?? TAG_COLOR) === c) return
    this.pushUndo()
    s.userData.tagColor = c
    this.updSel()
    this.commit()
  }

  /**
   * Hide every placed item of these kinds (hidden stanchions take their belts with them).
   * Hidden items stay in the layout but can't be picked, and one that is selected is let go.
   */
  setHiddenTypes(types: readonly FurnitureType[]) {
    this.hidden = new Set(types)
    for (const o of this.placed.children)
      if (o !== this.placing?.obj) o.visible = !this.hidden.has(o.userData.type as FurnitureType)
    this.belts.visible = !this.hidden.has('stanchion')
    if (this.selection.some((o) => !o.visible))
      this.setSelection(this.selection.filter((o) => o.visible))
  }

  setLabelsVisible(on: boolean) {
    this.labelsVisible = on
  }

  setLabels(anchors: LabelAnchor[]) {
    this.labels = anchors.map((a) => ({ ...a, p: new THREE.Vector3(...a.pos) }))
  }

  /**
   * Show other people's pointers where they are in the venue, each an arrow in their colour with
   * their name; they glide there rather than jump.
   */
  setCursors(list: readonly RemoteCursor[]) {
    const keep = new Set(list.map((c) => c.key))
    for (const [k, c] of this.cursors)
      if (!keep.has(k)) {
        c.el.remove()
        this.cursors.delete(k)
      }
    if (list.length && !this.cursorLayer) {
      const layer = (this.cursorLayer = document.createElement('div'))
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: '1',
      })
      this.stageEl.append(layer)
    }
    for (const c of list) {
      let e = this.cursors.get(c.key)
      if (!e) {
        const el = document.createElement('div')
        Object.assign(el.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          willChange: 'transform',
        })
        el.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 18 18" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))"><path d="M2 1.5 15.5 8 9 9.6 6.6 16Z" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="position:absolute;left:14px;top:14px;padding:2px 7px;border-radius:9px;color:#fff;font:600 11px/1.4 system-ui,sans-serif;white-space:nowrap"></span>'
        const label = el.querySelector('span')!
        this.cursorLayer!.append(el)
        const p = new THREE.Vector3(...c.point)
        e = { el, label, at: p.clone(), to: p }
        this.cursors.set(c.key, e)
      }
      e.to.set(...c.point)
      e.el.querySelector('path')!.setAttribute('fill', c.color)
      e.label.style.background = c.color
      e.label.textContent = c.name
    }
  }

  /** Where the camera is and what it looks at, to the centimetre */
  cameraState(): CameraState {
    const r = (v: THREE.Vector3): Vec3 => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]
    return { p: r(this.camera.position), t: r(this.controls.target) }
  }

  /**
   * Keep the camera gliding after someone else's view (null: stop). Moving the camera here
   * stops it, and onFollowEnd says so.
   */
  follow(cam: CameraState | null) {
    this.following = cam ? { p: new THREE.Vector3(...cam.p), t: new THREE.Vector3(...cam.t) } : null
    if (cam) this.fly = null
  }

  private stopFollowing() {
    if (!this.following) return
    this.following = null
    this.cb.onFollowEnd?.()
  }

  flyTo(view: CameraView) {
    this.stopFollowing()
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

  /**
   * The camera for a picture of the venue from the current viewing direction: it keeps the way
   * the view faces but stands back until the whole building is in view, and is cropped to the
   * building's outermost edges on screen, `padding` pixels clear of them on every side. The
   * building fills `size` pixels along its longer side. Gives the camera and the picture's size.
   */
  private imageFrame(padding: number, size: number) {
    const cam = this.camera.clone()
    cam.aspect = 1
    cam.clearViewOffset()
    // the building's corners: each wall's, floor's, step's and column's box, in the world
    const pts: THREE.Vector3[] = []
    for (const g of [this.archi.arch, this.archi.wallsG]) {
      g.updateMatrixWorld(true)
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox as THREE.Box3
        for (let i = 0; i < 8; i++)
          pts.push(
            new THREE.Vector3(
              i & 1 ? bb.max.x : bb.min.x,
              i & 2 ? bb.max.y : bb.min.y,
              i & 4 ? bb.max.z : bb.min.z,
            ).applyMatrix4(o.matrixWorld),
          )
      })
    }
    // stand back along the view until the whole building is in front and within the view
    const sphere = new THREE.Sphere().setFromPoints(pts)
    const back = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) + 1
    const dir = this.camera.getWorldDirection(new THREE.Vector3())
    cam.position.copy(sphere.center).addScaledVector(dir, -back)
    cam.near = Math.max(0.1, back - sphere.radius - 1)
    cam.far = back + sphere.radius + 1
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    // where the building reaches on screen, then a view cropped to just that (and the padding)
    const nd = new THREE.Box2()
    for (const p of pts) {
      const q = p.project(cam)
      nd.expandByPoint(new THREE.Vector2(q.x, q.y))
    }
    const k = size / Math.max(nd.max.x - nd.min.x, nd.max.y - nd.min.y) // pixels per NDC unit
    const pad = Math.max(0, Math.round(padding))
    const width = Math.round((nd.max.x - nd.min.x) * k) + 2 * pad
    const height = Math.round((nd.max.y - nd.min.y) * k) + 2 * pad
    cam.setViewOffset(
      2 * k,
      2 * k,
      (nd.min.x + 1) * k - pad,
      (1 - nd.max.y) * k - pad,
      width,
      height,
    )
    return { cam, width, height }
  }

  /**
   * A PNG of the venue from the current viewing direction, cropped to the building with
   * `padding` pixels round it (see imageFrame). Pass a smaller `size` for a preview; its
   * padding (and its tags and labels) are scaled to match, so it looks like the full picture.
   * The room labels and tags showing on the stage are drawn over it (imageLabels.ts);
   * selection outlines, handles and the grid are left out. It takes the page's theme.
   */
  exportImage({ padding = 40, size = IMAGE_SIZE } = {}) {
    const { cam, width, height } = this.imageFrame((padding * size) / IMAGE_SIZE, size)
    // render at that size on the stage's own canvas, read it back, and put everything back
    const { renderer, scene } = this
    const hide = scene.children.filter(
      (o) => o.visible && (o instanceof THREE.Box3Helper || o === this.grid || o === this.handles),
    )
    hide.forEach((o) => (o.visible = false))
    const ratio = renderer.getPixelRatio()
    const was = renderer.getSize(new THREE.Vector2())
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.render(scene, cam)
    // copy the picture while the canvas still holds it, then draw the tags and labels over it
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')!
    ctx.drawImage(renderer.domElement, 0, 0)
    drawLabels(ctx, size / LABEL_SIZE, ...this.imageMarks(cam, width, height))
    const url = out.toDataURL('image/png')
    renderer.setPixelRatio(ratio)
    renderer.setSize(was.x, was.y, false)
    hide.forEach((o) => (o.visible = true))
    renderer.render(scene, this.camera)
    return url
  }

  /**
   * The room labels and tags showing on the stage, placed for a picture taken with `cam`
   * (width × height pixels). Tags shown only as an ⓘ, and open notes, are left out.
   */
  private imageMarks(cam: THREE.Camera, width: number, height: number) {
    const px = (p: THREE.Vector3) => {
      const v = p.clone().project(cam)
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
    }
    const labels: LabelMark[] = this.labelsVisible
      ? this.labels.map((l) => ({ ...px(l.p), offset: l.offset, face: l.face() }))
      : []
    const tags: TagMark[] = []
    for (const kind of ['zone', 'item'] as const)
      for (const { p, tag, c } of this.tagRows(kind))
        if (tag)
          tags.push({ kind, ...px(p), text: tag, fill: c, ink: isLight(c) ? '#1f2126' : '#fff' })
    return [labels, tags] as const
  }

  /** The full picture's size in pixels with this padding (see exportImage) */
  imageSize(padding: number) {
    const { width, height } = this.imageFrame(padding, IMAGE_SIZE)
    return { width, height }
  }

  rotate(deg: number) {
    const s = this.selected
    if (!s) return
    // several selected: they turn together, round the middle of the selection
    if (this.group.size) return this.rotateGroup(deg)
    if (onWall(s)) return
    this.pushUndo()
    const riders = this.ridersOf(s)
    s.rotation.y += THREE.MathUtils.degToRad(deg)
    this.carry(s, riders)
    this.updSel()
    this.commit()
  }

  duplicate() {
    const s = this.selected
    if (!s) return
    if (this.group.size) return this.duplicateGroup()
    this.pushUndo()
    const type = s.userData.type as FurnitureType
    const item = this.itemOf(s)
    let o: THREE.Object3D | null
    if (onTable(s)) {
      const spot = this.freeTraySpot(s)
      if (!spot) {
        this.dropUndo()
        this.cb.onToast(t().toast.tableFull(nameOf(type)))
        return
      }
      o = this.add({ ...item, id: undefined, x: spot.x, y: spot.y, z: spot.z })
    } else if (onWall(s)) {
      // next to it along the wall, same height
      const off = new THREE.Vector3((item.w ?? 0) + 0.1, 0, 0).applyAxisAngle(UP, s.rotation.y)
      o = this.add({ ...item, id: undefined, x: s.position.x + off.x, z: s.position.z + off.z })
    } else {
      // a group of people is wider than one: step past its whole width
      const n = (s.userData.n as number | undefined) ?? 1
      const step =
        type === 'person'
          ? Math.min(n, 3) * 0.55 + 0.1
          : isZone(s)
            ? (s.userData.w as number) + 0.25
            : FURNITURE[type].arr[0]
      const off = new THREE.Vector3(step, 0, 0).applyAxisAngle(UP, s.rotation.y)
      o = this.add({
        ...item,
        id: undefined,
        x: this.sn(s.position.x + off.x),
        y: undefined,
        z: this.sn(s.position.z + off.z),
        cut: undefined,
        sit: undefined,
      })
      // a copied person takes the next seat if there is one
      if (o) this.settle(o)
    }
    this.select(o)
    this.commit()
  }

  /** Delete the selected item, or every selected item. */
  remove() {
    const all = this.selection
    if (!all.length) return
    this.pushUndo()
    for (const s of all) {
      const riders = this.ridersOf(s)
      this.placed.remove(s)
      // people get up; trays go with their table
      for (const r of riders) {
        if (onTable(r.o)) this.placed.remove(r.o)
        else this.standUp(r.o)
      }
    }
    this.select(null)
    this.commit()
  }

  /** The group every selected item is in, if they share one, with its tag, colour and note */
  private sharedGroup(): Pick<SelectionInfo, 'group' | 'groupTag' | 'groupColor' | 'groupInfo'> {
    const names = new Set(this.selection.map((o) => o.userData.group as string | undefined))
    const [g] = names
    if (names.size !== 1 || !g) return {}
    const m = this.groupMeta(g)
    return { group: g, groupTag: m.tag ?? '', groupColor: m.color, groupInfo: m.info ?? '' }
  }

  /**
   * A group's tag, tag colour and note. Every member carries them; should they differ (after
   * a merge), the first member that has one wins.
   */
  private groupMeta(name: string) {
    let tag: string | undefined
    let color: string | undefined
    let info: string | undefined
    for (const o of this.placed.children) {
      if (o.userData.group !== name) continue
      tag ??= o.userData.groupTag as string | undefined
      color ??= o.userData.groupColor as string | undefined
      info ??= o.userData.groupInfo as string | undefined
    }
    return { tag, color: color ?? TAG_COLOR, info }
  }

  /** Every group with members on show, and those members */
  private groupsShown() {
    const out = new Map<string, THREE.Object3D[]>()
    for (const o of this.placed.children) {
      const g = o.userData.group as string | undefined
      if (g && o.visible) out.set(g, [...(out.get(g) ?? []), o])
    }
    return out
  }

  /** Set the shared group's tag, colour or note on all of its members (one undo step) */
  private setGroupMeta(key: 'groupTag' | 'groupColor' | 'groupInfo', value: string) {
    const g = this.sharedGroup().group
    if (!g) return
    const members = this.placed.children.filter((o) => o.userData.group === g)
    if (members.every((o) => (o.userData[key] ?? '') === value)) return
    this.pushUndo()
    for (const o of members)
      if (value) o.userData[key] = value
      else delete o.userData[key]
    this.updSel()
    this.commit()
  }

  /** Tag the selected group; an empty tag removes it. */
  setGroupTag(tag: string) {
    this.setGroupMeta('groupTag', cleanTag(tag))
  }

  /** Colour the selected group's tag, and its frame when it is selected (#rrggbb). */
  setGroupColor(color: string) {
    if (isHexColor(color)) this.setGroupMeta('groupColor', color.toLowerCase())
  }

  /** Give the selected group a note; an empty one removes it. */
  setGroupInfo(info: string) {
    this.setGroupMeta('groupInfo', cleanInfo(info))
  }

  /**
   * Frame each group whose shown members are all selected, in its tag colour, and let its
   * members go without their own outlines while it is. Run every frame.
   */
  private updGroupFrames() {
    const sel = new Set(this.selection)
    const whole = new Map<string, THREE.Object3D[]>()
    if (sel.size > 1)
      for (const [name, members] of this.groupsShown())
        if (members.length > 1 && members.every((o) => sel.has(o))) whole.set(name, members)
    for (const [name, { helper }] of this.groupFrames)
      if (!whole.has(name)) {
        this.scene.remove(helper)
        helper.dispose()
        this.groupFrames.delete(name)
      }
    const framed = new Set([...whole.values()].flat())
    for (const [name, members] of whole) {
      let f = this.groupFrames.get(name)
      if (!f) {
        const box = new THREE.Box3()
        const helper = new THREE.Box3Helper(box)
        ;(helper.material as THREE.Material).depthTest = false
        helper.renderOrder = 999
        this.scene.add(helper)
        f = { box, helper }
        this.groupFrames.set(name, f)
      }
      f.box.makeEmpty()
      for (const o of members) f.box.expandByObject(o)
      f.box.expandByScalar(0.12)
      ;(f.helper.material as THREE.LineBasicMaterial).color.set(this.groupMeta(name).color)
    }
    this.selHelper.visible = !!this.selected && !framed.has(this.selected)
    for (const [o, { helper }] of this.groupBoxes) helper.visible = !framed.has(o)
  }

  /** Put the selected items into a new group (群組), named 群組 1, 群組 2… */
  makeGroup() {
    const all = this.selection
    if (all.length < 2) return
    const used = new Set(this.placed.children.map((o) => o.userData.group as string | undefined))
    let n = 1
    while (used.has(t().grouping.defaultName(n))) n++
    this.pushUndo()
    for (const o of all) {
      o.userData.group = t().grouping.defaultName(n)
      // a new group starts with no tag or note of its own
      for (const k of ['groupTag', 'groupColor', 'groupInfo']) delete o.userData[k]
    }
    this.updSel()
    this.commit()
  }

  /** Take the selected items out of their groups (the whole group, when it is all selected) */
  ungroup() {
    const all = this.selection.filter((o) => o.userData.group)
    if (!all.length) return
    this.pushUndo()
    for (const o of all)
      for (const k of ['group', 'groupTag', 'groupColor', 'groupInfo']) delete o.userData[k]
    this.updSel()
    this.commit()
  }

  /**
   * Rename the group the selected items share. False (and nothing changes) when the name is
   * empty or another group already has it.
   */
  renameGroup(name: string) {
    const from = this.sharedGroup().group
    const to = cleanTag(name)
    if (!from || !to || to === from) return false
    if (this.placed.children.some((o) => o.userData.group === to)) return false
    this.pushUndo()
    for (const o of this.placed.children) if (o.userData.group === from) o.userData.group = to
    this.updSel()
    this.commit()
    return true
  }

  /**
   * Copy every selected item beside the selection, to the right on screen (along the nearest
   * world axis), clear of it and on the grid; the copies keep their places around each other
   * and become the selection. People on a copied seat and things on a copied table come too;
   * a copied group gets a new name (報到區 2). Posters, and table-top things with no table at
   * their new spot, are left out.
   */
  private duplicateGroup() {
    const all = this.selection
    const ax = this.screenAxis('ArrowRight')
    if (!all.length || !ax) return
    const box = new THREE.Box3()
    for (const o of all) box.expandByObject(o)
    const span = ax.x ? box.max.x - box.min.x : box.max.z - box.min.z
    const step = Math.ceil((span + 0.5) / 0.25) * 0.25
    const [ox, oz] = [ax.x * step, ax.z * step]
    // each copied group gets the next free name after its own
    const used = new Set(this.placed.children.map((o) => o.userData.group as string | undefined))
    const renamed = new Map<string, string>()
    for (const o of all) {
      const g = o.userData.group as string | undefined
      if (!g || renamed.has(g)) continue
      let n = 2
      while (used.has(t().grouping.copyName(g, n))) n++
      used.add(t().grouping.copyName(g, n))
      renamed.set(g, t().grouping.copyName(g, n))
    }
    this.pushUndo()
    const copies: THREE.Object3D[] = []
    let skipped = 0
    // floor things first, so table-top copies find the copied tables under them
    for (const o of [...all.filter((o) => !onTable(o)), ...all.filter(onTable)]) {
      if (onWall(o)) {
        skipped++
        continue
      }
      const item = this.itemOf(o)
      const [x, z] = [item.x + ox, item.z + oz]
      const y = onTable(o)
        ? this.tableTopAt(x, z)
        : (item.y ?? 0) + this.floorY(x, z) - this.floorY(item.x, item.z)
      if (y === null) {
        skipped++
        continue
      }
      const c = this.add({
        ...item,
        id: undefined,
        x,
        y,
        z,
        group: item.group && renamed.get(item.group),
      })
      if (!c) continue
      // a seated copy takes the copied seat under it (or stands up if there is none)
      this.settle(c)
      copies.push(c)
    }
    this.setSelection(copies)
    this.commit()
    if (skipped) this.cb.onToast(t().toast.copySkipped(skipped))
  }

  /** Deselect everything. */
  clearSelection() {
    this.select(null)
  }

  /** Repeat the selected object `cols` to its right and `rows` behind it. */
  arrayFromSelected({ cols, rows, dx, dz }: ArrayOptions) {
    const s = this.selected
    if (!s || onWall(s) || onTable(s)) return
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
        const o = this.add({
          ...this.itemOf(s),
          id: undefined,
          x: s.position.x + v.x,
          y: undefined,
          z: s.position.z + v.z,
          cut: undefined,
          sit: undefined,
        })
        if (o) this.settle(o)
      }
    this.commit()
    this.cb.onToast(t().toast.arrayed(cols * rows - 1, nameOf(type), cols, rows))
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

  /**
   * Open the selected laptop's lid to `deg`. While a slider is dragged (`live`) the lid
   * follows it with one undo step taken at the start; the change is committed when it ends.
   */
  setLidAngle(deg: number, live = false) {
    const s = this.selected
    if (!s || s.userData.type !== 'laptop') return
    deg = clampLid(deg)
    const was = (s.userData.open as number | undefined) ?? LID_OPEN
    if (!this.lidLive) {
      if (deg === was && !live) return
      this.pushUndo()
    }
    this.lidLive = live
    setLaptopOpen(s, deg)
    this.updSel()
    if (!live) this.commit()
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
    this.cb.onToast(t().toast.beltsRestored)
  }

  /**
   * Arm a kind to place with the next tap on the stage, where the tap lands (null disarms):
   * how phones add items, the palette covering the stage. Dragging or pinching meanwhile still
   * moves the camera, to find the spot first.
   */
  armPlace(type: FurnitureType | null) {
    if (type && !this.editable) return
    this.armed = type
    this.armDown = null
    if (type) this.setSelection([])
    // the floor grid a floor item lands on
    this.grid.visible = !!type && !isWallItem(type) && !onTableOnly(type)
    this.cb.onArmed?.(type)
  }

  /** Put the armed kind down where the tap was: on the floor, a wall or a table top */
  private placeArmed(e: PointerEvent) {
    const type = this.armed
    if (!type) return
    const o = buildFurniture(type)
    // a new person or laptop turns toward the view
    if (facesViewer(type)) o.rotation.y = this.facingView()
    this.placed.add(o)
    let ok: boolean
    if (onWall(o)) {
      const hit = this.wallHit(e)
      if (hit) this.hangOn(o, hit.point, hit.normal)
      ok = !!hit
    } else if (onTable(o)) ok = this.putOnTable(o, e)
    else {
      const p = this.floorHit(e)
      if (p) {
        this.moveTo(o, p.x, p.z)
        // a seat put down beside a table turns to it
        if (seatOf(o)) o.rotation.y = this.facingTable(o) ?? 0
        this.settle(o)
      }
      ok = !!p
    }
    this.placed.remove(o)
    if (!ok) {
      // still armed, for another try
      const name = nameOf(type)
      this.cb.onToast(
        onWall(o)
          ? t().place.missWall(name)
          : onTable(o)
            ? t().toast.tableOnly(name)
            : t().place.missFloor(name),
      )
      return
    }
    // the undo snapshot is without it
    this.pushUndo()
    this.placed.add(o)
    this.armPlace(null)
    this.select(o)
    this.commit()
  }

  /** A finger came down on an item it hasn't selected: see `press` */
  private startPress(e: PointerEvent, o: THREE.Object3D) {
    this.cancelPress()
    this.press = {
      o,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      last: e,
      timer: setTimeout(() => this.hold(), HOLD_MS),
    }
  }

  private cancelPress() {
    if (this.press) clearTimeout(this.press.timer)
    this.press = null
  }

  /** Held still long enough: pick the item up, so the finger drags it rather than the camera */
  private hold() {
    const p = this.press
    this.press = null
    if (!p || !this.editable) return
    const lock = this.lockOf(p.o)
    if (lock) {
      this.cb.onToast(t().collab.locked(lock.name))
      return
    }
    // a short buzz where the device has one: it's in hand now
    navigator.vibrate?.(15)
    this.grab(p.last, p.o)
  }

  /**
   * Take hold of an item under the pointer to drag it: a grouped one picks up its whole group,
   * one of several selected moves them all, anything else is selected and dragged alone
   */
  private grab(e: PointerEvent, o: THREE.Object3D) {
    if (o.userData.group && !this.selection.includes(o)) {
      // a grouped item picks up its whole group; a second click then selects just it
      this.setSelection(this.withGroup(o))
      if (!onWall(o) && !onTable(o)) this.startGroupDrag(e, o, 'keep')
      return
    }
    if (this.group.size && this.selection.includes(o) && !onWall(o) && !onTable(o)) {
      // grabbing one of several selected items moves them all
      this.startGroupDrag(e, o, 'single')
      return
    }
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
      this.drag = {
        o,
        dx: o.position.x - p.x,
        dz: o.position.z - p.z,
        moved: false,
        riders: this.ridersOf(o),
      }
    }
    this.controls.enabled = false
    this.canvas.style.cursor = 'grabbing'
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
          // a new person or laptop turns toward the view
          if (facesViewer(type)) pl.obj.rotation.y = this.facingView()
          this.placed.add(pl.obj)
          this.grid.visible = true
        }
        if (onWall(pl.obj)) {
          const hit = this.wallHit(ev)
          if (hit) this.hangOn(pl.obj, hit.point, hit.normal)
          pl.obj.visible = !!hit
        } else if (onTable(pl.obj)) {
          // a tray only shows (and can only be dropped) over a table top
          pl.obj.visible = this.putOnTable(pl.obj, ev)
        } else {
          const p = this.floorHit(ev)
          if (p) {
            this.moveTo(pl.obj, p.x, p.z)
            // a seat dropped beside a table turns to it
            if (seatOf(pl.obj)) pl.obj.rotation.y = this.facingTable(pl.obj) ?? 0
            this.settle(pl.obj)
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
        if (onTableOnly(type)) {
          // dragged somewhere without a table, or clicked: try the table in the middle of the view
          this.ray.setFromCamera(this.ndc.set(0, 0), this.camera)
          const p = clicked ? this.tableSpotOnRay() : null
          if (!p) {
            this.cb.onToast(t().toast.tableOnly(nameOf(type)))
            return
          }
          this.pushUndo()
          const r = facesViewer(type) ? this.facingView() : 0
          const o = this.add({ t: type, x: p.x, y: p.y, z: p.z, r })
          this.select(o)
          this.commit()
          this.cb.onToast(t().toast.onCentreTable(nameOf(type)))
        } else if (clicked && isWallItem(type)) {
          // hang it on whatever wall is in the middle of the view
          this.ray.setFromCamera(this.ndc.set(0, 0), this.camera)
          const hit = this.wallHitFromRay()
          if (!hit) {
            this.cb.onToast(t().toast.dragToWall(nameOf(type)))
            return
          }
          this.pushUndo()
          const o = buildFurniture(type)
          this.placed.add(o)
          this.hangOn(o, hit.point, hit.normal)
          this.select(o)
          this.commit()
          this.cb.onToast(t().toast.onCentreWall(nameOf(type)))
        } else if (clicked) {
          this.pushUndo()
          const aim = this.controls.target
          const r = facesViewer(type) ? this.facingView() : 0
          const o = this.add({ t: type, x: this.sn(aim.x), z: this.sn(aim.z), r })
          if (o && seatOf(o)) o.rotation.y = this.facingTable(o) ?? r
          if (o) this.settle(o)
          this.select(o)
          this.commit()
          this.cb.onToast(t().toast.atCentre(nameOf(type)))
        }
      }
    }
    addEventListener('pointermove', mv)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', cancel)
  }

  // ---------------- Internals ----------------

  /**
   * The right angle (0°, 90°, 180° or 270°) that best points a piece's front (+z) back toward
   * the viewer, so people and laptops face the camera yet stay square to the grid. Looking
   * straight down, the front is the bottom of the screen.
   */
  private facingView() {
    const back = this.camera.getWorldDirection(new THREE.Vector3()).negate().setY(0)
    if (back.lengthSq() < 0.01)
      back.copy(this.camera.up).applyQuaternion(this.camera.quaternion).negate()
    const step = Math.PI / 2
    const r = Math.round(Math.atan2(back.x, back.z) / step) * step
    return r < 0 ? r + Math.PI * 2 : Math.abs(r)
  }

  /**
   * The turn that points seat `o`'s front (+z) at the nearest table within TABLE_REACH of it:
   * square on to a rectangular top's nearest side, or at a round top's centre. Null when no
   * table is that close.
   */
  private facingTable(o: THREE.Object3D) {
    const { x, z } = o.position
    let aim: THREE.Vector3 | null = null
    let bestD = TABLE_REACH
    for (const t of this.placed.children) {
      const top = tableOf(t)
      if (!top || !t.visible || t === o) continue
      t.updateMatrixWorld()
      const l = t.worldToLocal(new THREE.Vector3(x, t.position.y, z))
      const edge = new THREE.Vector3(
        THREE.MathUtils.clamp(l.x, -top.w / 2, top.w / 2),
        l.y,
        THREE.MathUtils.clamp(l.z, -top.d / 2, top.d / 2),
      )
      const d = top.round
        ? Math.max(0, Math.hypot(l.x, l.z) - top.w / 2)
        : Math.hypot(l.x - edge.x, l.z - edge.z)
      if (d >= bestD) continue
      bestD = d
      // under a rectangular top (or at a round one) the centre is the only sensible aim
      aim = t.localToWorld(top.round || d === 0 ? new THREE.Vector3(0, l.y, 0) : edge)
    }
    if (!aim) return null
    const [dx, dz] = [aim.x - x, aim.z - z]
    return dx * dx + dz * dz < 1e-6 ? null : Math.atan2(dx, dz)
  }

  /** Place an item; with no `y` it is dropped onto the floor below (x, z). */
  private add({
    id,
    t,
    x,
    y,
    z,
    r,
    v,
    cut,
    w,
    h,
    d,
    img,
    lock,
    tag,
    tagColor,
    info,
    unbilled,
    group,
    groupTag,
    groupColor,
    groupInfo,
    n,
    color,
    sit,
    open,
  }: LayoutItem) {
    if (!isFurnitureType(t)) return null
    const o = buildFurniture(t, v, w && h ? { w, h } : undefined)
    o.position.set(x, y ?? this.floorY(x, z), z)
    o.rotation.y = r
    // copies are passed without one, so they get their own
    o.userData.id = id ?? crypto.randomUUID()
    if (cut?.length) o.userData.cut = [...cut]
    if (w && h) applyPoster(o, { w, h, img })
    else if (img) setFaceImage(o, img)
    if (lock) o.userData.lock = true
    if (tag) o.userData.tag = tag
    if (tagColor) o.userData.tagColor = tagColor
    if (info) o.userData.info = info
    if (unbilled) o.userData.unbilled = true
    if (group) o.userData.group = group
    if (groupTag) o.userData.groupTag = groupTag
    if (groupColor) o.userData.groupColor = groupColor
    if (groupInfo) o.userData.groupInfo = groupInfo
    if (t === 'person' && (n || color || sit)) applyPeople(o, n, color, sit)
    if (t === 'zone' && w && d) applyZone(o, { w, d, color })
    if (t === 'laptop' && open !== undefined) setLaptopOpen(o, open)
    o.visible = !this.hidden.has(t)
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
    // Objects built straight from the palette (dragged in, or hung on a wall with a click) skip
    // add(): they get their id the first time they're written out, and keep it from then on
    ud.id ??= crypto.randomUUID()
    const cut = ud.cut as number[] | undefined
    return {
      id: ud.id as string,
      t: ud.type as FurnitureType,
      x: +o.position.x.toFixed(3),
      y: +o.position.y.toFixed(3),
      z: +o.position.z.toFixed(3),
      r: +o.rotation.y.toFixed(4),
      ...(ud.variant ? { v: ud.variant as string } : {}),
      ...(cut?.length ? { cut: cut.map((c) => +c.toFixed(3)) } : {}),
      ...(ud.tag ? { tag: ud.tag as string } : {}),
      ...(ud.tagColor ? { tagColor: ud.tagColor as string } : {}),
      ...(ud.info ? { info: ud.info as string } : {}),
      ...(ud.unbilled ? { unbilled: true } : {}),
      ...(ud.group ? { group: ud.group as string } : {}),
      ...(ud.group && ud.groupTag ? { groupTag: ud.groupTag as string } : {}),
      ...(ud.group && ud.groupColor ? { groupColor: ud.groupColor as string } : {}),
      ...(ud.group && ud.groupInfo ? { groupInfo: ud.groupInfo as string } : {}),
      ...(ud.n ? { n: ud.n as number } : {}),
      ...(ud.color ? { color: ud.color as string } : {}),
      ...(ud.sit ? { sit: true } : {}),
      ...(ud.open !== undefined ? { open: ud.open as number } : {}),
      ...(isZone(o) ? { w: ud.w as number, d: ud.d as number } : {}),
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

  /** Where someone sits on `chair`, in world space */
  private seatPoint(chair: THREE.Object3D) {
    const s = seatOf(chair)!
    chair.updateMatrixWorld()
    return chair.localToWorld(new THREE.Vector3(0, s.y, s.z))
  }

  /** People sitting on `seat`, with their place in its frame */
  /** What rides on `base`: the person sitting on a seat, or the trays standing on a table */
  private ridersOf(base: THREE.Object3D): Rider[] {
    const rider = (o: THREE.Object3D): Rider => ({
      o,
      local: base.worldToLocal(o.position.clone()),
      turn: o.rotation.y - base.rotation.y,
    })
    if (seatOf(base)) {
      const p = this.seatPoint(base)
      return this.placed.children
        .filter((o) => o.userData.sit && o.position.distanceTo(p) < 0.03)
        .map(rider)
    }
    const top = tableOf(base)
    if (!top) return []
    base.updateMatrixWorld()
    return this.placed.children
      .filter((o) => {
        if (!onTable(o)) return false
        const l = base.worldToLocal(o.position.clone())
        return (
          Math.abs(l.y - top.y) < 0.02 && Math.abs(l.x) <= top.w / 2 && Math.abs(l.z) <= top.d / 2
        )
      })
      .map(rider)
  }

  /** The table top point under the current ray (the nearest along it), where a tray can stand */
  private tableSpotOnRay() {
    let best: THREE.Vector3 | null = null
    let bestD = Infinity
    for (const t of this.placed.children) {
      const top = tableOf(t)
      if (!top || !t.visible) continue
      t.updateMatrixWorld()
      const y = t.position.y + top.y
      const p = this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -y),
        new THREE.Vector3(),
      )
      if (!p) continue
      const l = t.worldToLocal(p.clone())
      if (Math.abs(l.x) > top.w / 2 || Math.abs(l.z) > top.d / 2) continue
      const d = this.ray.ray.origin.distanceTo(p)
      if (d >= bestD) continue
      // keep the tray's centre a little inside the edge
      l.x = THREE.MathUtils.clamp(
        l.x,
        -Math.max(0, top.w / 2 - TABLE_MARGIN),
        Math.max(0, top.w / 2 - TABLE_MARGIN),
      )
      l.z = THREE.MathUtils.clamp(
        l.z,
        -Math.max(0, top.d / 2 - TABLE_MARGIN),
        Math.max(0, top.d / 2 - TABLE_MARGIN),
      )
      best = t.localToWorld(l)
      bestD = d
    }
    return best
  }

  /** The height of the table top at (x, z), or null when there is none */
  private tableTopAt(x: number, z: number) {
    for (const t of this.placed.children) {
      const top = tableOf(t)
      if (!top || !t.visible) continue
      t.updateMatrixWorld()
      const l = t.worldToLocal(new THREE.Vector3(x, t.position.y, z))
      if (
        Math.abs(l.x) <= top.w / 2 - TABLE_MARGIN / 2 &&
        Math.abs(l.z) <= top.d / 2 - TABLE_MARGIN / 2
      )
        return t.position.y + top.y
    }
    return null
  }

  /**
   * Whether something of footprint `foot` at (x, z) turned `r` would overlap another thing
   * standing on a table at height y
   */
  private trayOverlaps(
    x: number,
    z: number,
    y: number,
    r: number,
    foot: Footprint,
    self?: THREE.Object3D,
  ) {
    // separating-axis test between two rotated rectangles, with a small gap kept between them
    const axes = (a: number): [[number, number], [number, number]] => [
      [Math.cos(a), -Math.sin(a)],
      [Math.sin(a), Math.cos(a)],
    ]
    const reach = (a: number, [l, w]: Footprint, [ux, uz]: [number, number]) => {
      const [[ax, az], [bx, bz]] = axes(a)
      const [hl, hw] = [l / 2 + TRAY_GAP / 2, w / 2 + TRAY_GAP / 2]
      return hl * Math.abs(ax * ux + az * uz) + hw * Math.abs(bx * ux + bz * uz)
    }
    return this.placed.children.some((o) => {
      if (o === self || !onTable(o) || Math.abs(o.position.y - y) > 0.02) return false
      // compare the footprints' centres, which may sit off the objects' origins
      const of = footOf(o)
      const [ax, az] = [x + (foot[2] ?? 0) * Math.sin(r), z + (foot[2] ?? 0) * Math.cos(r)]
      const [bx, bz] = [
        o.position.x + (of[2] ?? 0) * Math.sin(o.rotation.y),
        o.position.z + (of[2] ?? 0) * Math.cos(o.rotation.y),
      ]
      const [dx, dz] = [bx - ax, bz - az]
      return [...axes(r), ...axes(o.rotation.y)].every(
        (u) => Math.abs(dx * u[0] + dz * u[1]) < reach(r, foot, u) + reach(o.rotation.y, of, u),
      )
    })
  }

  /**
   * Where a copy of tray `s` can go: right beside it along its length, else the other way,
   * else in front or behind, else the nearest free spot on any table top.
   */
  private freeTraySpot(s: THREE.Object3D) {
    const r = s.rotation.y
    const foot = footOf(s)
    const fits = (x: number, z: number) => {
      const y = this.tableTopAt(x, z)
      return y !== null && !this.trayOverlaps(x, z, y, r, foot) ? new THREE.Vector3(x, y, z) : null
    }
    const along = foot[0] + TRAY_GAP
    const across = foot[1] + TRAY_GAP
    for (const [dx, dz] of [
      [along, 0],
      [-along, 0],
      [0, across],
      [0, -across],
    ] as const) {
      const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(UP, r)
      const p = fits(s.position.x + v.x, s.position.z + v.z)
      if (p) return p
    }
    let best: THREE.Vector3 | null = null
    let bestD = Infinity
    for (const t of this.placed.children) {
      const top = tableOf(t)
      if (!top || !t.visible) continue
      t.updateMatrixWorld()
      const [mx, mz] = [top.w / 2 - TABLE_MARGIN / 2, top.d / 2 - TABLE_MARGIN / 2]
      for (let lx = -mx; lx <= mx + 1e-6; lx += 0.03)
        for (let lz = -mz; lz <= mz + 1e-6; lz += 0.03) {
          const w = t.localToWorld(new THREE.Vector3(lx, top.y, lz))
          const d = w.distanceToSquared(s.position)
          if (d >= bestD) continue
          const p = fits(w.x, w.z)
          if (!p) continue
          best = p
          bestD = d
        }
    }
    return best
  }

  /** Stand a tray on the table under the pointer; false (and nothing moves) when there is none */
  private putOnTable(o: THREE.Object3D, e: PointerEvent) {
    this.setRay(e)
    const p = this.tableSpotOnRay()
    if (p) o.position.copy(p)
    return !!p
  }

  /** Put riders back on their seat after it moved or turned */
  private carry(seat: THREE.Object3D, riders: Rider[]) {
    seat.updateMatrixWorld()
    for (const r of riders) {
      r.o.position.copy(seat.localToWorld(r.local.clone()))
      r.o.rotation.y = seat.rotation.y + r.turn
    }
  }

  /** The nearest free seat within reach of (x, z), for `who` to sit on */
  /**
   * The nearest free place to sit within reach of (x, z), for `who`: a placed seat, or one of
   * A2's fixed seats. Gives where the hips go and which way to face.
   */
  private freeSeatNear(x: number, z: number, who: THREE.Object3D) {
    let best: { p: THREE.Vector3; turn: number } | null = null
    let bestD = SIT_REACH
    const taken = (p: THREE.Vector3) =>
      this.placed.children.some(
        (o) => o !== who && o.userData.sit && o.position.distanceTo(p) < 0.03,
      )
    for (const c of this.placed.children) {
      if (!seatOf(c) || !c.visible) continue
      const p = this.seatPoint(c)
      const d = Math.hypot(p.x - x, p.z - z)
      if (d >= bestD || taken(p)) continue
      best = { p, turn: c.rotation.y }
      bestD = d
    }
    for (const f of this.archi.seats) {
      const d = Math.hypot(f.x - x, f.z - z)
      if (d >= bestD) continue
      const p = new THREE.Vector3(f.x, f.y, f.z)
      if (taken(p)) continue
      best = { p, turn: f.turn }
      bestD = d
    }
    return best
  }

  /** A single person on a free seat sits down on it; anyone else stands on the floor. */
  private settle(o: THREE.Object3D) {
    if (!isPerson(o)) return
    const ud = o.userData
    const seat = (ud.n ?? 1) === 1 ? this.freeSeatNear(o.position.x, o.position.z, o) : null
    if (!seat) return this.standUp(o)
    if (!ud.sit) applyPeople(o, 1, ud.color as string | undefined, true)
    o.position.copy(seat.p)
    o.rotation.y = seat.turn
  }

  private standUp(o: THREE.Object3D) {
    if (!o.userData.sit) return
    applyPeople(o, 1, o.userData.color as string | undefined, false)
    o.position.y = this.floorY(o.position.x, o.position.z)
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
    // resizing is for one item at a time
    this.handles.visible = !!s && !this.group.size && (resizable(s) || isZone(s))
    if (!s || !this.handles.visible) return
    s.updateMatrixWorld()
    // a zone's handles take its colour; everything else keeps the selection yellow
    HANDLE_MAT.color.set(isZone(s) ? ((s.userData.color as string | undefined) ?? ZONE_COLOR) : YEL)
    if (isZone(s)) {
      // a zone's handles lie flat on its corners
      const w = s.userData.w as number
      const d = s.userData.d as number
      const flat = s.quaternion.clone().multiply(FLAT)
      for (const hd of this.handles.children) {
        const { sx, sy } = hd.userData as { sx: number; sy: number }
        hd.position.copy(s.localToWorld(new THREE.Vector3((sx * w) / 2, 0.02, (sy * d) / 2)))
        hd.quaternion.copy(flat)
        const k = THREE.MathUtils.clamp(
          this.camera.position.distanceTo(hd.position) * 0.012,
          0.03,
          0.4,
        )
        hd.scale.set(k, k, k)
      }
      return
    }
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
    if (isZone(o)) {
      // on the floor: the opposite corner stays put, sizes snap to the zone grid
      this.setRay(e)
      const p = this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -r.anchor.y),
        new THREE.Vector3(),
      )
      if (!p) return
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion)
      const dv = p.sub(r.anchor)
      const w = clampZone(r.sx * dv.dot(right), ZONE_MIN)
      const d = clampZone(r.sy * dv.dot(fwd), ZONE_MIN)
      applyZone(o, { w, d, color: o.userData.color as string | undefined })
      o.position
        .copy(r.anchor)
        .addScaledVector(right, (r.sx * w) / 2)
        .addScaledVector(fwd, (r.sy * d) / 2)
      this.updSel()
      return
    }
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
    if (this.locks.size) this.syncLockBoxes()
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
    if (!this.belts.visible) return null
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
    this.cb.onToast(t().toast.beltCut)
  }

  /** Pin other people's pointers on screen, gliding towards where they last were */
  private layoutCursors(dt: number) {
    if (!this.cursors.size) return
    const k = 1 - Math.exp(-dt * 14)
    const r = this.canvas.getBoundingClientRect()
    for (const c of this.cursors.values()) {
      c.at.lerp(c.to, k)
      const v = this.v.copy(c.at).project(this.camera)
      const shown = v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05
      c.el.style.display = shown ? '' : 'none'
      if (shown)
        c.el.style.transform = `translate(${((v.x + 1) / 2) * r.width}px,${((1 - v.y) / 2) * r.height}px)`
    }
  }

  /** Every placed item by its id */
  private byId() {
    const m = new Map<string, THREE.Object3D>()
    for (const o of this.placed.children) if (o.userData.id) m.set(o.userData.id as string, o)
    return m
  }

  private lockOf(o: THREE.Object3D) {
    const id = o.userData.id as string | undefined
    return id ? this.locks.get(id) : undefined
  }

  /** One outline per locked item that's placed, in its holder's colour */
  private syncLockBoxes() {
    const byId = this.byId()
    for (const [id, b] of this.lockBoxes) {
      const o = byId.get(id)
      const lock = this.locks.get(id)
      if (o && lock?.color === b.color) {
        b.o = o
        continue
      }
      this.scene.remove(b.helper)
      b.helper.dispose()
      this.lockBoxes.delete(id)
    }
    for (const [id, lock] of this.locks) {
      const o = byId.get(id)
      if (!o || this.lockBoxes.has(id)) continue
      const box = new THREE.Box3().setFromObject(o)
      const helper = new THREE.Box3Helper(box, new THREE.Color(lock.color))
      ;(helper.material as THREE.Material).depthTest = false
      helper.renderOrder = 998
      this.scene.add(helper)
      this.lockBoxes.set(id, { o, color: lock.color, box, helper })
    }
  }

  /** Every undo and redo step takes on other people's changes, so undo leaves them standing */
  private rebaseHistory(upserts: readonly LayoutItem[], gone: ReadonlySet<string>) {
    if (!upserts.length && !gone.size) return
    const keyed = new Map(
      upserts.map((i) => [i.id!, i.img ? { ...i, img: this.imgKey(i.img) } : i] as const),
    )
    const fix = (step: string) => rebaseStep(step, keyed, gone)
    this.undoStack = this.undoStack.map(fix)
    this.redoStack = this.redoStack.map(fix)
    this.redoCleared = this.redoCleared.map(fix)
  }

  /** Tell whoever's watching where these items are now, mid-drag */
  private live(objs: readonly THREE.Object3D[]) {
    if (!this.cb.onLive || !objs.length) return
    this.cb.onLive(
      objs.map((o) => ({
        id: (o.userData.id ??= crypto.randomUUID()) as string,
        x: +o.position.x.toFixed(3),
        y: +o.position.y.toFixed(3),
        z: +o.position.z.toFixed(3),
        r: +o.rotation.y.toFixed(4),
      })),
    )
  }

  /** Let go of what's being dragged, committing it if it moved */
  private endDrag() {
    if (this.drag?.moved) this.commit()
    this.drag = null
    this.controls.enabled = true
    this.grid.visible = false
    this.canvas.style.cursor = ''
  }

  /** The layout as an undo step (poster images by their short key) */
  private snapshot() {
    const items = this.serialize().map((i) => (i.img ? { ...i, img: this.imgKey(i.img) } : i))
    return JSON.stringify(items)
  }

  /** Put back the layout from an undo step */
  private restore(step: string) {
    const items = (JSON.parse(step) as LayoutItem[]).map((i) =>
      i.img ? { ...i, img: this.imgByKey.get(i.img) } : i,
    )
    this.load(items)
    this.reportHistory()
  }

  /** Take an undo step before a change; a new change can't be redone past */
  private pushUndo() {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoCleared = this.redoStack
    this.redoStack = []
    this.reportHistory()
  }

  /** The change the last undo step was taken for didn't happen after all: forget that step */
  private dropUndo() {
    this.undoStack.pop()
    this.redoStack = this.redoCleared
    this.reportHistory()
  }

  private reportHistory() {
    this.cb.onHistory(this.undoStack.length > 0, this.redoStack.length > 0)
  }

  private select(o: THREE.Object3D | null) {
    this.lidLive = false
    this.group.clear()
    this.syncGroupBoxes()
    this.selected = o
    this.selHelper.visible = !!o
    if (o) this.updSel()
    else {
      this.updHandles()
      this.cb.onSelect(null)
    }
  }

  /** Everything selected: the first item, then the rest of the group */
  private get selection(): THREE.Object3D[] {
    return this.selected ? [this.selected, ...this.group] : []
  }

  /** Select these items together; the first one is the one the panel describes */
  private setSelection(list: readonly THREE.Object3D[]) {
    // someone else's selection can't join this one
    const [first, ...rest] = [...new Set(list)].filter((o) => !this.lockOf(o))
    this.select(first ?? null)
    for (const o of rest) this.group.add(o)
    this.syncGroupBoxes()
    if (first) this.updSel()
  }

  /** Add an item to the selection, or take it out if it's in */
  private toggleSelected(o: THREE.Object3D) {
    const all = this.selection
    this.setSelection(all.includes(o) ? all.filter((x) => x !== o) : [...all, o])
  }

  /** Keep one outline per grouped item, matching the first item's */
  private syncGroupBoxes() {
    for (const [o, { helper }] of this.groupBoxes)
      if (!this.group.has(o)) {
        this.scene.remove(helper)
        helper.dispose()
        this.groupBoxes.delete(o)
      }
    for (const o of this.group) {
      if (this.groupBoxes.has(o)) continue
      const box = new THREE.Box3().setFromObject(o)
      const helper = new THREE.Box3Helper(box, new THREE.Color(YEL))
      ;(helper.material as THREE.Material).depthTest = false
      helper.renderOrder = 999
      this.scene.add(helper)
      this.groupBoxes.set(o, { box, helper })
    }
  }

  /**
   * Move a multiple selection by (ox, oz) from where its members started: floor items move
   * with it, people on a moved seat and things on a moved table ride along, and anything else
   * on a table goes too if a table is under its new spot. Posters stay on their walls.
   */
  private offsetGroup(members: readonly GroupMember[], ox: number, oz: number) {
    const riding = new Set(members.flatMap((m) => m.riders.map((r) => r.o)))
    const free = members.filter((m) => !riding.has(m.o))
    for (const { o, start } of free) {
      if (onTable(o)) continue
      const [x, z] = [start.x + ox, start.z + oz]
      o.position.set(x, this.floorY(x, z), z)
    }
    for (const m of members) if (m.riders.length) this.carry(m.o, m.riders)
    for (const { o, start } of free) {
      if (onTable(o)) {
        const [x, z] = [start.x + ox, start.z + oz]
        const y = this.tableTopAt(x, z)
        if (y !== null) o.position.set(x, y, z)
        else o.position.copy(start)
      } else if (isPerson(o)) this.settle(o)
    }
    if (members.some((m) => isPost(m.o))) this.updateBelts()
    this.updSel()
  }

  /**
   * Turn a multiple selection by `deg` round the middle of its floor items, each item turning
   * with it: people on a turned seat and things on a turned table ride along, and anything else
   * on a table goes too if a table is under its new spot. Posters stay on their walls.
   */
  private rotateGroup(deg: number) {
    const members = this.groupMembers()
    const riding = new Set(members.flatMap((m) => m.riders.map((r) => r.o)))
    const free = members.filter((m) => !riding.has(m.o))
    if (!free.length) return
    const box = new THREE.Box3().setFromPoints(free.map((m) => m.start))
    const mid = box.getCenter(new THREE.Vector3()).setY(0)
    const a = THREE.MathUtils.degToRad(deg)
    const turned = (p: THREE.Vector3) => p.clone().setY(0).sub(mid).applyAxisAngle(UP, a).add(mid)
    this.pushUndo()
    for (const { o, start } of free) {
      o.rotation.y += a
      if (onTable(o)) continue
      const q = turned(start)
      o.position.set(q.x, this.floorY(q.x, q.z), q.z)
    }
    for (const m of members) if (m.riders.length) this.carry(m.o, m.riders)
    for (const { o, start } of free) {
      if (onTable(o)) {
        const q = turned(start)
        const y = this.tableTopAt(q.x, q.z)
        if (y !== null) o.position.set(q.x, y, q.z)
        else o.position.copy(start)
      } else if (isPerson(o)) this.settle(o)
    }
    if (members.some((m) => isPost(m.o))) this.updateBelts()
    this.updSel()
    this.commit()
  }

  /** `o` and, when it is in a group (群組), the rest of its group that is shown, `o` first */
  private withGroup = (o: THREE.Object3D): THREE.Object3D[] => {
    const g = o.userData.group as string | undefined
    if (!g) return [o]
    return [
      o,
      ...this.placed.children.filter((m) => m !== o && m.visible && m.userData.group === g),
    ]
  }

  /** Start moving the whole selection by dragging one of its items */
  private startGroupDrag(e: PointerEvent, o: THREE.Object3D, tap: 'toggle' | 'single' | 'keep') {
    const p = this.floorHit(e) ?? o.position.clone()
    this.drag = {
      o,
      dx: o.position.x - p.x,
      dz: o.position.z - p.z,
      moved: false,
      group: this.groupMembers(),
      tap,
    }
    this.controls.enabled = false
    this.canvas.style.cursor = 'grabbing'
  }

  /** Begin a selection box at the pointer */
  private startMarquee(e: PointerEvent) {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      border: `1.5px dashed ${YEL}`,
      borderRadius: '2px',
      background: 'rgba(237, 179, 42, 0.12)',
      pointerEvents: 'none',
    })
    this.stageEl.append(el)
    const pending = e.pointerType === 'touch'
    this.marquee = { x0: e.clientX, y0: e.clientY, el, id: e.pointerId, pending }
    if (!pending) this.controls.enabled = false
    this.drawMarquee(e)
  }

  /** Drop the selection box without selecting anything (a second finger came down) */
  private cancelMarquee() {
    this.marquee?.el.remove()
    this.marquee = null
    this.controls.enabled = true
  }

  /** The selection box from where it started to the pointer, in client pixels */
  private marqueeRect(e: PointerEvent) {
    const m = this.marquee!
    return {
      l: Math.min(m.x0, e.clientX),
      t: Math.min(m.y0, e.clientY),
      r: Math.max(m.x0, e.clientX),
      b: Math.max(m.y0, e.clientY),
    }
  }

  private drawMarquee(e: PointerEvent) {
    const m = this.marquee
    if (!m) return
    if (m.pending && Math.hypot(e.clientX - m.x0, e.clientY - m.y0) > 4) {
      // one finger dragging: it's a box after all, so the camera stops following it
      m.pending = false
      this.controls.enabled = false
    }
    const { l, t, r, b } = this.marqueeRect(e)
    const s = this.stageEl.getBoundingClientRect()
    Object.assign(m.el.style, {
      transform: `translate(${l - s.left}px,${t - s.top}px)`,
      width: `${r - l}px`,
      height: `${b - t}px`,
    })
  }

  /** Add every shown item whose base falls inside the box to the selection */
  private endMarquee(e: PointerEvent) {
    const m = this.marquee
    if (!m) return
    const { l, t, r, b } = this.marqueeRect(e)
    m.el.remove()
    this.marquee = null
    this.controls.enabled = true
    if (r - l < 4 && b - t < 4) return
    const s = this.canvas.getBoundingClientRect()
    const v = this.v
    const inside = this.placed.children.filter((o) => {
      if (!o.visible) return false
      v.copy(o.position).project(this.camera)
      if (v.z > 1) return false
      const x = s.left + ((v.x + 1) / 2) * s.width
      const y = s.top + ((1 - v.y) / 2) * s.height
      return x >= l && x <= r && y >= t && y <= b
    })
    if (inside.length) this.setSelection([...this.selection, ...inside.flatMap(this.withGroup)])
  }

  /** The selection's members as they stand now, ready to be moved together */
  private groupMembers(): GroupMember[] {
    return this.selection
      .filter((o) => !onWall(o))
      .map((o) => ({ o, start: o.position.clone(), riders: this.ridersOf(o) }))
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
      count: this.group.size + 1,
      ids: this.selection.map((o) => (o.userData.id ??= crypto.randomUUID()) as string),
      ...this.sharedGroup(),
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
      tag: (s.userData.tag as string | undefined) ?? '',
      info: (s.userData.info as string | undefined) ?? '',
      ...(priceOf(s.userData.type as FurnitureType) ? { billed: !s.userData.unbilled } : {}),
      ...(ownTagColor(s)
        ? { tagColor: (s.userData.tagColor as string | undefined) ?? TAG_COLOR }
        : {}),
      ...(s.userData.type === 'person'
        ? {
            people: {
              n: (s.userData.n as number | undefined) ?? 1,
              color: (s.userData.color as string | undefined) ?? PERSON_COLOR,
              sit: !!s.userData.sit,
            },
          }
        : {}),
      ...(isZone(s)
        ? {
            zone: {
              w: s.userData.w as number,
              d: s.userData.d as number,
              color: (s.userData.color as string | undefined) ?? ZONE_COLOR,
            },
          }
        : {}),
      ...(s.userData.type === 'laptop'
        ? { laptop: { open: (s.userData.open as number | undefined) ?? LID_OPEN } }
        : {}),
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

  /** What the pointer is over in the venue: an item's surface, else the floor */
  private pointerPoint(e: PointerEvent): Vec3 | null {
    this.setRay(e)
    const hit =
      this.ray.intersectObjects(this.placed.children, true).find((h) => {
        let o = h.object
        while (o.parent && o.parent !== this.placed) o = o.parent
        return o.visible
      })?.point ?? this.floorHit(e)
    return hit ? [+hit.x.toFixed(2), +hit.y.toFixed(2), +hit.z.toFixed(2)] : null
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
    // the raycaster doesn't skip hidden objects, so pass over hits on hidden items
    for (const h of this.ray.intersectObjects(this.placed.children, true)) {
      let o = h.object
      while (o.parent && o.parent !== this.placed) o = o.parent
      if (o.visible) return o
    }
    return null
  }

  private moveTo(o: THREE.Object3D, x: number, z: number) {
    if (isZone(o)) {
      // keep a zone's edges on the grid (its centre is off-grid when a side is an odd length)
      const hw = (o.userData.w as number) / 2
      const hd = (o.userData.d as number) / 2
      x = onZoneGrid(x - hw) + hw
      z = onZoneGrid(z - hd) + hd
    } else {
      x = this.sn(x)
      z = this.sn(z)
    }
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
    // where in the venue the pointer is, for other people's screens
    // (at most every POINTER_EVERY ms, the latest always going out last)
    const report = () => {
      this.pointerLater = undefined
      const e = this.pointerLast
      this.pointerLast = null
      if (!e) return
      this.pointerAt = performance.now()
      this.cb.onPointer?.(this.pointerPoint(e))
    }
    this.listen(canvas, 'pointermove', (e) => {
      if (!this.cb.onPointer || e.pointerType === 'touch') return
      this.pointerLast = e
      if (this.pointerLater) return
      const wait = POINTER_EVERY - (performance.now() - this.pointerAt)
      if (wait <= 0) report()
      else this.pointerLater = setTimeout(report, wait)
    })
    this.listen(canvas, 'pointerleave', () => {
      clearTimeout(this.pointerLater)
      this.pointerLater = undefined
      this.pointerLast = null
      this.cb.onPointer?.(null)
    })
    this.cleanups.push(() => clearTimeout(this.pointerLater))
    this.listen(window, 'keyup', (e) => this.held.delete(e.key.toLowerCase()))
    this.listen(window, 'blur', () => this.held.clear())
    this.listen(window, 'keydown', this.onKeyDown)

    this.listen(
      this.stageEl,
      'pointerdown',
      (e) => {
        if (this.marquee && e.pointerId !== this.marquee.id) {
          // a second finger: a pinch or orbit, not a box (the camera takes it from here)
          this.cancelMarquee()
          return
        }
        // a second finger: a pinch or orbit, not a tap or a hold
        if (this.press && e.pointerId !== this.press.id) this.cancelPress()
        if (this.armDown && e.pointerId !== this.armDown.id) {
          this.armDown = null
          return
        }
        if (e.target !== canvas || e.button !== 0) return
        this.infoOpen = null
        canvas.focus()
        this.downPt = { x: e.clientX, y: e.clientY }
        if (!this.editable) return
        if (this.armed) {
          // placing: a tap puts it down (pointerup); a drag or pinch stays the camera's
          this.armDown = { id: e.pointerId, x: e.clientX, y: e.clientY }
          return
        }
        const hd = this.pickHandle(e)
        if (hd && this.selected) {
          e.stopPropagation()
          e.preventDefault()
          const s = this.selected
          const { sx, sy } = hd.userData as { sx: number; sy: number }
          if (isZone(s)) {
            const w = s.userData.w as number
            const d = s.userData.d as number
            const anchor = s.localToWorld(new THREE.Vector3((-sx * w) / 2, 0, (-sy * d) / 2))
            this.resizing = { o: s, sx, sy, anchor, aspect: w / d, moved: false }
            this.controls.enabled = false
            // show the floor grid its edges snap to
            this.grid.visible = true
            return
          }
          const w = s.userData.w as number
          const h = s.userData.h as number
          const cy = faceCenterY(s)
          const anchor = s.localToWorld(new THREE.Vector3((-sx * w) / 2, cy - (sy * h) / 2, 0))
          this.resizing = { o: s, sx, sy, anchor, aspect: w / h, moved: false }
          this.controls.enabled = false
          return
        }
        const o = this.pickObj(e)
        if (o && e.pointerType === 'touch' && !this.multi && !this.selection.includes(o)) {
          // a finger on an item not selected yet: the camera has the drag unless it holds still
          this.startPress(e, o)
          return
        }
        const lock = o && this.lockOf(o)
        if (lock) {
          // someone else has it selected
          e.stopPropagation()
          e.preventDefault()
          this.cb.onToast(t().collab.locked(lock.name))
          return
        }
        const keyed = e.shiftKey || e.metaKey || e.ctrlKey
        if (o && this.multi && !keyed && this.selection.includes(o) && !onWall(o) && !onTable(o)) {
          // 多選: dragging a selected item moves them all; a tap takes it out
          e.stopPropagation()
          e.preventDefault()
          this.startGroupDrag(e, o, 'toggle')
          return
        }
        if (o && (keyed || this.multi)) {
          // Shift / ⌘ / Ctrl + click (or a tap in 多選) adds the item to the selection, or
          // takes it out
          e.stopPropagation()
          e.preventDefault()
          this.toggleSelected(o)
          return
        }
        if (!o) {
          // Shift + drag (or any drag in 多選) on empty space draws a box; what's inside joins
          // the selection. A touch one lets the camera see the finger too, for a pinch.
          if (e.shiftKey || this.multi) {
            if (e.pointerType !== 'touch') {
              e.stopPropagation()
              e.preventDefault()
            }
            this.startMarquee(e)
          }
          return
        }
        if (isZone(o) && !this.selection.includes(o)) {
          // leave the drag to the camera; a plain click selects the zone (pointerup)
          this.zoneClick = o
          return
        }
        e.stopPropagation()
        e.preventDefault()
        this.grab(e, o)
      },
      true,
    )
    this.listen(window, 'pointermove', (e) => {
      const pr = this.press
      if (pr && e.pointerId === pr.id) {
        pr.last = e
        // moved before the hold: the camera's drag, not a pick-up
        if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > HOLD_SLOP) this.cancelPress()
      }
      const ad = this.armDown
      if (ad && e.pointerId === ad.id && Math.hypot(e.clientX - ad.x, e.clientY - ad.y) > HOLD_SLOP)
        this.armDown = null
      const r = this.resizing
      if (r) {
        if (!r.moved) {
          this.pushUndo()
          r.moved = true
        }
        this.resizeTo(e)
        return
      }
      if (this.marquee) {
        if (e.pointerId === this.marquee.id) this.drawMarquee(e)
        return
      }
      const d = this.drag
      if (d?.group) {
        const p = this.floorHit(e)
        if (!p) return
        if (!d.moved) {
          this.pushUndo()
          d.moved = true
          this.grid.visible = true
        }
        // the grabbed item snaps to the grid; the rest keep their places around it
        const lead = d.group.find((m) => m.o === d.o)!.start
        this.offsetGroup(d.group, this.sn(p.x + d.dx) - lead.x, this.sn(p.z + d.dz) - lead.z)
        this.live(d.group.flatMap((m) => [m.o, ...m.riders.map((r) => r.o)]))
        return
      }
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
        this.live([d.o])
        return
      }
      if (d && onTable(d.o)) {
        // a tray slides across table tops, and stays put when the pointer leaves them
        if (!d.moved) {
          this.pushUndo()
          d.moved = true
        }
        this.putOnTable(d.o, e)
        this.updSel()
        this.live([d.o])
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
        if (d.riders?.length) this.carry(d.o, d.riders)
        this.settle(d.o)
        if (isPost(d.o)) this.updateBelts()
        this.updSel()
        this.live([d.o, ...(d.riders ?? []).map((r) => r.o)])
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
      const pr = this.press
      if (pr && e.pointerId === pr.id) {
        // lifted before the hold, without moving: a tap, which selects it (with its group)
        this.cancelPress()
        const lock = this.lockOf(pr.o)
        if (lock) this.cb.onToast(t().collab.locked(lock.name))
        else this.setSelection(this.withGroup(pr.o))
        this.downPt = null
        return
      }
      const ad = this.armDown
      if (ad && e.pointerId === ad.id) {
        this.armDown = null
        this.downPt = null
        if (this.armed && e.target === canvas) this.placeArmed(e)
        return
      }
      if (this.marquee?.id === e.pointerId) {
        this.endMarquee(e)
        this.downPt = null
        return
      }
      if (this.resizing) {
        const { o, moved } = this.resizing
        if (moved) {
          // a floor item's hardware wasn't kept in sync during the live drag; rebuild it now
          if (!onWall(o) && !isZone(o)) this.select(this.rebuild(o, {}))
          this.commit()
        }
        this.resizing = null
        this.controls.enabled = true
        this.grid.visible = false
        this.downPt = null
        return
      }
      if (this.drag) {
        if (this.drag.moved) this.commit()
        // a tap in 多選 takes the item out; a plain click (no drag) on one of several selected
        // items selects just that one
        else if (this.drag.tap === 'toggle') this.toggleSelected(this.drag.o)
        else if (this.drag.tap === 'single') this.select(this.drag.o)
        this.drag = null
        this.controls.enabled = true
        this.grid.visible = false
        canvas.style.cursor = 'grab'
        return
      }
      const d = this.downPt
      if (d && e.target === canvas && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
        const belt = this.editable && this.pickBelt(e)
        const beltLock =
          belt && (belt.userData.ends as THREE.Object3D[]).map((o) => this.lockOf(o)).find(Boolean)
        if (beltLock) this.cb.onToast(t().collab.locked(beltLock.name))
        else if (belt) this.cutBelt(belt)
        else this.setSelection(this.zoneClick ? this.withGroup(this.zoneClick) : [])
      }
      this.zoneClick = null
      this.downPt = null
    })
    // the browser took the touch over: no tap, no hold
    this.listen(window, 'pointercancel', (e) => {
      if (this.press?.id === e.pointerId) this.cancelPress()
      if (this.armDown?.id === e.pointerId) this.armDown = null
    })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
    // keys pressed in a dialog (e.g. Esc / Delete) belong to it, not to the scene
    if (target?.closest?.('dialog')) return
    // Esc closes an open note first, in either mode
    if (e.key === 'Escape' && this.infoOpen) {
      this.infoOpen = null
      return
    }
    if (e.key === 'Escape' && this.armed) {
      this.armPlace(null)
      return
    }
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
      if (e.shiftKey) this.redo()
      else this.undo()
      return
    }
    if (mod && kk === 'y') {
      e.preventDefault()
      this.redo()
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
    } else if (kk === 'q') this.rotate(e.shiftKey ? 45 : 15)
    else if (kk === 'e') this.rotate(e.shiftKey ? -45 : -15)
    else if (kk === 'r') this.rotate(e.shiftKey ? 180 : -90)
    else if (e.key === 'Escape') this.select(null)
    else if (e.key.startsWith('Arrow') && this.group.size) {
      // several selected: nudge them all together, like one floor item
      e.preventDefault()
      const ax = this.screenAxis(e.key)
      if (!ax) return
      const st = e.shiftKey ? 1 : 0.25
      this.pushUndo()
      this.offsetGroup(this.groupMembers(), ax.x * st, ax.z * st)
      this.commit()
    } else if (e.key.startsWith('Arrow') && onWall(s)) {
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
    } else if (e.key.startsWith('Arrow') && onTable(s)) {
      // a tray is nudged along the world axes, but never off its table
      e.preventDefault()
      const st = e.shiftKey ? 0.25 : 0.05
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-st, 0],
        ArrowRight: [st, 0],
        ArrowUp: [0, -st],
        ArrowDown: [0, st],
      }
      const [dx, dz] = step[e.key] ?? [0, 0]
      const [x, z] = [s.position.x + dx, s.position.z + dz]
      const y = this.tableTopAt(x, z)
      if (y === null) return
      this.pushUndo()
      s.position.set(x, y, z)
      this.updSel()
      this.commit()
    } else if (e.key.startsWith('Arrow')) {
      // nudge the selection along the world axis closest to the screen direction
      e.preventDefault()
      const st = e.shiftKey ? 1 : 0.25
      const ax = this.screenAxis(e.key)
      if (!ax) return
      this.pushUndo()
      const riders = this.ridersOf(s)
      const p = s.position
      p.set(p.x + ax.x * st, 0, p.z + ax.z * st)
      p.y = this.floorY(p.x, p.z)
      this.carry(s, riders)
      this.settle(s)
      this.updSel()
      this.commit()
    }
  }

  /** The world axis (x or z) closest to an arrow key's direction on screen */
  private screenAxis(key: string) {
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
    }[key]
    if (!v) return null
    return Math.abs(v.x) > Math.abs(v.z)
      ? new THREE.Vector3(Math.sign(v.x), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(v.z))
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
    this.stopFollowing()
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
    const f = this.following
    if (f) {
      // ease towards their view, frame-rate independent
      const k = 1 - Math.exp(-dt * 8)
      camera.position.lerp(f.p, k)
      controls.target.lerp(f.t, k)
    }
    controls.update()
    if (this.selected) {
      this.selBox.setFromObject(this.selected)
      if (this.handles.visible) this.updHandles()
    }
    for (const [o, { box }] of this.groupBoxes) box.setFromObject(o)
    for (const { o, box, helper } of this.lockBoxes.values()) {
      box.setFromObject(o)
      helper.visible = o.visible
    }
    this.updGroupFrames()
    this.renderer.render(this.scene, camera)
    this.layoutCursors(dt)
    if (this.labelsVisible) this.layoutLabels()
    this.layoutTags('item')
    this.layoutTags('zone')
  };

  /**
   * Keep one tag row per tagged or annotated object of this kind and pin it on screen: people's
   * above their head, other items' just above their top, zones' raised above the zone's centre
   * on a leader line. A row is the tag pill (unless its kind's tags are hidden) and, for an
   * item with a note, an ⓘ button to its right that opens the note in a box above. Groups'
   * rows (with the items') sit above the middle of the whole group.
   */
  /**
   * The tag rows of this kind that are showing: each tagged or annotated item's (its tag, unless
   * that kind's tags are hidden, and its note, unless that kind's notes are), then, for items,
   * each shown group's. Gives where the row points (in the world), what it says, and its colour.
   */
  private *tagRows(kind: TagKind) {
    for (const o of this.placed.children) {
      const tag = o.userData.tag as string | undefined
      const type = o.userData.type as FurnitureType
      const info = this.hiddenInfo.has(type) ? undefined : (o.userData.info as string | undefined)
      const showTag = !!tag && !this.hiddenTags.has(type)
      if (!o.visible || tagKindOf(o) !== kind || (!showTag && !info)) continue
      // a person's or zone's tag wears its colour, anything else's its own tag colour
      const c = ownTagColor(o)
        ? ((o.userData.tagColor as string | undefined) ?? TAG_COLOR)
        : ((o.userData.color as string | undefined) ?? (isZone(o) ? ZONE_COLOR : PERSON_COLOR))
      const above = isZone(o)
        ? 0.02
        : isPerson(o)
          ? o.userData.sit
            ? SEATED_TAG_Y
            : PERSON_TAG_Y
          : tagBox.setFromObject(o).max.y - o.position.y + TAG_CLEARANCE
      const p = new THREE.Vector3(o.position.x, o.position.y + above, o.position.z)
      yield { key: o as THREE.Object3D | string, p, tag: showTag ? tag : undefined, info, c }
    }
    if (kind === 'item')
      for (const [name, members] of this.groupsShown()) {
        const m = this.groupMeta(name)
        const tag = this.hiddenGroupTags ? undefined : m.tag
        const info = this.hiddenGroupInfo ? undefined : m.info
        if (!tag && !info) continue
        tagBox.makeEmpty()
        for (const o of members) tagBox.expandByObject(o)
        const p = tagBox.getCenter(new THREE.Vector3()).setY(tagBox.max.y + TAG_CLEARANCE)
        yield { key: `group:${name}` as THREE.Object3D | string, p, tag, info, c: m.color }
      }
  }

  private layoutTags(kind: TagKind) {
    const { layer, els } = this.tags[kind]
    if (!layer) return
    const seen = new Set<THREE.Object3D | string>()
    for (const { key, p, tag, info, c } of this.tagRows(kind)) {
      seen.add(key)
      let el = els.get(key)
      if (!el) {
        el = this.tagRow(key, kind)
        layer.append(el)
        els.set(key, el)
      }
      this.v.copy(p)
      this.placeRow(el, kind, tag, info, c, this.infoOpen === key)
    }
    for (const [key, el] of els)
      if (!seen.has(key)) {
        el.remove()
        els.delete(key)
        if (this.infoOpen === key) this.infoOpen = null
      }
  }

  /**
   * Fill in and pin one tag row over the world point in `this.v`: its tag pill (when `tag`),
   * its ⓘ (when `info`) and, when `open`, the note, all in colour `c` with readable text.
   */
  private placeRow(
    el: HTMLElement,
    kind: TagKind,
    tag: string | undefined,
    info: string | undefined,
    c: string,
    open: boolean,
  ) {
    const pill = el.children[0] as HTMLElement
    const btn = el.children[1] as HTMLElement
    const box = el.children[2] as HTMLElement
    pill.hidden = !tag
    // beside a tag the ⓘ wears the tag's colour; alone it stays light
    el.classList.toggle('tagged', !!tag)
    if (tag && pill.textContent !== tag) pill.textContent = tag
    btn.hidden = !info
    // follows the language, which can change while the row is up
    const label = t().sel.infoLabel
    if (info && btn.title !== label) {
      btn.title = label
      btn.setAttribute('aria-label', label)
    }
    open &&= !!info
    box.hidden = !open
    if (open && box.textContent !== info) box.textContent = info!
    // items' rows sit over zones', and the row with an open note over everything
    el.style.zIndex = open ? '2' : kind === 'item' ? '1' : ''
    if (el.dataset.c !== c) {
      el.dataset.c = c
      el.style.setProperty('--tc', c)
      el.style.setProperty('--tt', isLight(c) ? '#1f2126' : '#fff')
      // the tag's colour as a line or text on white: a pale one is darkened to stay visible
      el.style.setProperty('--ti', isLight(c) ? `color-mix(in srgb, ${c} 55%, #000)` : c)
    }
    const v = this.v.project(this.camera)
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    // the tag (or, without one, the ⓘ) is centred over the point; the ⓘ follows to its right
    const anchor = tag ? pill : btn
    const w = this.stageEl.clientWidth
    const h = this.stageEl.clientHeight
    const x = ((v.x + 1) / 2) * w - anchor.offsetLeft - anchor.offsetWidth / 2
    // the row sits above its point; a zone's is raised on a leader line down to its centre
    const lift = kind === 'zone' && tag ? ZONE_TAG_LIFT : 0
    const y = ((1 - v.y) / 2) * h - el.offsetHeight - lift
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
    if (open) box.style.left = `${btn.offsetLeft + btn.offsetWidth / 2}px`
  }

  /** A tag row's elements: the pill, the ⓘ button (toggles its note) and the note box */
  private tagRow(key: THREE.Object3D | string, kind: TagKind) {
    const el = document.createElement('div')
    el.className = 'trow'
    const pill = document.createElement('span')
    pill.className = kind === 'zone' ? 'ztag' : 'ptag'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tinfo'
    btn.textContent = 'i'
    btn.addEventListener('click', () => {
      this.infoOpen = this.infoOpen === key ? null : key
    })
    const box = document.createElement('div')
    box.className = 'tbox'
    box.setAttribute('role', 'note')
    for (const e of [btn, box]) e.dataset.stageUi = ''
    el.append(pill, btn, box)
    return el
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
