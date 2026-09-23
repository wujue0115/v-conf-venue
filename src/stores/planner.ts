import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import type { SelectionInfo } from '@/venue/VenueEditor'
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

const SIDEBAR_KEY = 'vueconf26-sidebar-collapsed'

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

  const snap = shallowRef(true)
  const wallsCut = shallowRef(false)
  const showLabels = shallowRef(true)
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

  watch(items, saveLayout)
  watch([priceMode, slots], ([m, s]) => savePricing(m, s))
  watch(sidebarCollapsed, (v) => writeJSON(SIDEBAR_KEY, v))

  return {
    initialItems,
    items,
    selection,
    fixedSeats,
    priceMode,
    slots,
    snap,
    wallsCut,
    showLabels,
    sidebarCollapsed,
    toast,
    cost,
    setSlots,
    notify,
  }
})
