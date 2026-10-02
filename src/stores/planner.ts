import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { SelectionInfo } from '@/venue/VenueEditor'
import type { FurnitureType } from '@/venue/furniture'
import {
  clampSlots,
  demoLayout,
  loadPricing,
  loadSavedLayout,
  saveLayout,
  savePricing,
  summarizeCost,
  type LayoutItem,
  type PriceMode,
  type Pricing,
} from '@/venue/layout'
import { readJSON, writeJSON } from '@/venue/storage'
import { t } from '@/i18n'

const SIDEBAR_KEY = 'vueconf26-sidebar-collapsed'
const MODE_KEY = 'vueconf26-mode'

/** 'view' only looks around; 'edit' can place and change objects */
export type PlannerMode = 'view' | 'edit'

/**
 * UI-facing planner state. The three.js scene (VenueEditor) is the source of
 * truth for object transforms and reports snapshots here via `items`.
 */
/** How long a toast shows: 2.2s, more for a long one, up to 6s */
export const toastDuration = (message: string) =>
  Math.min(6000, Math.max(2200, message.length * 70))

export const usePlannerStore = defineStore('planner', () => {
  /**
   * The cloud project being edited, or null for the layout kept in this browser. Only the
   * browser's own layout is written to its storage; a project saves itself (stores/project.ts).
   */
  const projectId = shallowRef<string | null>(null)
  /** A shared project this person may only look at: Edit mode is off and can't be chosen */
  const readOnly = shallowRef(false)
  /** The layout: what the editor starts from when it mounts, then its latest snapshot */
  const items = shallowRef<LayoutItem[]>([])
  const selection = shallowRef<SelectionInfo | null>(null)
  const fixedSeats = shallowRef(0)
  /** Whether the editor has a step to undo / redo (reported by it) */
  const canUndo = shallowRef(false)
  const canRedo = shallowRef(false)

  const priceMode = shallowRef<PriceMode>(0)
  const slots = shallowRef(1)

  /** Work on the layout kept in this browser (as saved, or the demo the first time) */
  function openLocal() {
    projectId.value = null
    readOnly.value = false
    items.value = loadSavedLayout() ?? demoLayout()
    const pricing = loadPricing()
    priceMode.value = pricing.priceMode
    slots.value = pricing.slots
  }
  /** Work on a cloud project's layout (only looking, `readOnly`); the browser's own stays as it is */
  function openProject(
    id: string,
    list: LayoutItem[],
    pricing: Partial<Pricing> = {},
    { readOnly: ro = false } = {},
  ) {
    projectId.value = id
    readOnly.value = ro
    items.value = list
    priceMode.value = pricing.priceMode ?? 0
    slots.value = clampSlots(pricing.slots ?? 1)
  }
  openLocal()

  // First visit opens in view mode so nothing gets moved by accident
  const mode = shallowRef<PlannerMode>(readJSON(MODE_KEY) === 'edit' ? 'edit' : 'view')
  const editing = computed(() => mode.value === 'edit' && !readOnly.value)
  const snap = shallowRef(true)
  /** 多選: taps add to the selection and drags on empty space box-select (for touch screens) */
  const multiSelect = shallowRef(false)
  const wallsCut = shallowRef(false)
  const showLabels = shallowRef(true)
  const shadows = shallowRef(true)
  /** Kinds of item hidden from the scene (設定 → 物件顯示); they stay in the layout */
  const hiddenTypes = shallowRef<readonly FurnitureType[]>([])
  /** Kinds of item whose tags are hidden (設定 → 標籤顯示); the tags are kept */
  const hiddenTagTypes = shallowRef<readonly FurnitureType[]>([])
  /** Whether groups' tags and groups' ⓘ notes show (設定 → 標籤顯示 / 資訊顯示) */
  const showGroupTags = shallowRef(true)
  const showGroupInfo = shallowRef(true)
  /** Kinds of item whose ⓘ note buttons are hidden (設定 → 資訊顯示); the notes are kept */
  const hiddenInfoTypes = shallowRef<readonly FurnitureType[]>([])
  const toggled = (
    list: readonly FurnitureType[],
    types: readonly FurnitureType[],
    on: boolean,
  ) => {
    const rest = list.filter((t) => !types.includes(t))
    return on ? rest : [...rest, ...types]
  }
  function setTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenTypes.value = toggled(hiddenTypes.value, types, on)
  }
  function setTagTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenTagTypes.value = toggled(hiddenTagTypes.value, types, on)
  }
  function setInfoTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenInfoTypes.value = toggled(hiddenInfoTypes.value, types, on)
  }
  const savedSidebar = readJSON(SIDEBAR_KEY)
  // First visit on a phone: start collapsed so the venue is visible
  const sidebarCollapsed = shallowRef(
    typeof savedSidebar === 'boolean'
      ? savedSidebar
      : !!globalThis.matchMedia?.('(max-width: 720px)').matches,
  )

  /** The last toast, and when it was given (a toast shown again after the page changes under it) */
  const toast = shallowRef<{ id: number; message: string; at: number } | null>(null)
  /** ⚙ 設定 or ? 操作說明 showing (on phones they open from ☰) */
  const panel = shallowRef<'settings' | 'help' | null>(null)
  let toastId = 0

  const cost = computed(() => summarizeCost(items.value, priceMode.value, slots.value))

  function setSlots(n: number) {
    slots.value = clampSlots(n)
  }
  function notify(message: string) {
    toast.value = { id: ++toastId, message, at: Date.now() }
  }

  // Poster images can push the layout past the browser's storage quota: say so once
  let saveFailed = false
  watch(items, (list) => {
    if (projectId.value) return
    const ok = saveLayout(list)
    if (!ok && !saveFailed) notify(t().toast.saveFailed)
    saveFailed = !ok
  })
  watch([priceMode, slots], ([m, s]) => {
    if (!projectId.value) savePricing(m, s)
  })
  watch(sidebarCollapsed, (v) => writeJSON(SIDEBAR_KEY, v))
  watch(mode, (v) => {
    writeJSON(MODE_KEY, v)
    // every switch of mode starts with 多選 off, so a tap selects just one item again
    multiSelect.value = false
  })

  return {
    projectId,
    readOnly,
    openLocal,
    openProject,
    items,
    selection,
    fixedSeats,
    canUndo,
    canRedo,
    priceMode,
    slots,
    mode,
    editing,
    snap,
    multiSelect,
    wallsCut,
    showLabels,
    shadows,
    hiddenTypes,
    setTypesVisible,
    hiddenTagTypes,
    setTagTypesVisible,
    hiddenInfoTypes,
    setInfoTypesVisible,
    showGroupTags,
    showGroupInfo,
    sidebarCollapsed,
    panel,
    toast,
    cost,
    setSlots,
    notify,
  }
})

// In dev, swap in the store's new setup when it (or a module it uses, like layout.ts) changes;
// otherwise the running store keeps the old code, e.g. a stale cost summary
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePlannerStore, import.meta.hot))
