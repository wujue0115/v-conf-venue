import { clampLid } from './laptop'
import { clampPosterSize, isImageDataUrl } from './poster'
import { readJSON, writeJSON } from './storage'
import { clampZone } from './zone'
import {
  FURNITURE_TYPES,
  defaultSizeOf,
  isFurnitureType,
  isResizable,
  priceOf,
  resolveVariant,
  takesImage,
  PEOPLE_MAX,
  type FurnitureType,
} from './furniture'

/** One placed object. `y` omitted → dropped onto the floor below (x, z). `r` is rotation around Y in radians. */
export interface LayoutItem {
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
  /** People only: how many figures the item shows (1–6; absent means 1) */
  n?: number
  /** People and zones: colour as #rrggbb (absent means the default) */
  color?: string
  /** People only: sitting on the seat at this position (always a single figure) */
  sit?: boolean
  /** Zones only: depth in metres along local z (their width is `w`) */
  d?: number
  /** Laptops only: lid opening in degrees, 0 (shut) to LID_MAX (absent means LID_OPEN) */
  open?: number
  /** Stanchions only: bearings (radians) of auto-linked belts the user removed at this post */
  cut?: number[]
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

export const STORAGE_KEY = 'vueconf26-nccu-layout-v4'
export const PRICE_KEY = STORAGE_KEY + '-price'
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

export function parseLayout(data: unknown): LayoutItem[] {
  const list = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items
  if (!Array.isArray(list)) throw new Error('Invalid layout')
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
    const sit = t === 'person' && i.sit === true
    const n = t === 'person' && !sit ? clampPeople(i.n) : 1
    const coloured = t === 'person' || t === 'zone'
    const color = coloured && isHexColor(i.color) ? i.color.toLowerCase() : ''
    const tagColor = !coloured && tag && isHexColor(i.tagColor) ? i.tagColor.toLowerCase() : ''
    return [
      {
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
        ...(priceOf(t) && i.unbilled === true ? { unbilled: true } : {}),
        ...(group ? { group } : {}),
        ...(t === 'laptop' && i.open !== undefined ? { open: clampLid(i.open) } : {}),
        ...(t === 'zone' ? { w: clampZone(i.w, 2), d: clampZone(i.d, 2) } : {}),
      },
    ]
  })
}

export function exportLayout(items: readonly LayoutItem[]) {
  return JSON.stringify({ venue: 'NCCU-CPBAE-A2F', event: 'VueConf Taiwan 2026', items }, null, 2)
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
    { t: 'whiteSofa', x: 20.6, z: 26.2, r: 0 },
    { t: 'whiteSofa', x: 22.2, z: 26.2, r: 0 },
    { t: 'teaWhite', x: 21.4, z: 27.4, r: 0 },
    { t: 'armchair', x: 21.4, z: 28.7, r: Math.PI },
  )
  L.push({ t: 'woodLectern', x: 31.6, y: 0.9, z: 35.5, r: -Math.PI / 2 })
  return L
}

export function loadSavedLayout(): LayoutItem[] | null {
  const saved = readJSON(STORAGE_KEY)
  return Array.isArray(saved) ? parseLayout(saved) : null
}
/** Returns false when the browser refused to store it (e.g. large poster images over quota) */
export const saveLayout = (items: readonly LayoutItem[]) => writeJSON(STORAGE_KEY, items)

export function loadPricing(): { priceMode: PriceMode; slots: number } {
  const p = readJSON(PRICE_KEY) as { priceMode?: number; slots?: number } | null
  return { priceMode: p?.priceMode === 1 ? 1 : 0, slots: clampSlots(p?.slots ?? 1) }
}
export const savePricing = (priceMode: PriceMode, slots: number) =>
  writeJSON(PRICE_KEY, { priceMode, slots })
