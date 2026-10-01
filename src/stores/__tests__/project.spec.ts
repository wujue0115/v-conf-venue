import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { LayoutItem } from '@/venue/layout'
import { STORAGE_KEY } from '@/venue/layout'

type Api = typeof import('@/cloud/projects')
const api = vi.hoisted(() => ({
  loadProject: vi.fn<Api['loadProject']>(),
  saveChanges: vi.fn<Api['saveChanges']>(),
  renameProject: vi.fn<Api['renameProject']>(),
}))
vi.mock('@/cloud/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cloud/projects')>()),
  ...api,
}))
// no real client (.env.local is read in tests too): its session check would sign the test out
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { CloudError } from '@/cloud/projects'
import { useAuthStore } from '../auth'
import { usePlannerStore } from '../planner'
import { useProjectStore } from '../project'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const OWNER = 'owner-id'
const item = (id: string, x: number): LayoutItem => ({ id, t: 'sign', x, z: 0, r: 0 })

/** Open a project holding A and B, as its owner, and report it back as the editor does */
async function openProject() {
  useAuthStore().user = { id: OWNER } as never
  api.loadProject.mockResolvedValue({
    meta: { id: 'p1', name: 'Test', owner_id: OWNER, updated_at: '2026-10-01T00:00:00Z' },
    items: [item(A, 1), item(B, 2)],
    settings: { pricing: { priceMode: 1, slots: 2 } },
  })
  const project = useProjectStore()
  const planner = usePlannerStore()
  await project.open('p1')
  // the editor's first snapshot of the opened layout
  planner.items = [...planner.items]
  await nextTick()
  return { project, planner }
}

describe('project store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers()
    api.saveChanges.mockReset().mockResolvedValue('2026-10-01T00:01:00Z')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens a project into the planner without touching the browser’s own layout', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item(C, 9)]))
    const { project, planner } = await openProject()
    expect(project.meta?.name).toBe('Test')
    expect(planner.projectId).toBe('p1')
    expect(planner.items.map((i) => i.id)).toEqual([A, B])
    expect(planner.priceMode).toBe(1)
    expect(planner.slots).toBe(2)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([item(C, 9)])
    // opening it saves nothing
    await vi.runAllTimersAsync()
    expect(api.saveChanges).not.toHaveBeenCalled()
    expect(project.status).toBe('saved')
  })

  it('saves just what changed, a moment after the last change', async () => {
    const { project, planner } = await openProject()
    // A moved, B removed, C added
    planner.items = [item(A, 5), item(C, 3)]
    await nextTick()
    expect(project.status).toBe('pending')
    await vi.runAllTimersAsync()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
    const [id, changes] = api.saveChanges.mock.calls[0]!
    expect(id).toBe('p1')
    expect(changes.upserts.map((i: LayoutItem) => i.id)).toEqual([A, C])
    expect(changes.deletes).toEqual([B])
    expect(changes.settings).toBeUndefined()
    expect(project.status).toBe('saved')
  })

  it('saves the pricing in the project’s settings', async () => {
    const { planner } = await openProject()
    planner.setSlots(4)
    await nextTick()
    await vi.runAllTimersAsync()
    const [, changes] = api.saveChanges.mock.calls[0]!
    expect(changes.upserts).toEqual([])
    expect(changes.settings?.pricing).toEqual({ priceMode: 1, slots: 4 })
  })

  it('works a failed save out again from the same start when retried', async () => {
    const { project, planner } = await openProject()
    api.saveChanges.mockRejectedValueOnce(new Error('offline'))
    planner.items = [item(A, 5), item(B, 2)]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(project.status).toBe('error')
    await project.flush()
    expect(api.saveChanges).toHaveBeenCalledTimes(2)
    const [, retry] = api.saveChanges.mock.calls[1]!
    expect(retry.upserts.map((i: LayoutItem) => i.id)).toEqual([A])
    expect(project.status).toBe('saved')
  })

  it('doesn’t save a project someone else owns', async () => {
    const { project, planner } = await openProject()
    useAuthStore().user = { id: 'someone-else' } as never
    planner.items = [item(A, 5)]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(api.saveChanges).not.toHaveBeenCalled()
    expect(project.canEdit).toBe(false)
  })

  it('saves what’s waiting before closing, then leaves the planner on nothing of its', async () => {
    const { project, planner } = await openProject()
    planner.items = [item(A, 7), item(B, 2)]
    await nextTick()
    await project.close()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
    expect(project.meta).toBeNull()
    // back on the browser's layout, nothing more goes to the project
    planner.openLocal()
    await nextTick()
    await vi.runAllTimersAsync()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
  })

  describe('when saving fails', () => {
    const DRAFT = 'v-conf-venue:unsaved:p1'
    const offline = () => new CloudError('network')

    /** Make a change, and let its save (which fails) run */
    async function failOnce() {
      const opened = await openProject()
      api.saveChanges.mockRejectedValue(offline())
      opened.planner.items = [item(A, 5), item(B, 2)]
      await nextTick()
      await vi.advanceTimersByTimeAsync(800)
      return opened
    }

    it('tries again after 2 and 5 seconds, then asks for attention and keeps trying each minute', async () => {
      const { project } = await failOnce()
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
      expect(project.status).toBe('error')
      expect(project.alert).toBe(false)
      await vi.advanceTimersByTimeAsync(2000)
      expect(api.saveChanges).toHaveBeenCalledTimes(2)
      expect(project.alert).toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      expect(api.saveChanges).toHaveBeenCalledTimes(3)
      expect(project.alert).toBe(true)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(api.saveChanges).toHaveBeenCalledTimes(4)
      // back online: it saves, and the notice goes
      api.saveChanges.mockResolvedValue('2026-10-01T00:05:00Z')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(project.status).toBe('saved')
      expect(project.alert).toBe(false)
      expect(project.meta?.updated_at).toBe('2026-10-01T00:05:00Z')
    })

    it('doesn’t try again a failure retrying can’t fix, and says so at once', async () => {
      const { project, planner } = await openProject()
      api.saveChanges.mockRejectedValue(new CloudError('denied'))
      planner.items = [item(A, 5), item(B, 2)]
      await nextTick()
      await vi.advanceTimersByTimeAsync(800)
      expect(project.alert).toBe(true)
      expect(project.failure).toBe('denied')
      await vi.advanceTimersByTimeAsync(120_000)
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
    })

    it('waits for the connection while offline, then tries at once', async () => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const { project } = await failOnce()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
      onLine.mockReturnValue(true)
      api.saveChanges.mockResolvedValue('2026-10-01T00:05:00Z')
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
      expect(api.saveChanges).toHaveBeenCalledTimes(2)
      expect(project.status).toBe('saved')
      onLine.mockRestore()
    })

    it('keeps a closed notice closed until saving works again', async () => {
      const { project } = await failOnce()
      await vi.advanceTimersByTimeAsync(7000)
      expect(project.alert).toBe(true)
      project.dismissAlert()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(project.alert).toBe(false)
    })

    it('keeps the unsaved layout in this browser, apart from its own, until a save works', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([item(C, 9)]))
      const { project } = await failOnce()
      const draft = JSON.parse(localStorage.getItem(DRAFT)!)
      expect(draft.base).toBe('2026-10-01T00:00:00Z')
      expect(draft.items.map((i: LayoutItem) => [i.id, i.x])).toEqual([
        [A, 5],
        [B, 2],
      ])
      expect(project.kept).toBe(true)
      // the browser's own layout is untouched
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([item(C, 9)])
      api.saveChanges.mockResolvedValue('2026-10-01T00:05:00Z')
      await project.flush()
      expect(localStorage.getItem(DRAFT)).toBeNull()
    })
  })

  describe('a draft left from last time', () => {
    const DRAFT = 'v-conf-venue:unsaved:p1'
    const keep = (base: string) =>
      localStorage.setItem(
        DRAFT,
        JSON.stringify({ base, at: '2026-10-01T00:02:00Z', items: [item(A, 8)], settings: {} }),
      )

    it('is offered back when the cloud version is still the one it was made on', async () => {
      keep('2026-10-01T00:00:00Z')
      const { project } = await openProject()
      expect(project.draft?.items.map((i) => i.x)).toEqual([8])
      expect(project.draftConflict).toBe(false)
    })

    it('is flagged when the cloud version has changed since', async () => {
      keep('2026-09-30T00:00:00Z')
      const { project } = await openProject()
      expect(project.draftConflict).toBe(true)
    })

    it('goes for good when dropped', async () => {
      keep('2026-10-01T00:00:00Z')
      const { project } = await openProject()
      project.dropDraft()
      expect(project.draft).toBeNull()
      expect(localStorage.getItem(DRAFT)).toBeNull()
    })
  })
})
