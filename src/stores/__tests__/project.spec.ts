import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { Role, SharedResult } from '@/cloud/projects'
import { FLOORS } from '@/venue/floors'
import type { LayoutItem } from '@/venue/layout'
import { STORAGE_KEY } from '@/venue/layout'

type Api = typeof import('@/cloud/projects')
const api = vi.hoisted(() => ({
  loadProject: vi.fn<Api['loadProject']>(),
  saveChanges: vi.fn<Api['saveChanges']>(),
  renameProject: vi.fn<Api['renameProject']>(),
  checkAccess: vi.fn<Api['checkAccess']>(),
  loadShared: vi.fn<Api['loadShared']>(),
  loadScenes: vi.fn<Api['loadScenes']>(),
  loadItems: vi.fn<Api['loadItems']>(),
}))
vi.mock('@/cloud/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cloud/projects')>()),
  ...api,
}))
type AccessApi = typeof import('@/cloud/access')
const accessApi = vi.hoisted(() => ({
  hasAsked: vi.fn<AccessApi['hasAsked']>(),
  requestAccess: vi.fn<AccessApi['requestAccess']>(),
}))
vi.mock('@/cloud/access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cloud/access')>()),
  ...accessApi,
}))
// no real client (.env.local is read in tests too): its session check would sign the test out
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { CloudError } from '@/cloud/projects'
import { useAuthStore } from '../auth'
import { useCloudStore } from '../cloud'
import { usePlannerStore } from '../planner'
import { useProjectStore } from '../project'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const OWNER = 'owner-id'
const item = (id: string, x: number): LayoutItem => ({ id, t: 'sign', x, z: 0, r: 0 })
/** The project's one scene, and an item in it as saves name it */
const S = '00000000-0000-4000-8000-000000000051'
const one = (items: LayoutItem[]) => [{ id: S, name: 'Main', items }]
const ref = (id: string) => `${S}/${id}`
const inS = (i: LayoutItem) => ({ scene: S, item: i })

/** Open a project holding A and B (as its owner, unless given another role), and report it back as the editor does */
async function openProject(role: Role = 'owner') {
  useAuthStore().user = { id: OWNER } as never
  api.loadProject.mockResolvedValue({
    meta: {
      id: 'p1',
      name: 'Test',
      updated_at: '2026-10-01T00:00:00Z',
      role,
      requested: null,
      sharing: null,
    },
    scenes: one([item(A, 1), item(B, 2)]),
    settings: { pricing: { priceMode: 1, slots: 2 }, floors: FLOORS },
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
    api.checkAccess.mockReset().mockResolvedValue('ok')
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

  it('moves a project saved on older floors on to today’s, and saves that once', async () => {
    useAuthStore().user = { id: OWNER } as never
    // on the stage as it was (0.9 m), and one where no floor moved
    const onStage: LayoutItem = { id: A, t: 'sign', x: 33, y: 0.9, z: 37.6, r: 0 }
    api.loadProject.mockResolvedValue({
      meta: {
        id: 'p1',
        name: 'Test',
        updated_at: '2026-10-01T00:00:00Z',
        role: 'owner',
        requested: null,
        sharing: null,
      },
      scenes: one([onStage, item(B, 2)]),
      settings: { pricing: { priceMode: 1, slots: 2 } },
    })
    const project = useProjectStore()
    const planner = usePlannerStore()
    await project.open('p1')
    expect(planner.items[0]!.y).toBeCloseTo(0.7)
    planner.items = [...planner.items]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
    const [, changes] = api.saveChanges.mock.calls[0]!
    expect(changes.upserts.map((u) => u.item.id)).toEqual([A])
    expect(changes.settings?.floors).toBe(FLOORS)
    // done: nothing more to save until something changes
    await vi.runAllTimersAsync()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
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
    expect(changes.upserts.map((u) => u.item.id)).toEqual([A, C])
    expect(changes.deletes).toEqual([ref(B)])
    expect(changes.settings).toBeUndefined()
    expect(project.status).toBe('saved')
  })

  it('says what each save wrote once it went through, and only then', async () => {
    const { project, planner } = await openProject()
    const told = vi.fn()
    project.onSaved(told)
    api.saveChanges.mockRejectedValueOnce(new Error('offline'))
    planner.items = [item(A, 5), item(C, 3)]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(told).not.toHaveBeenCalled()
    await project.flush()
    expect(told).toHaveBeenCalledExactlyOnceWith(
      'p1',
      { changed: [ref(A), ref(C)], deleted: [ref(B)] },
      '2026-10-01T00:01:00Z',
    )
    // settings alone: no items to tell of
    planner.setSlots(4)
    await nextTick()
    await vi.runAllTimersAsync()
    expect(told).toHaveBeenCalledTimes(1)
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
    expect(retry.upserts.map((u) => u.item.id)).toEqual([A])
    expect(project.status).toBe('saved')
  })

  it('opens a project read-only for a viewer, and never saves it', async () => {
    const { project, planner } = await openProject('viewer')
    expect(planner.readOnly).toBe(true)
    expect(planner.editing).toBe(false)
    planner.items = [item(A, 5)]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(api.saveChanges).not.toHaveBeenCalled()
    expect(project.canEdit).toBe(false)
  })

  it('lets an editor save', async () => {
    const { project, planner } = await openProject('editor')
    expect(planner.readOnly).toBe(false)
    planner.items = [item(A, 5), item(B, 2)]
    await nextTick()
    await vi.runAllTimersAsync()
    expect(api.saveChanges).toHaveBeenCalledTimes(1)
    expect(project.status).toBe('saved')
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
      expect(draft.scenes[0].items.map((i: LayoutItem) => [i.id, i.x])).toEqual([
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

  describe('checking access after a failed save', () => {
    async function failWith(code: 'denied' | 'auth' | 'network') {
      const opened = await openProject('editor')
      api.saveChanges.mockRejectedValue(new CloudError(code))
      opened.planner.items = [item(A, 5), item(B, 2)]
      await nextTick()
      await vi.advanceTimersByTimeAsync(800)
      return opened
    }

    it('says editing was taken away, and stops editing so nothing more goes unsaved', async () => {
      api.checkAccess.mockResolvedValue('viewer')
      const { project, planner } = await failWith('denied')
      expect(api.checkAccess).toHaveBeenCalledWith('p1', { signedIn: true, shareToken: null })
      expect(project.failure).toBe('viewer')
      expect(project.alert).toBe(true)
      expect(project.meta?.role).toBe('viewer')
      expect(planner.readOnly).toBe(true)
      expect(planner.editing).toBe(false)
    })

    it('keeps the first reason when they may still edit', async () => {
      const { project, planner } = await failWith('denied')
      expect(project.failure).toBe('denied')
      expect(planner.readOnly).toBe(false)
    })

    it('stops retrying once it finds they were signed out', async () => {
      api.checkAccess.mockResolvedValue('signed_out')
      const { project } = await failWith('auth')
      expect(project.failure).toBe('signed_out')
      await vi.advanceTimersByTimeAsync(120_000)
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
    })

    it('doesn’t check for a lost connection', async () => {
      await failWith('network')
      expect(api.checkAccess).not.toHaveBeenCalled()
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
      expect(project.draft?.scenes[0]!.items.map((i) => i.x)).toEqual([8])
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

  describe('other people’s saved changes', () => {
    /** What the editor does with them: takes them in and reports the layout back at once */
    const editorFor =
      (planner: ReturnType<typeof usePlannerStore>) =>
      (_scene: string, up: LayoutItem[], del: string[]) => {
        const byId = new Map(planner.items.map((i) => [i.id!, i]))
        for (const id of del) byId.delete(id)
        for (const i of up) byId.set(i.id!, i)
        planner.items = [...byId.values()]
      }
    const xs = (items: readonly LayoutItem[]) => items.map((i) => [i.id, i.x])

    it('are taken in, and never saved back', async () => {
      const { project, planner } = await openProject('editor')
      project.takeRemote([item(A, 7), item(C, 1)].map(inS), [ref(B)], editorFor(planner))
      expect(xs(planner.items)).toEqual([
        [A, 7],
        [C, 1],
      ])
      await nextTick()
      await vi.runAllTimersAsync()
      expect(api.saveChanges).not.toHaveBeenCalled()
      expect(project.status).toBe('saved')
    })

    it('leave this person’s unsaved changes standing, which are then saved over them', async () => {
      const { project, planner } = await openProject('editor')
      planner.items = [item(A, 5), item(B, 2)]
      await nextTick()
      project.takeRemote([item(A, 7), item(B, 9)].map(inS), [], editorFor(planner))
      expect(xs(planner.items)).toEqual([
        [A, 5],
        [B, 9],
      ])
      await nextTick()
      await vi.runAllTimersAsync()
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
      const [, changes] = api.saveChanges.mock.calls[0]!
      expect(xs(changes.upserts.map((u) => u.item))).toEqual([[A, 5]])
      expect(changes.deletes).toEqual([])
    })

    it('after the connection was down, count saved items missing from all of them as removed', async () => {
      const { project, planner } = await openProject('editor')
      // C added here and not saved yet
      planner.items = [...planner.items, item(C, 3)]
      await nextTick()
      project.takeRemote([item(A, 1)].map(inS), [], editorFor(planner), { full: true })
      expect(xs(planner.items)).toEqual([
        [A, 1],
        [C, 3],
      ])
      await vi.runAllTimersAsync()
      const [, changes] = api.saveChanges.mock.calls[0]!
      expect(xs(changes.upserts.map((u) => u.item))).toEqual([[C, 3]])
      expect(changes.deletes).toEqual([])
    })
  })

  describe('scenes', () => {
    const S2 = '00000000-0000-4000-8000-000000000052'
    /** Open a project with a second scene holding A where the first has it at 1 */
    async function openTwo() {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockResolvedValue({
        meta: {
          id: 'p1',
          name: 'Test',
          updated_at: '2026-10-01T00:00:00Z',
          role: 'owner',
          requested: null,
          sharing: null,
        },
        scenes: [
          { id: S, name: 'Morning', items: [item(A, 1)] },
          { id: S2, name: '', items: [item(A, 4)] },
        ],
        settings: { floors: FLOORS },
      })
      const project = useProjectStore()
      const planner = usePlannerStore()
      await project.open('p1')
      planner.items = [...planner.items]
      await nextTick()
      return { project, planner }
    }

    it('opens on the first, names an unnamed one by its place, and saves nothing', async () => {
      const { planner } = await openTwo()
      expect(planner.scenes.map((x) => x.name)).toEqual(['Morning', 'Scene 2'])
      planner.setScene(S2)
      // the editor's report of the scene it took, written its own way
      planner.items = planner.items.map((i) => ({ ...i, y: 0 }))
      await nextTick()
      await vi.runAllTimersAsync()
      expect(api.saveChanges).not.toHaveBeenCalled()
    })

    it('saves an item by its scene, and the same item in another scene apart', async () => {
      const { planner } = await openTwo()
      planner.setScene(S2)
      planner.items = [...planner.items]
      planner.items = [item(A, 9)]
      await nextTick()
      await vi.runAllTimersAsync()
      const [, changes] = api.saveChanges.mock.calls[0]!
      expect(changes.upserts).toEqual([{ scene: S2, item: item(A, 9) }])
      expect(changes.scenes).toBeUndefined()
    })

    it('saves a scene added, renamed or removed, with every scene in order', async () => {
      const { planner } = await openTwo()
      const added = planner.addScene({ copy: true })!
      await nextTick()
      await vi.runAllTimersAsync()
      let [, changes] = api.saveChanges.mock.calls[0]!
      expect(changes.scenes?.map((x) => x.id)).toEqual([S, added.id, S2])
      expect(changes.upserts).toEqual([{ scene: added.id, item: item(A, 1) }])
      planner.deleteScene(S2)
      await nextTick()
      await vi.runAllTimersAsync()
      ;[, changes] = api.saveChanges.mock.calls[1]!
      expect(changes.scenes?.map((x) => x.id)).toEqual([S, added.id])
      expect(changes.removedScenes).toEqual([S2])
      expect(changes.deletes).toEqual([`${S2}/${A}`])
    })

    it('takes other people’s changes to a scene not shown straight into it', async () => {
      const { project, planner } = await openTwo()
      const told: string[] = []
      project.takeRemote([{ scene: S2, item: item(A, 6) }], [], (scene) => told.push(scene))
      expect(told).toEqual([S2])
      expect(planner.items.map((i) => i.x)).toEqual([1])
      expect(planner.scenes[1]!.items.map((i) => i.x)).toEqual([6])
      await nextTick()
      await vi.runAllTimersAsync()
      expect(api.saveChanges).not.toHaveBeenCalled()
    })

    it('reads the scenes again: a new one with its items, one gone giving way', async () => {
      const { project, planner } = await openTwo()
      planner.setScene(S2)
      planner.items = [...planner.items]
      const S3 = '00000000-0000-4000-8000-000000000053'
      api.loadScenes.mockResolvedValue([
        { id: S3, name: 'Lunch' },
        { id: S, name: 'Morning' },
      ])
      api.loadItems.mockResolvedValue([{ scene: S3, item: item(B, 2) }])
      await project.refreshScenes()
      expect(planner.scenes.map((x) => x.name)).toEqual(['Lunch', 'Morning'])
      expect(planner.scenes[0]!.items.map((i) => i.id)).toEqual([B])
      expect(planner.sceneId).toBe(S)
      await nextTick()
      await vi.runAllTimersAsync()
      expect(api.saveChanges).not.toHaveBeenCalled()
    })
  })

  describe('the cloud pausing changes (app_settings)', () => {
    const switches = (allowUpdate: boolean) => ({
      enabled: true,
      allowCreate: true,
      allowUpdate,
      allowRealtime: false,
    })

    it('turns the project read-only, keeps what wasn’t saved, and saves it once back', async () => {
      const { project, planner } = await openProject('editor')
      const cloud = useCloudStore()
      planner.items = [item(A, 5), item(B, 2)]
      await nextTick()
      cloud.settings = switches(false)
      await nextTick()
      expect(project.paused).toBe(true)
      expect(planner.readOnly).toBe(true)
      expect(localStorage.getItem('v-conf-venue:unsaved:p1')).not.toBeNull()
      await vi.runAllTimersAsync()
      // waiting, not "saved"
      expect(api.saveChanges).not.toHaveBeenCalled()
      expect(project.status).toBe('pending')
      await project.flush()
      expect(project.status).toBe('pending')

      cloud.settings = switches(true)
      await nextTick()
      await vi.runAllTimersAsync()
      expect(planner.readOnly).toBe(false)
      expect(api.saveChanges).toHaveBeenCalledTimes(1)
      expect(project.status).toBe('saved')
      expect(localStorage.getItem('v-conf-venue:unsaved:p1')).toBeNull()
    })
  })

  describe('a guest, through a share link', () => {
    const shared = (name: string): SharedResult => ({
      status: 'ok',
      project: {
        meta: {
          id: 'p1',
          name,
          updated_at: '2026-10-01T00:00:00Z',
          role: 'viewer',
          requested: null,
          sharing: null,
        },
        scenes: one([item(A, 1)]),
        settings: {},
      },
    })

    it('reads the project again quietly, without loading it all over', async () => {
      api.loadShared.mockReset().mockResolvedValue(shared('Test'))
      const project = useProjectStore()
      await project.openShared('tok')
      expect(project.meta?.name).toBe('Test')
      api.loadShared.mockResolvedValue(shared('Renamed'))
      const loading: boolean[] = []
      project.$subscribe(() => loading.push(project.loading))
      await project.refreshMeta()
      expect(project.meta?.name).toBe('Renamed')
      expect(loading).not.toContain(true)
    })

    it('shows the link no longer opening it, once it doesn’t', async () => {
      api.loadShared.mockReset().mockResolvedValue(shared('Test'))
      const project = useProjectStore()
      await project.openShared('tok')
      api.loadShared.mockResolvedValue({ status: 'not_found' })
      await project.refreshMeta()
      expect(project.meta).toBeNull()
      expect(project.shareDenied?.status).toBe('not_found')
    })
  })

  describe('opening a project by its link', () => {
    const loaded = {
      meta: {
        id: 'p1',
        name: 'Test',
        updated_at: '2026-10-01T00:00:00Z',
        role: 'viewer' as const,
        requested: null,
        sharing: null,
      },
      scenes: one([item(A, 1)]),
      settings: {},
    }
    beforeEach(() => {
      api.loadProject.mockReset()
      api.loadShared.mockReset().mockResolvedValue({ status: 'ok', project: loaded })
      accessApi.hasAsked.mockReset().mockResolvedValue(false)
      accessApi.requestAccess.mockReset().mockResolvedValue('requested')
    })

    it('opens by id for someone who may, without going through the share token', async () => {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockResolvedValue({ ...loaded, meta: { ...loaded.meta, role: 'editor' } })
      const project = useProjectStore()
      await project.openLink('p1', 'tok')
      expect(project.meta?.id).toBe('p1')
      expect(api.loadShared).not.toHaveBeenCalled()
    })

    it('lets someone viewing by name edit when the link they came with allows it', async () => {
      useAuthStore().user = { id: OWNER } as never
      const editing = { ...loaded, meta: { ...loaded.meta, role: 'editor' as const } }
      api.loadProject.mockResolvedValueOnce(loaded).mockResolvedValueOnce(editing)
      api.loadShared.mockResolvedValue({ status: 'ok', project: editing })
      const project = useProjectStore()
      await project.openLink('p1', 'tok')
      expect(api.loadShared).toHaveBeenCalledWith('tok')
      expect(api.loadProject).toHaveBeenCalledTimes(2)
      expect(project.meta?.role).toBe('editor')
    })

    it('keeps them viewing by name when the link allows no more', async () => {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockResolvedValue(loaded)
      const project = useProjectStore()
      await project.openLink('p1', 'tok')
      expect(api.loadShared).toHaveBeenCalledWith('tok')
      expect(api.loadProject).toHaveBeenCalledTimes(1)
      expect(project.meta?.role).toBe('viewer')
    })

    it('goes through the share token when their own access doesn’t open it', async () => {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockRejectedValue(new CloudError('not_found'))
      const project = useProjectStore()
      await project.openLink('p1', 'tok')
      expect(api.loadShared).toHaveBeenCalledWith('tok')
      expect(project.meta?.id).toBe('p1')
      expect(project.loadError).toBeNull()
    })

    it('opens a guest’s link through the share token alone', async () => {
      const project = useProjectStore()
      await project.openLink('p1', 'tok')
      expect(api.loadProject).not.toHaveBeenCalled()
      expect(project.meta?.id).toBe('p1')
    })

    it('lets someone it doesn’t open by id alone ask the owner, by the id', async () => {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockRejectedValue(new CloudError('not_found'))
      const project = useProjectStore()
      await project.openLink('p1', null)
      expect(project.loadError).toBeNull()
      expect(project.shareDenied).toEqual({ status: 'no_access', requested: false, byId: true })
      await project.requestAccess('editor')
      expect(accessApi.requestAccess).toHaveBeenCalledWith('editor', { projectId: 'p1' })
      expect(project.shareDenied).toEqual({ status: 'no_access', requested: true, byId: true })
    })

    it('says so when they asked already', async () => {
      useAuthStore().user = { id: OWNER } as never
      api.loadProject.mockRejectedValue(new CloudError('not_found'))
      accessApi.hasAsked.mockResolvedValue(true)
      const project = useProjectStore()
      await project.openLink('p1', null)
      expect(project.shareDenied?.status === 'no_access' && project.shareDenied.requested).toBe(
        true,
      )
    })
  })
})
