import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AccessEntry } from '@/cloud/access'
import type { ProjectMeta, Role } from '@/cloud/projects'

type Access = typeof import('@/cloud/access')
const api = vi.hoisted(() => ({
  listAccess: vi.fn<Access['listAccess']>(),
  countRequests: vi.fn<Access['countRequests']>(),
  addPerson: vi.fn<Access['addPerson']>(),
  approve: vi.fn<Access['approve']>(),
  deny: vi.fn<Access['deny']>(),
  requestAccess: vi.fn<Access['requestAccess']>(),
}))
vi.mock('@/cloud/access', async (importOriginal) => ({
  ...(await importOriginal<Access>()),
  ...api,
}))
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { useAccessStore } from '../access'
import { useProjectStore } from '../project'

const entry = (email: string, e: Partial<AccessEntry> = {}): AccessEntry => ({
  id: email,
  email,
  role: null,
  requested_role: null,
  requested_at: null,
  via_link: false,
  created_at: '2026-10-01T00:00:00Z',
  ...e,
})

const meta = (role: Role, e: Partial<ProjectMeta> = {}): ProjectMeta => ({
  id: 'p1',
  name: 'Test',
  updated_at: '2026-10-01T00:00:00Z',
  role,
  requested: null,
  sharing: null,
  ...e,
})

/** Let the store's watchers and the calls they start settle */
const settle = async () => {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('access store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of Object.values(api)) f.mockReset()
    api.countRequests.mockResolvedValue(2)
    api.listAccess.mockResolvedValue([
      entry('member@x.com', { role: 'viewer' }),
      entry('asker@x.com', { requested_role: 'editor', requested_at: '2026-10-01T02:00:00Z' }),
      entry('upgrade@x.com', {
        role: 'viewer',
        requested_role: 'editor',
        requested_at: '2026-10-01T01:00:00Z',
      }),
      entry('visitor@x.com', { via_link: true }),
    ])
  })

  it('counts the requests as soon as its owner opens the project', async () => {
    const project = useProjectStore()
    const access = useAccessStore()
    project.meta = meta('owner')
    await settle()
    expect(api.countRequests).toHaveBeenCalledWith('p1')
    expect(access.requestCount).toBe(2)
  })

  it('looks up nothing for anyone but the owner', async () => {
    const project = useProjectStore()
    const access = useAccessStore()
    project.meta = meta('editor')
    await settle()
    await access.load()
    expect(api.countRequests).not.toHaveBeenCalled()
    expect(api.listAccess).not.toHaveBeenCalled()
  })

  it('sorts the people into members, requests (the earliest first) and link visitors', async () => {
    useProjectStore().meta = meta('owner')
    const access = useAccessStore()
    await access.load()
    expect(access.members.map((e) => e.email)).toEqual(['member@x.com', 'upgrade@x.com'])
    expect(access.requests.map((e) => e.email)).toEqual(['upgrade@x.com', 'asker@x.com'])
    expect(access.linkVisitors.map((e) => e.email)).toEqual(['visitor@x.com'])
  })

  it('adds someone who opened the link onto their existing row, then reads the list back', async () => {
    useProjectStore().meta = meta('owner')
    const access = useAccessStore()
    await access.load()
    await access.add(' Visitor@X.com ', 'editor')
    expect(api.addPerson).toHaveBeenCalledWith(
      'p1',
      ' Visitor@X.com ',
      'editor',
      expect.objectContaining({ email: 'visitor@x.com' }),
    )
    expect(api.listAccess).toHaveBeenCalledTimes(2)
  })
})

describe('asking for access', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of Object.values(api)) f.mockReset()
    api.requestAccess.mockResolvedValue('requested')
  })

  it('asks to edit a project already open to view, and remembers it asked', async () => {
    const project = useProjectStore()
    project.meta = meta('viewer')
    await project.requestAccess('editor')
    expect(api.requestAccess).toHaveBeenCalledWith('editor', { projectId: 'p1' })
    expect(project.meta?.requested).toBe('editor')
  })
})
