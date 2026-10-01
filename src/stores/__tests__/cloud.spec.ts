import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

/** A Supabase client answering app_settings with `settings`, and may_create_projects with `may` */
const db = vi.hoisted(() => {
  const state = {
    settings: { enabled: true, allowCreate: true, allowUpdate: true, allowRealtime: true },
    may: true as boolean,
  }
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { value: state.settings }, error: null }),
  }
  return {
    state,
    client: {
      from: () => chain,
      rpc: async () => ({ data: state.may, error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  }
})
vi.mock('@/lib/supabase', () => ({ supabase: db.client }))

import { useAuthStore } from '../auth'
import { useCloudStore } from '../cloud'

const settle = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
}

describe('who may create cloud projects', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    db.state.may = true
    db.state.settings.allowCreate = true
  })

  it('lets someone on the list (or anyone, with it empty) create', async () => {
    const cloud = useCloudStore()
    useAuthStore().user = { id: 'me' } as never
    await settle()
    expect(cloud.canCreate).toBe(true)
    expect(cloud.createBlocked).toBeNull()
  })

  it('holds back someone not on it, saying so', async () => {
    db.state.may = false
    const cloud = useCloudStore()
    useAuthStore().user = { id: 'me' } as never
    await settle()
    expect(cloud.canCreate).toBe(false)
    expect(cloud.createBlocked).toBe('not_allowed')
  })

  it('says the cloud is paused before anything about the list', async () => {
    db.state.may = false
    db.state.settings.allowCreate = false
    const cloud = useCloudStore()
    useAuthStore().user = { id: 'me' } as never
    await settle()
    expect(cloud.createBlocked).toBe('paused')
  })
})
