import { shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { PERSON_COLOR, TAG_COLOR } from '@/venue/furniture'
import { isHexColor } from '@/venue/layout'
import { readJSON, writeJSON } from '@/venue/storage'
import { ZONE_COLOR } from '@/venue/zone'

/** The quick-pick colour rows: people's colour, zones' colour, and tags' (items' and groups') */
export type PaletteKind = 'person' | 'zone' | 'tag'

/**
 * Where each row starts. People get a light skin tone and soft tints so figures don't
 * overpower the furniture.
 */
export const DEFAULT_PALETTES: Record<PaletteKind, readonly string[]> = {
  person: [PERSON_COLOR, '#42b883', '#8fb3d9', '#f2cf73', '#ec9a93', '#8a8f99'],
  zone: [ZONE_COLOR, '#4a90d9', '#edb32a', '#e57373', '#9575cd', '#8a8f99'],
  tag: [TAG_COLOR, '#42b883', '#4a90d9', '#edb32a', '#e57373', '#9575cd'],
}

const KEY = 'vueconf26-palettes'
/** Most colours one row keeps */
export const PALETTE_MAX = 24

/** A usable row: lower-case #rrggbb, each once, in order, at least one (else the default) */
export function cleanPalette(list: unknown, fallback: readonly string[]): string[] {
  const out = Array.isArray(list)
    ? [...new Set(list.filter(isHexColor).map((c) => c.toLowerCase()))].slice(0, PALETTE_MAX)
    : []
  return out.length ? out : [...fallback]
}

const KINDS: readonly PaletteKind[] = ['person', 'zone', 'tag']

/** The colour rows in an exported layout file (`palettes`), each kept only if usable */
export function readPalettes(file: unknown): Partial<Record<PaletteKind, string[]>> {
  const p = (file as { palettes?: unknown } | null)?.palettes
  if (!p || typeof p !== 'object') return {}
  const out: Partial<Record<PaletteKind, string[]>> = {}
  for (const k of KINDS) {
    const row = cleanPalette((p as Record<string, unknown>)[k], [])
    if (row.length) out[k] = row
  }
  return out
}

/**
 * The colour rows people pick from, which they can grow (a custom colour joins its row),
 * reorder, retune and prune. Kept in the browser, and written into (and read back from) an
 * exported layout file alongside its items.
 */
export const usePalettesStore = defineStore('palettes', () => {
  const saved = readJSON(KEY) as Partial<Record<PaletteKind, unknown>> | null
  const palettes = shallowRef<Record<PaletteKind, string[]>>({
    person: cleanPalette(saved?.person, DEFAULT_PALETTES.person),
    zone: cleanPalette(saved?.zone, DEFAULT_PALETTES.zone),
    tag: cleanPalette(saved?.tag, DEFAULT_PALETTES.tag),
  })
  watch(palettes, (v) => writeJSON(KEY, v))

  function setPalette(kind: PaletteKind, list: readonly string[]) {
    palettes.value = { ...palettes.value, [kind]: cleanPalette(list, palettes.value[kind]) }
  }
  function resetPalette(kind: PaletteKind) {
    setPalette(kind, DEFAULT_PALETTES[kind])
  }
  /** Take on the colour rows an imported layout file carries (rows it lacks stay as they are) */
  function importPalettes(file: unknown) {
    const rows = readPalettes(file)
    if (Object.keys(rows).length) palettes.value = { ...palettes.value, ...rows }
  }

  return { palettes, setPalette, resetPalette, importPalettes }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePalettesStore, import.meta.hot))
