import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
  DEFAULT_PALETTES,
  PALETTE_MAX,
  cleanPalette,
  readPalettes,
  usePalettesStore,
} from '../palettes'
import { exportLayout } from '@/venue/layout'

describe('colour rows', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('keeps valid colours once each, in order, and never goes empty', () => {
    expect(cleanPalette(['#AABBCC', 'red', '#aabbcc', '#112233'], ['#000000'])).toEqual([
      '#aabbcc',
      '#112233',
    ])
    expect(cleanPalette([], ['#000000'])).toEqual(['#000000'])
    expect(cleanPalette('nope', ['#000000'])).toEqual(['#000000'])
    const many = Array.from({ length: 40 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`)
    expect(cleanPalette(many, [])).toHaveLength(PALETTE_MAX)
  })

  it('remembers an edited row and resets it to the default', async () => {
    const store = usePalettesStore()
    store.setPalette('tag', ['#123456', '#abcdef'])
    await nextTick()
    setActivePinia(createPinia())
    const again = usePalettesStore()
    expect(again.palettes.tag).toEqual(['#123456', '#abcdef'])
    expect(again.palettes.person).toEqual(DEFAULT_PALETTES.person)
    again.resetPalette('tag')
    expect(again.palettes.tag).toEqual(DEFAULT_PALETTES.tag)
  })

  it('keeps a row as it was when an edit would empty it', () => {
    const store = usePalettesStore()
    store.setPalette('zone', ['#123456'])
    store.setPalette('zone', [])
    expect(store.palettes.zone).toEqual(['#123456'])
  })

  it('travel in the exported file and come back on import', () => {
    const store = usePalettesStore()
    store.setPalette('person', ['#111111', '#222222'])
    const file = JSON.parse(exportLayout([], store.palettes))
    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = usePalettesStore()
    fresh.importPalettes(file)
    expect(fresh.palettes.person).toEqual(['#111111', '#222222'])
    expect(fresh.palettes.zone).toEqual(DEFAULT_PALETTES.zone)
  })

  it('ignore a file without usable colour rows', () => {
    expect(readPalettes({ items: [] })).toEqual({})
    expect(readPalettes({ palettes: { tag: ['red'], zone: '#123456' } })).toEqual({})
    expect(readPalettes({ palettes: { tag: ['#ABCDEF'] } })).toEqual({ tag: ['#abcdef'] })
  })
})
