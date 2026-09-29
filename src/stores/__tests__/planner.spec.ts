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

  it('lists where the items of each rented kind are, and how many are billed', () => {
    const store = usePlannerStore()
    store.items = [
      { t: 'table2', x: 0, z: 0, r: 0 },
      { t: 'person', x: 0, z: 0, r: 0 },
      { t: 'table2', x: 1, z: 0, r: 0, unbilled: true },
    ]
    expect(store.cost.lines.map((l) => [l.type, l.indices, l.billed])).toEqual([
      ['table2', [0, 2], 1],
    ])
  })

  it('turns 多選 off whenever the mode changes', async () => {
    const store = usePlannerStore()
    store.mode = 'edit'
    await nextTick()
    store.multiSelect = true
    store.mode = 'view'
    await nextTick()
    expect(store.multiSelect).toBe(false)
    store.multiSelect = true
    store.mode = 'edit'
    await nextTick()
    expect(store.multiSelect).toBe(false)
  })

  it('hides and shows kinds of item without duplicates', () => {
    const store = usePlannerStore()
    store.setTypesVisible(['table2', 'person'], false)
    store.setTypesVisible(['person', 'laptop'], false)
    expect([...store.hiddenTypes].sort()).toEqual(['laptop', 'person', 'table2'])
    store.setTypesVisible(['person'], true)
    expect([...store.hiddenTypes].sort()).toEqual(['laptop', 'table2'])
  })
})
