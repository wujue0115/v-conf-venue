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
export const usePlannerStore = defineStore('planner', () => {
  /** Layout to seed the editor with on mount */
  const initialItems = loadSavedLayout() ?? demoLayout()
  const items = shallowRef<LayoutItem[]>(initialItems)
  const selection = shallowRef<SelectionInfo | null>(null)
  const fixedSeats = shallowRef(0)

  const pricing = loadPricing()
  const priceMode = shallowRef<PriceMode>(pricing.priceMode)
  const slots = shallowRef(pricing.slots)

  // First visit opens in view mode so nothing gets moved by accident
  const mode = shallowRef<PlannerMode>(readJSON(MODE_KEY) === 'edit' ? 'edit' : 'view')
  const editing = computed(() => mode.value === 'edit')
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

  const toast = shallowRef<{ id: number; message: string } | null>(null)
  let toastId = 0

  const cost = computed(() => summarizeCost(items.value, priceMode.value, slots.value))

  function setSlots(n: number) {
    slots.value = clampSlots(n)
  }
  function notify(message: string) {
    toast.value = { id: ++toastId, message }
  }

  // Poster images can push the layout past the browser's storage quota: say so once
  let saveFailed = false
  watch(items, (list) => {
    const ok = saveLayout(list)
    if (!ok && !saveFailed) notify(t().toast.saveFailed)
    saveFailed = !ok
  })
  watch([priceMode, slots], ([m, s]) => savePricing(m, s))
  watch(sidebarCollapsed, (v) => writeJSON(SIDEBAR_KEY, v))
  watch(mode, (v) => writeJSON(MODE_KEY, v))

  return {
    initialItems,
    items,
    selection,
    fixedSeats,
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
    sidebarCollapsed,
    toast,
    cost,
    setSlots,
    notify,
  }
})

// In dev, swap in the store's new setup when it (or a module it uses, like layout.ts) changes;
// otherwise the running store keeps the old code, e.g. a stale cost summary
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePlannerStore, import.meta.hot))
