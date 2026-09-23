import { FURNITURE, FURNITURE_TYPES, isFurnitureType, type FurnitureType } from './furniture'

/** One placed object. `y` omitted → dropped onto the floor below (x, z). `r` is rotation around Y in radians. */
export interface LayoutItem {
  t: FurnitureType
  x: number
  y?: number
  z: number
  r: number
}

/** 0 = 自助搬運 (self-carry), 1 = 含搬運 (with carrying service) */
export type PriceMode = 0 | 1

export interface CostLine {
  type: FurnitureType
  name: string
  count: number
  subtotal: number
}

export const STORAGE_KEY = 'vueconf26-nccu-layout-v4'
export const PRICE_KEY = STORAGE_KEY + '-price'
export const MAX_SLOTS = 9

export const formatNT = (n: number) => 'NT$ ' + n.toLocaleString('en-US')

export const clampSlots = (n: number) => Math.max(1, Math.min(MAX_SLOTS, Math.trunc(n) || 1))

export function summarizeCost(items: readonly LayoutItem[], priceMode: PriceMode, slots: number) {
  const counts = new Map<FurnitureType, number>()
  for (const i of items) counts.set(i.t, (counts.get(i.t) ?? 0) + 1)
  const lines: CostLine[] = FURNITURE_TYPES.filter((t) => counts.has(t)).map((t) => {
    const count = counts.get(t) ?? 0
    return {
      type: t,
      name: FURNITURE[t].name,
      count,
      subtotal: FURNITURE[t].price[priceMode] * count * slots,
    }
  })
  return { lines, total: lines.reduce((s, l) => s + l.subtotal, 0) }
}

/** Accepts either a bare item array or an exported `{ items: [...] }` file; drops unknown/invalid entries. */
export function parseLayout(data: unknown): LayoutItem[] {
  const list = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items
  if (!Array.isArray(list)) throw new Error('Invalid layout')
  return list.flatMap((i): LayoutItem[] => {
    if (!i || !isFurnitureType(i.t) || !Number.isFinite(i.x) || !Number.isFinite(i.z)) return []
    return [
      {
        t: i.t,
        x: i.x,
        y: Number.isFinite(i.y) ? i.y : undefined,
        z: i.z,
        r: Number.isFinite(i.r) ? i.r : 0,
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

// localStorage can throw (private mode, blocked storage) — never let that break the planner.
function readJSON(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function loadSavedLayout(): LayoutItem[] | null {
  const saved = readJSON(STORAGE_KEY)
  return Array.isArray(saved) ? parseLayout(saved) : null
}
export const saveLayout = (items: readonly LayoutItem[]) => writeJSON(STORAGE_KEY, items)

export function loadPricing(): { priceMode: PriceMode; slots: number } {
  const p = readJSON(PRICE_KEY) as { priceMode?: number; slots?: number } | null
  return { priceMode: p?.priceMode === 1 ? 1 : 0, slots: clampSlots(p?.slots ?? 1) }
}
export const savePricing = (priceMode: PriceMode, slots: number) =>
  writeJSON(PRICE_KEY, { priceMode, slots })
