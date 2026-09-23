import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../planner'
import { PRICE_KEY, STORAGE_KEY } from '@/venue/layout'

describe('planner store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts from the demo layout when nothing is saved', () => {
    const store = usePlannerStore()
    expect(store.items.length).toBeGreaterThan(0)
    expect(store.cost.total).toBeGreaterThan(0)
  })

  it('restores a saved layout and pricing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ t: 'sign', x: 1, y: 0, z: 1, r: 0 }]))
    localStorage.setItem(PRICE_KEY, JSON.stringify({ priceMode: 1, slots: 3 }))
    const store = usePlannerStore()
    expect(store.items).toHaveLength(1)
    expect(store.cost.total).toBe(500 * 3)
  })

  it('persists item and pricing changes', async () => {
    const store = usePlannerStore()
    store.items = [{ t: 'table2', x: 0, z: 0, r: 0 }]
    store.setSlots(20)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(PRICE_KEY)!)).toEqual({ priceMode: 0, slots: 9 })
  })

  it('remembers whether the sidebar is collapsed', async () => {
    const store = usePlannerStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.sidebarCollapsed = true
    await nextTick()
    setActivePinia(createPinia())
    expect(usePlannerStore().sidebarCollapsed).toBe(true)
  })
})
