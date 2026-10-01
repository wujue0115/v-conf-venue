import { describe, expect, it, vi } from 'vitest'
import type { Peer } from '@/cloud/realtime'
import type { Holder } from '../collab'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { colorOf, holders } from '../collab'

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
