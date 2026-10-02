import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { ObjectsChange, Peer, ProjectChannel } from '@/cloud/realtime'
import type { Holder } from '../collab'

vi.mock('@/lib/supabase', () => ({ supabase: null }))
type Rt = typeof import('@/cloud/realtime')
const rt = vi.hoisted(() => ({ joinProject: vi.fn<Rt['joinProject']>() }))
vi.mock('@/cloud/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cloud/realtime')>()),
  ...rt,
}))
type Api = typeof import('@/cloud/projects')
const api = vi.hoisted(() => ({
  loadItems: vi.fn<Api['loadItems']>(),
  loadUpdatedAt: vi.fn<Api['loadUpdatedAt']>(),
  loadVersions: vi.fn<Api['loadVersions']>(),
}))
vi.mock('@/cloud/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cloud/projects')>()),
  ...api,
}))

import { useAuthStore } from '../auth'
import { useCloudStore } from '../cloud'
import { colorOf, holders, useCollabStore } from '../collab'
import { useProjectStore } from '../project'

const peer = (key: string, sel: [string, number][], role: Peer['role'] = 'editor'): Holder => ({
  key,
  user: `user-${key}`,
  name: key,
  avatar: '',
  role,
  follow: null,
  sel,
})

describe('who holds a selected item', () => {
  it('locks what others have selected', () => {
    const locks = holders([peer('alice', [['A', 10]])], null)
    expect(locks.get('A')?.name).toBe('alice')
  })

  it('gives it to whoever picked it first, this tab included', () => {
    const mine = { key: 'me', sel: new Map([['A', 5]]) }
    expect(holders([peer('alice', [['A', 10]])], mine).has('A')).toBe(false)
    const later = { key: 'me', sel: new Map([['A', 20]]) }
    expect(holders([peer('alice', [['A', 10]])], later).get('A')?.name).toBe('alice')
  })

  it('settles a tie the same way on every screen', () => {
    const peers = [peer('bob', [['A', 10]]), peer('alice', [['A', 10]])]
    expect(holders(peers, null).get('A')?.name).toBe('alice')
    expect(holders([...peers].reverse(), null).get('A')?.name).toBe('alice')
  })

  it('ignores a viewer’s selection', () => {
    expect(holders([peer('vic', [['A', 1]], 'viewer')], null).size).toBe(0)
  })

  it('gives each person one colour', () => {
    expect(colorOf('user-1')).toBe(colorOf('user-1'))
    expect(colorOf('user-1')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('the project’s channel', () => {
  it('stays joined while the project saves (its meta replaced each time)', async () => {
    setActivePinia(createPinia())
    const channel: ProjectChannel = {
      track: vi.fn<ProjectChannel['track']>(),
      move: vi.fn<ProjectChannel['move']>(),
      cursor: vi.fn<ProjectChannel['cursor']>(),
      select: vi.fn<ProjectChannel['select']>(),
      camera: vi.fn<ProjectChannel['camera']>(),
      objects: vi.fn<ProjectChannel['objects']>(() => true),
      leave: vi.fn<ProjectChannel['leave']>(),
    }
    rt.joinProject.mockReset().mockReturnValue(channel)
    useAuthStore().user = { id: 'me' } as never
    useCloudStore().settings = {
      enabled: true,
      allowCreate: true,
      allowUpdate: true,
      allowRealtime: true,
    }
    const project = useProjectStore()
    useCollabStore()
    const meta = {
      id: 'p1',
      name: 'Test',
      updated_at: '2026-10-01T00:00:00Z',
      role: 'editor' as const,
      requested: null,
      sharing: null,
    }
    project.meta = meta
    await nextTick()
    expect(rt.joinProject).toHaveBeenCalledTimes(1)
    // three saves
    for (const at of ['01', '02', '03']) {
      project.meta = { ...meta, updated_at: `2026-10-01T00:00:${at}Z` }
      await nextTick()
    }
    expect(rt.joinProject).toHaveBeenCalledTimes(1)
    expect(channel.leave).not.toHaveBeenCalled()
    // a new role is joined afresh: it may send what the old one couldn't
    project.meta = { ...meta, role: 'viewer' }
    await nextTick()
    expect(channel.leave).toHaveBeenCalledTimes(1)
    expect(rt.joinProject).toHaveBeenCalledTimes(2)
  })

  /** Signed in as an editor of p1, with realtime on; the channel it joins */
  async function joined(user: string | null = 'me') {
    setActivePinia(createPinia())
    const channel: ProjectChannel = {
      track: vi.fn<ProjectChannel['track']>(),
      move: vi.fn<ProjectChannel['move']>(),
      cursor: vi.fn<ProjectChannel['cursor']>(),
      select: vi.fn<ProjectChannel['select']>(),
      camera: vi.fn<ProjectChannel['camera']>(),
      objects: vi.fn<ProjectChannel['objects']>(() => true),
      leave: vi.fn<ProjectChannel['leave']>(),
    }
    rt.joinProject.mockReset().mockReturnValue(channel)
    api.loadItems.mockReset().mockResolvedValue([])
    api.loadUpdatedAt.mockReset().mockResolvedValue(null)
    api.loadVersions.mockReset().mockResolvedValue(new Map())
    useAuthStore().user = user ? ({ id: user } as never) : null
    useCloudStore().settings = {
      enabled: true,
      allowCreate: true,
      allowUpdate: true,
      allowRealtime: true,
    }
    const project = useProjectStore()
    project.meta = {
      id: 'p1',
      name: 'Test',
      updated_at: '2026-10-01T00:00:00Z',
      role: user ? 'editor' : 'viewer',
      requested: null,
      sharing: null,
    }
    // what a save reports, as the project store would after one went through
    let saved: Parameters<typeof project.onSaved>[0] = () => {}
    vi.spyOn(project, 'onSaved').mockImplementation((fn) => {
      saved = fn
      return () => {}
    })
    const collab = useCollabStore()
    await nextTick()
    const on = rt.joinProject.mock.calls[0]?.[2]
    return {
      collab,
      project,
      channel,
      on,
      save: (c: ObjectsChange, at = '2026-10-01T00:00:00Z') => saved('p1', c, at),
    }
  }
  const alice: Peer = {
    key: 'k1',
    user: 'alice',
    name: 'Alice',
    avatar: '',
    role: 'viewer',
    follow: null,
  }

  it('sends nothing with nobody else there to see it', async () => {
    const { collab, channel } = await joined()
    collab.pointer([1, 0, 1])
    collab.move([{ id: 'A', x: 1, y: 0, z: 1, r: 0 }])
    expect(channel.cursor).not.toHaveBeenCalled()
    expect(channel.move).not.toHaveBeenCalled()
  })

  it('sends the pointer once someone is there, but not when it hardly moved', async () => {
    const { collab, channel } = await joined()
    collab.peers = [alice]
    collab.pointer([1, 0, 1])
    collab.pointer([1.01, 0, 1])
    collab.pointer([2, 0, 1])
    expect(channel.cursor).toHaveBeenCalledTimes(2)
  })

  describe('while dragging', () => {
    afterEach(() => void vi.useRealTimers())

    it('sends the pointer with the drag rather than on its own', async () => {
      vi.useFakeTimers()
      const { collab, channel } = await joined()
      collab.peers = [alice]
      collab.move([{ id: 'A', x: 1, y: 0, z: 1, r: 0 }])
      collab.pointer([1, 0, 1])
      vi.advanceTimersByTime(200)
      expect(channel.cursor).not.toHaveBeenCalled()
      expect(channel.move).toHaveBeenCalledWith([{ id: 'A', x: 1, y: 0, z: 1, r: 0 }], [1, 0, 1])
      // the drag over, the pointer goes out on its own again
      vi.advanceTimersByTime(1000)
      collab.pointer([3, 0, 1])
      expect(channel.cursor).toHaveBeenCalledWith([3, 0, 1])
    })

    it('still sends the last pointer when the drag sent nothing more', async () => {
      vi.useFakeTimers()
      const { collab, channel } = await joined()
      collab.peers = [alice]
      collab.move([{ id: 'A', x: 1, y: 0, z: 1, r: 0 }])
      vi.advanceTimersByTime(200)
      collab.pointer([2, 0, 1])
      vi.advanceTimersByTime(200)
      expect(channel.cursor).toHaveBeenCalledWith([2, 0, 1])
    })
  })

  describe('saved items', () => {
    it('are told to the others in one message, and to nobody when alone', async () => {
      const { collab, channel, on, save } = await joined()
      on!.joined(false)
      save({ changed: ['A'] })
      expect(channel.objects).not.toHaveBeenCalled()
      collab.peers = [alice]
      save({ changed: ['B'], deleted: ['C'] })
      expect(channel.objects).toHaveBeenCalledWith({ changed: ['B'], deleted: ['C'] })
    })

    it('saved just before someone came are told to them', async () => {
      const { channel, on, save } = await joined()
      on!.joined(false)
      save({ changed: ['A'], deleted: ['B'] })
      on!.peers([alice])
      expect(channel.objects).toHaveBeenCalledWith({ changed: ['A'], deleted: ['B'] })
    })

    it('saved while the connection was down go out once it is back', async () => {
      const { collab, channel, on, save } = await joined()
      on!.joined(false)
      collab.peers = [alice]
      on!.dropped()
      save({ changed: ['A'] })
      save({ deleted: ['A', 'B'] })
      expect(channel.objects).not.toHaveBeenCalled()
      on!.joined(true)
      // the later word on an id wins
      expect(channel.objects).toHaveBeenCalledWith({ deleted: ['A', 'B'] })
    })
  })

  describe('checking for saves whose word never came', () => {
    afterEach(() => void vi.useRealTimers())
    const T1 = '2026-10-01T00:00:01.000001+00:00'
    const T2 = '2026-10-01T00:00:02.000002+00:00'
    const T3 = '2026-10-01T00:00:03.000003+00:00'

    /** Joined with Alice there; the items' updated_at noted as A at T1 */
    async function watching() {
      vi.useFakeTimers()
      const j = await joined()
      j.collab.attach({
        applyRemote: vi.fn(),
        applyLive: vi.fn(),
        setLocks: vi.fn(),
        setCursors: vi.fn(),
        follow: vi.fn(),
        cameraState: vi.fn(),
      } as never)
      api.loadItems.mockReset().mockResolvedValue([])
      api.loadUpdatedAt.mockReset().mockResolvedValue(T1)
      api.loadVersions.mockReset().mockResolvedValue(new Map([['A', T1]]))
      j.on!.joined(false)
      j.on!.peers([alice])
      await vi.advanceTimersByTimeAsync(0)
      expect(api.loadVersions).toHaveBeenCalledTimes(1)
      return j
    }

    it('fetches the items changed or added since, and drops those gone', async () => {
      const { project } = await watching()
      const take = vi.spyOn(project, 'takeRemote')
      api.loadUpdatedAt.mockResolvedValue(T3)
      api.loadVersions.mockResolvedValue(new Map([['B', T2]]))
      await vi.advanceTimersByTimeAsync(60_000 + 200)
      expect(api.loadItems).toHaveBeenCalledWith('p1', ['B'], null, expect.any(Map))
      expect(take.mock.calls[0]?.[1]).toEqual(['A'])
    })

    it('fetches nothing when only this tab saved, or nothing changed', async () => {
      const { save } = await watching()
      save({ changed: ['A', 'B'] }, T2)
      api.loadUpdatedAt.mockResolvedValue(T2)
      api.loadVersions.mockResolvedValue(new Map([['A', T2], ['B', T2]]))
      await vi.advanceTimersByTimeAsync(60_000 + 200)
      expect(api.loadVersions).toHaveBeenCalledTimes(2)
      // the project unchanged since: not even the versions are read
      await vi.advanceTimersByTimeAsync(60_000 + 200)
      expect(api.loadVersions).toHaveBeenCalledTimes(2)
      expect(api.loadItems).not.toHaveBeenCalled()
    })

    it('catches someone else saving an item after this tab did', async () => {
      const { save } = await watching()
      save({ changed: ['A'] }, T2)
      api.loadUpdatedAt.mockResolvedValue(T3)
      api.loadVersions.mockResolvedValue(new Map([['A', T3]]))
      await vi.advanceTimersByTimeAsync(60_000 + 200)
      expect(api.loadItems).toHaveBeenCalledWith('p1', ['A'], null, expect.any(Map))
    })

    it('reads nothing with nobody else there', async () => {
      const { on } = await watching()
      on!.peers([])
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(api.loadUpdatedAt).toHaveBeenCalledTimes(1)
    })
  })

  it('leaves guests off the channel', async () => {
    await joined(null)
    expect(rt.joinProject).not.toHaveBeenCalled()
  })
})
