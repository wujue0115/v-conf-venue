import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../planner'
import { t } from '@/i18n'
import { PRICE_KEY, SCENES_KEY, SCENE_MAX, STORAGE_KEY, type LayoutItem } from '@/venue/layout'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
/** A scene's name as it's given when new */
const nth = (n: number) => t().scenes.defaultName(n)
const sign = (id: string, x = 1): LayoutItem => ({ id, t: 'sign', x, y: 0, z: 1, r: 0 })

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
    const kept = JSON.parse(localStorage.getItem(SCENES_KEY)!)
    expect(kept.scenes).toHaveLength(1)
    expect(kept.scenes[0].items).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(PRICE_KEY)!)).toEqual({ priceMode: 0, slots: 9 })
  })

  describe('scenes', () => {
    it('moves the layout kept before scenes into the first scene, and forgets the old copy', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([sign(A)]))
      const store = usePlannerStore()
      expect(store.scenes).toHaveLength(1)
      expect(store.scenes[0]!.name).toBe(nth(1))
      expect(store.items.map((i) => i.id)).toEqual([A])
      store.items = [sign(A, 2)]
      await nextTick()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      setActivePinia(createPinia())
      expect(usePlannerStore().items[0]!.x).toBe(2)
    })

    it('adds a copy after the scene shown, keeping its items’ ids, and shows it', () => {
      const store = usePlannerStore()
      store.items = [sign(A)]
      const first = store.sceneId
      const s = store.addScene({ copy: true })!
      expect(s.name).toBe(nth(2))
      expect(store.sceneId).toBe(s.id)
      expect(store.items.map((i) => i.id)).toEqual([A])
      store.setScene(first)
      store.addScene({ copy: false })
      expect(store.scenes.map((x) => x.name)).toEqual([nth(1), nth(3), nth(2)])
      expect(store.items).toEqual([])
    })

    it('keeps each scene’s layout apart', async () => {
      const store = usePlannerStore()
      store.items = [sign(A)]
      const first = store.sceneId
      store.addScene({ copy: false })
      store.items = [sign(B)]
      await nextTick()
      store.setScene(first)
      expect(store.items.map((i) => i.id)).toEqual([A])
      expect(store.scenes[1]!.items.map((i) => i.id)).toEqual([B])
    })

    it('stops at SCENE_MAX', () => {
      const store = usePlannerStore()
      for (let k = 1; k < SCENE_MAX; k++) expect(store.addScene({ copy: false })).not.toBeNull()
      expect(store.addScene({ copy: false })).toBeNull()
      expect(store.scenes).toHaveLength(SCENE_MAX)
    })

    it('deletes a scene, never the last, showing its neighbour when it was shown', () => {
      const store = usePlannerStore()
      const first = store.sceneId
      store.deleteScene(first)
      expect(store.scenes).toHaveLength(1)
      const second = store.addScene({ copy: false })!.id
      store.addScene({ copy: false })
      store.setScene(second)
      store.deleteScene(second)
      expect(store.scenes.map((s) => s.name)).toEqual([nth(1), nth(3)])
      expect(store.scene?.name).toBe(nth(3))
    })

    it('renames and reorders scenes', () => {
      const store = usePlannerStore()
      store.addScene({ copy: false })
      store.addScene({ copy: false })
      store.renameScene(store.sceneId, '  午餐  ')
      store.renameScene(store.sceneId, '   ')
      expect(store.scene?.name).toBe('午餐')
      store.moveScene(2, 0)
      expect(store.scenes.map((s) => s.name)).toEqual(['午餐', nth(1), nth(2)])
    })

    it('applies items to every other scene: in place of theirs, or added', () => {
      const store = usePlannerStore()
      store.items = [sign(A)]
      const first = store.sceneId
      store.addScene({ copy: true })
      store.addScene({ copy: false })
      store.setScene(first)
      const changed = store.applyToScenes([sign(A, 7)])
      expect(changed).toHaveLength(2)
      expect(store.scenes.map((s) => s.items.map((i) => [i.id, i.x]))).toEqual([
        [[A, 1]],
        [[A, 7]],
        [[A, 7]],
      ])
    })

    it('imports a file’s scenes in place of all of them, or after them', () => {
      const store = usePlannerStore()
      const file = [
        { id: A, name: '上午', items: [sign(A)] },
        { id: B, name: '下午', items: [sign(B)] },
      ]
      expect(store.importScenes(file, { replace: false })).toBe(2)
      expect(store.scenes.map((s) => s.name)).toEqual([nth(1), '上午', '下午'])
      expect(store.scene?.name).toBe('上午')
      expect(store.importScenes(file, { replace: true })).toBe(2)
      expect(store.scenes.map((s) => s.name)).toEqual(['上午', '下午'])
      // ids of their own, so a file taken in twice doesn't clash
      expect(store.scenes.map((s) => s.id)).not.toContain(A)
    })

    it('rents each kind as many times as the scene using most of it needs', () => {
      const store = usePlannerStore()
      const table = (x: number): LayoutItem => ({ t: 'table2', x, z: 0, r: 0 })
      store.items = [table(0), table(1)]
      expect(store.rentTotal).toBe(store.cost.total)
      store.addScene({ copy: false })
      store.items = [table(0), table(1), table(2)]
      const three = store.cost.total
      store.addScene({ copy: false })
      store.items = [table(0)]
      expect(store.rentTotal).toBe(three)
    })
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
