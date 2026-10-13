import { clampLid } from './laptop'
import { clampLift } from './tv'
import { clampPosterSize, isImageDataUrl } from './poster'
import { FLOORS, floorsOf, toCurrentFloors } from './floors'
import { isPathSpeed, PATH_SPEED } from './path'
import { readJSON, removeKey, writeJSON } from './storage'
import { ZONE_MAX, clampZone, cleanCorners, cornerBounds } from './zone'
import {
  FURNITURE_TYPES,
  defaultSizeOf,
  isFurnitureType,
  isResizable,
  priceOf,
  resolveVariant,
  takesImage,
  isPersonHeight,
  PEOPLE_MAX,
  PERSON_HEIGHT,
  type FurnitureType,
} from './furniture'

/** One placed object. `y` omitted → dropped onto the floor below (x, z). `r` is rotation around Y in radians. */
export interface LayoutItem {
  /** Stable id (a UUID), also the item's row id in a cloud project; the editor gives one to any item without */
  id?: string
  t: FurnitureType
  x: number
  y?: number
  z: number
  r: number
  /** Colour variant id, for types that have variants */
  v?: string
  /** Resizable items only: size in metres */
  w?: number
  h?: number
  /** Items with a printable face: the graphic as a data URL */
  img?: string
  /** Resizable items only: aspect ratio locked while resizing */
  lock?: boolean
  /** Name tag: above the item, or on a zone's middle */
  tag?: string
  /** Tag colour as #rrggbb, for anything but people and zones (theirs is `color`) */
  tagColor?: string
  /** A note (補充資訊) opened from the ⓘ button above the item */
  info?: string
  /** Rented items only: left out of the rental total (absent means it's billed) */
  unbilled?: boolean
  /** The name of the group (群組) it belongs to; items with the same name are one group */
  group?: string
  /**
   * Its group's tag, tag colour (#rrggbb; also the frame round the selected group) and note.
   * Every member carries them, so they travel with copies and survive any member's removal.
   */
  groupTag?: string
  groupColor?: string
  groupInfo?: string
  /** People only: how many figures the item shows (1–6; absent means 1) */
  n?: number
  /** People and zones: colour as #rrggbb (absent means the default) */
  color?: string
  /** People only: sitting on the seat at this position (always a single figure) */
  sit?: boolean
  /** People only: how tall, in cm (130–200 in steps of 10; absent means 170) */
  height?: number
  /** Zones only: depth in metres along local z (their width is `w`) */
  d?: number
  /** Zones only: locked against editing (禁止編輯), itself and everything standing in it */
  locked?: boolean
  /**
   * Zones only, once a corner has been added: the corners, [x, z] in metres about the item's
   * position (before its rotation), in order round it; `w` × `d` are then their bounds
   */
  pts?: [number, number][]
  /** Laptops only: lid opening in degrees, 0 (shut) to LID_MAX (absent means LID_OPEN) */
  open?: number
  /** Mobile TVs only: the screen's centre above the floor, metres (absent means TV_LIFT) */
  lift?: number
  /** Stanchions only: bearings (radians) of auto-linked belts the user removed at this post */
  cut?: number[]
  /** 動線點 only: the ids of the points linked from this one (see path.ts) */
  links?: string[]
  /**
   * 動線點 only: those of its `links` whose 人員 walk along them on their own (the rest are
   * dragged by hand). `true`, as saved before links had one each, means all of them.
   */
  auto?: string[]
  /** 動線點 only: its path's speed, 1 (slowest) to 5 (absent means the default, 3; see path.ts) */
  speed?: number
}

/** 0 = 自助搬運 (self-carry), 1 = 含搬運 (with carrying service) */
export type PriceMode = 0 | 1

/** One kind's rental cost; its name is shown with nameOf (i18n) */
export interface CostLine {
  type: FurnitureType
  /** Where this kind's items are in the layout, in order */
  indices: number[]
  /** How many are placed, and how many of those are billed */
  count: number
  billed: number
  subtotal: number
}

/** A group's items, listed together in 目前配置 instead of under their kinds */
export interface GroupLine {
  name: string
  /** Where its items are in the layout, in order */
  indices: number[]
  /** How many of its items are rented, and how many of those are billed */
  rented: number
  billed: number
  subtotal: number
}

/** Longest name tag kept, in characters */
export const TAG_MAX = 24

/** Longest note (補充資訊) kept, in characters */
export const INFO_MAX = 500

/** Trim a note, keep its line breaks, and cap its length; empty means none */
export const cleanInfo = (s: unknown) =>
  typeof s === 'string' ? [...s.replace(/\r\n?/g, '\n').trim()].slice(0, INFO_MAX).join('') : ''

/** Trim a tag and cap its length; empty means no tag */
export const cleanTag = (s: unknown) =>
  typeof s === 'string' ? [...s.trim()].slice(0, TAG_MAX).join('') : ''

export const clampPeople = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(PEOPLE_MAX, Math.max(1, Math.round(n))) : 1

export const isHexColor = (s: unknown): s is string =>
  typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

/** The scenes kept in this browser, each a layout on today's floors (see floors.ts) */
export const SCENES_KEY = 'vueconf26-nccu-scenes-v6'
/** …and the one layout kept before there were scenes: read once into the first scene, then cleared */
export const STORAGE_KEY = 'vueconf26-nccu-layout-v5'
/** …and as it was kept before, on floors 1: read once, moved on to today's, then cleared */
const STORAGE_KEY_FLOORS1 = 'vueconf26-nccu-layout-v4'
export const PRICE_KEY = 'vueconf26-nccu-layout-v4-price'
export const MAX_SLOTS = 9

export const formatNT = (n: number) => 'NT$ ' + n.toLocaleString('en-US')

export const clampSlots = (n: number) => Math.max(1, Math.min(MAX_SLOTS, Math.trunc(n) || 1))

/**
 * Rental cost per group, then per kind for the items in no group; items marked `unbilled` are
 * listed but not charged
 */
export function summarizeCost(items: readonly LayoutItem[], priceMode: PriceMode, slots: number) {
  const rent = (k: number) => {
    const p = priceOf(items[k]!.t)
    return p && !items[k]!.unbilled ? p[priceMode] * slots : 0
  }
  const byGroup = new Map<string, number[]>()
  const byType = new Map<FurnitureType, number[]>()
  items.forEach((i, k) => {
    if (i.group) byGroup.set(i.group, [...(byGroup.get(i.group) ?? []), k])
    else byType.set(i.t, [...(byType.get(i.t) ?? []), k])
  })
  const groups: GroupLine[] = [...byGroup].map(([name, indices]) => {
    const rented = indices.filter((k) => priceOf(items[k]!.t))
    return {
      name,
      indices,
      rented: rented.length,
      billed: rented.filter((k) => !items[k]!.unbilled).length,
      subtotal: indices.reduce((s, k) => s + rent(k), 0),
    }
  })
  const lines: CostLine[] = FURNITURE_TYPES.flatMap((t) => {
    const indices = byType.get(t) ?? []
    const price = priceOf(t)
    if (!indices.length || !price) return []
    const billed = indices.filter((k) => !items[k]!.unbilled).length
    return [
      {
        type: t,
        indices,
        count: indices.length,
        billed,
        subtotal: price[priceMode] * billed * slots,
      },
    ]
  })
  const sum = (ls: readonly { subtotal: number }[]) => ls.reduce((s, l) => s + l.subtotal, 0)
  return { groups, lines, total: sum(groups) + sum(lines) }
}

/** Accepts either a bare item array or an exported `{ items: [...] }` file; drops unknown/invalid entries. */
/** Types that were merged into one type with colour variants */
const LEGACY: Record<string, { t: FurnitureType; v: string }> = {
  shapeO: { t: 'shapeSofa', v: 'orange' },
  shapeG: { t: 'shapeSofa', v: 'green' },
}

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** The most links one 動線點 keeps */
const MAX_LINKS = 32

export function parseLayout(data: unknown): LayoutItem[] {
  const list = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items
  if (!Array.isArray(list)) throw new Error('Invalid layout')
  // an id seen twice (a hand-edited file) is dropped from the later item, which then gets a new one
  const ids = new Set<string>()
  return list.flatMap((i): LayoutItem[] => {
    const legacy = i && typeof i.t === 'string' ? LEGACY[i.t] : undefined
    const t: unknown = legacy?.t ?? i?.t
    if (!isFurnitureType(t) || !Number.isFinite(i.x) || !Number.isFinite(i.z)) return []
    const v = resolveVariant(t, legacy?.v ?? i.v)
    const cut: unknown[] = Array.isArray(i.cut) ? i.cut : []
    const cuts = cut.filter((c): c is number => Number.isFinite(c))
    const [dw, dh] = defaultSizeOf(t)
    const tag = cleanTag(i.tag)
    const info = cleanInfo(i.info)
    const group = cleanTag(i.group)
    const groupTag = group ? cleanTag(i.groupTag) : ''
    const groupColor = group && isHexColor(i.groupColor) ? i.groupColor.toLowerCase() : ''
    const groupInfo = group ? cleanInfo(i.groupInfo) : ''
    const sit = t === 'person' && i.sit === true
    const n = t === 'person' && !sit ? clampPeople(i.n) : 1
    const coloured = t === 'person' || t === 'zone'
    // a 動線點's colour is its path's; its tag has its own
    const color = (coloured || t === 'pathNode') && isHexColor(i.color) ? i.color.toLowerCase() : ''
    const tagColor = !coloured && tag && isHexColor(i.tagColor) ? i.tagColor.toLowerCase() : ''
    const id = isUuid(i.id) && !ids.has(i.id.toLowerCase()) ? i.id.toLowerCase() : ''
    const links =
      t === 'pathNode' && Array.isArray(i.links)
        ? [...new Set((i.links as unknown[]).filter(isUuid).map((l) => l.toLowerCase()))]
            .filter((l) => l !== id)
            .slice(0, MAX_LINKS)
        : []
    const auto =
      i.auto === true
        ? links
        : Array.isArray(i.auto)
          ? links.filter((l) =>
              (i.auto as unknown[]).some((a) => isUuid(a) && a.toLowerCase() === l),
            )
          : []
    const pts =
      t === 'zone' && Array.isArray(i.pts)
        ? cleanCorners(
            (i.pts as unknown[]).flatMap((p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((v) => Number.isFinite(v) && Math.abs(v) <= ZONE_MAX)
                ? [[p[0], p[1]] as [number, number]]
                : [],
            ),
          )
        : null
    if (id) ids.add(id)
    return [
      {
        ...(id ? { id } : {}),
        t,
        x: i.x,
        y: Number.isFinite(i.y) ? i.y : undefined,
        z: i.z,
        r: Number.isFinite(i.r) ? i.r : 0,
        ...(v ? { v } : {}),
        ...(takesImage(t) && isImageDataUrl(i.img) ? { img: i.img } : {}),
        ...(isResizable(t)
          ? {
              w: clampPosterSize(i.w, dw),
              h: clampPosterSize(i.h, dh),
              ...(i.lock === true ? { lock: true } : {}),
            }
          : {}),
        ...(cuts.length ? { cut: cuts } : {}),
        ...(tag ? { tag } : {}),
        ...(n > 1 ? { n } : {}),
        ...(color ? { color } : {}),
        ...(tagColor ? { tagColor } : {}),
        ...(info ? { info } : {}),
        ...(sit ? { sit } : {}),
        ...(t === 'person' && isPersonHeight(i.height) && i.height !== PERSON_HEIGHT
          ? { height: i.height }
          : {}),
        ...(priceOf(t) && i.unbilled === true ? { unbilled: true } : {}),
        ...(group ? { group } : {}),
        ...(groupTag ? { groupTag } : {}),
        ...(groupColor ? { groupColor } : {}),
        ...(groupInfo ? { groupInfo } : {}),
        ...(t === 'laptop' && i.open !== undefined ? { open: clampLid(i.open) } : {}),
        ...(t === 'tvCart' && i.lift !== undefined ? { lift: clampLift(i.lift) } : {}),
        ...(t === 'zone'
          ? pts
            ? { w: +cornerBounds(pts).w.toFixed(3), d: +cornerBounds(pts).d.toFixed(3), pts }
            : { w: clampZone(i.w, 2), d: clampZone(i.d, 2) }
          : {}),
        ...(t === 'zone' && i.locked === true ? { locked: true } : {}),
        ...(links.length ? { links } : {}),
        ...(auto.length ? { auto } : {}),
        ...(t === 'pathNode' && isPathSpeed(i.speed) && i.speed !== PATH_SPEED
          ? { speed: i.speed }
          : {}),
      },
    ]
  })
}

/** How the rent is worked out: 自助搬運 or 含搬運, and how many 時段 (the price list's unit) */
export interface Pricing {
  priceMode: PriceMode
  slots: number
}

/**
 * The exported file: the items, the floors they stand on, and (when given) the pricing the
 * total was worked out with and the colour rows people pick from. Given more than one scene,
 * it holds them all (`scenes`) in place of `items`.
 */
export function exportLayout(
  items: readonly LayoutItem[],
  {
    pricing,
    palettes,
    scenes,
  }: {
    pricing?: Pricing
    palettes?: Record<string, readonly string[]>
    scenes?: readonly Scene[]
  } = {},
) {
  return JSON.stringify(
    {
      venue: 'NCCU-CPBAE-A2F',
      event: 'VueConf Taiwan 2026',
      floors: FLOORS,
      ...(scenes && scenes.length > 1 ? { scenes } : { items }),
      ...(pricing ? { pricing } : {}),
      ...(palettes ? { palettes } : {}),
    },
    null,
    2,
  )
}

/** The pricing in an exported file (`pricing`); each part only when it is usable */
export function readPricing(file: unknown): Partial<Pricing> {
  const p = (file as { pricing?: unknown } | null)?.pricing as
    | { priceMode?: unknown; slots?: unknown }
    | undefined
  if (!p || typeof p !== 'object') return {}
  return {
    ...(p.priceMode === 0 || p.priceMode === 1 ? { priceMode: p.priceMode } : {}),
    ...(typeof p.slots === 'number' && Number.isFinite(p.slots)
      ? { slots: clampSlots(p.slots) }
      : {}),
  }
}

export function demoLayout(): LayoutItem[] {
  const L: LayoutItem[] = []
  L.push(
    { t: 'table3', x: 15.3, z: 2.6, r: 0 },
    { t: 'table3', x: 17.3, z: 2.6, r: 0 },
    { t: 'table2', x: 19.1, z: 2.6, r: 0 },
  )
  for (let i = 0; i < 4; i++) L.push({ t: 'foldBlack', x: 14.8 + i * 1.2, z: 1.9, r: 0 })
  L.push({ t: 'sign', x: 13.3, z: 2.6, r: 0 }, { t: 'sign', x: 20.6, z: 2.6, r: 0 })
  for (let i = 0; i < 5; i++) L.push({ t: 'stanchion', x: 13.3 + i * 1.8, z: 4.2, r: 0 })
  for (const [x, z] of [
    [14.5, 8.5],
    [20, 8.5],
    [17.2, 12.5],
  ] as const) {
    L.push({ t: 'foldTable', x, z, r: 0 })
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2
      L.push({
        t: 'stoolHigh',
        x: x + Math.cos(a) * 0.75,
        z: z + Math.sin(a) * 0.75,
        r: -a - Math.PI / 2,
      })
    }
  }
  L.push(
    { t: 'whiteSofa', x: 20.6, z: 26.95, r: 0 },
    { t: 'whiteSofa', x: 22.2, z: 26.95, r: 0 },
    { t: 'teaWhite', x: 21.4, z: 28.05, r: 0 },
    { t: 'armchair', x: 21.4, z: 29.05, r: Math.PI },
  )
  return L
}

/** A layout file's items, moved on to today's floors from the ones it was saved on */
export function readLayoutFile(file: unknown): LayoutItem[] {
  const floors = Array.isArray(file) ? 1 : floorsOf((file as { floors?: unknown } | null)?.floors)
  return toCurrentFloors(parseLayout(file), floors)
}

/**
 * The scenes in a layout file that holds more than one (`scenes`), on today's floors; null for
 * a file of one layout (`items`, or a bare list). Unusable scenes are dropped, past SCENE_MAX
 * too; none left is an invalid file.
 */
export function readScenesFile(file: unknown): Scene[] | null {
  const list = (file as { scenes?: unknown } | null)?.scenes
  if (Array.isArray(file) || list === undefined) return null
  const floors = floorsOf((file as { floors?: unknown }).floors)
  const scenes = parseScenes(list, floors)
  if (!scenes.length) throw new Error('Invalid layout')
  return scenes
}

/** A layout of its own, one of a project's scenes (e.g. a session of the day); picked by its id */
export interface Scene {
  id: string
  name: string
  items: LayoutItem[]
}

/** The most scenes a project holds, and the longest name one keeps */
export const SCENE_MAX = 20
export const SCENE_NAME_MAX = 40

export const cleanSceneName = (s: unknown) =>
  typeof s === 'string' ? [...s.trim()].slice(0, SCENE_NAME_MAX).join('') : ''

/** A new scene's id */
export const sceneId = () => crypto.randomUUID()

/**
 * Scenes as read from a file or storage, on `floors`: each with an id (a new one when its own
 * is missing or seen before), a name (or `Scene n` for want of one) and its items
 */
function parseScenes(list: unknown, floors: number): Scene[] {
  if (!Array.isArray(list)) return []
  const ids = new Set<string>()
  return list.slice(0, SCENE_MAX).flatMap((s, k): Scene[] => {
    if (!s || typeof s !== 'object' || !Array.isArray((s as { items?: unknown }).items)) return []
    const raw = (s as { id?: unknown }).id
    const id = isUuid(raw) && !ids.has(raw.toLowerCase()) ? raw.toLowerCase() : sceneId()
    ids.add(id)
    const name = cleanSceneName((s as { name?: unknown }).name) || `Scene ${k + 1}`
    return [{ id, name, items: toCurrentFloors(parseLayout(s), floors) }]
  })
}

/**
 * The scenes kept in this browser; from before there were scenes, its one layout as the first
 * (named `name`); null when there's nothing kept
 */
export function loadSavedScenes(name: string): Scene[] | null {
  const saved = readJSON(SCENES_KEY) as { scenes?: unknown } | null
  const scenes = parseScenes(saved?.scenes, FLOORS)
  if (scenes.length) return scenes
  const before = loadSavedLayout()
  return before ? [{ id: sceneId(), name, items: before }] : null
}
/** Returns false when the browser refused to store them (e.g. large poster images over quota) */
export function saveScenes(scenes: readonly Scene[]) {
  const ok = writeJSON(SCENES_KEY, { scenes })
  // kept now as scenes: the layouts from before aren't needed (and would hold the quota)
  if (ok) {
    removeKey(STORAGE_KEY)
    removeKey(STORAGE_KEY_FLOORS1)
  }
  return ok
}

export function loadSavedLayout(): LayoutItem[] | null {
  const saved = readJSON(STORAGE_KEY)
  if (Array.isArray(saved)) return parseLayout(saved)
  const before = readJSON(STORAGE_KEY_FLOORS1)
  return Array.isArray(before) ? toCurrentFloors(parseLayout(before), 1) : null
}
/** Returns false when the browser refused to store it (e.g. large poster images over quota) */
export function saveLayout(items: readonly LayoutItem[]) {
  const ok = writeJSON(STORAGE_KEY, items)
  // kept now on today's floors: the copy from before isn't needed (and would hold the quota)
  if (ok) removeKey(STORAGE_KEY_FLOORS1)
  return ok
}

/**
 * What the scenes cost to rent together: the same furniture serves every scene, so each kind is
 * rented as many times as the scene using most of it needs (its billed items)
 */
export function rentAcrossScenes(
  scenes: readonly { items: readonly LayoutItem[] }[],
  priceMode: PriceMode,
  slots: number,
) {
  const most = new Map<FurnitureType, number>()
  for (const { items } of scenes) {
    const n = new Map<FurnitureType, number>()
    for (const i of items) if (priceOf(i.t) && !i.unbilled) n.set(i.t, (n.get(i.t) ?? 0) + 1)
    for (const [t, k] of n) most.set(t, Math.max(most.get(t) ?? 0, k))
  }
  let total = 0
  for (const [t, k] of most) total += priceOf(t)![priceMode] * k * slots
  return total
}

export function loadPricing(): { priceMode: PriceMode; slots: number } {
  const p = readJSON(PRICE_KEY) as { priceMode?: number; slots?: number } | null
  return { priceMode: p?.priceMode === 1 ? 1 : 0, slots: clampSlots(p?.slots ?? 1) }
}
export const savePricing = (priceMode: PriceMode, slots: number) =>
  writeJSON(PRICE_KEY, { priceMode, slots })
