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
    return { collab, channel, on, save: (c: ObjectsChange) => saved('p1', c) }
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

  it('leaves guests off the channel', async () => {
    await joined(null)
    expect(rt.joinProject).not.toHaveBeenCalled()
  })
})
