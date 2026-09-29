import { afterEach, describe, expect, it } from 'vitest'
import en from '../en'
import zh from '../zh'
import { locale, nameOf, sizeOf, variantName } from '..'
import { FURNITURE_TYPES, variantAxesOf } from '@/venue/furniture'
import { FACILITIES, ROOMS, VIEWS } from '@/venue/places'

describe('i18n', () => {
  afterEach(() => {
    locale.value = 'zh'
  })

  it('names every item kind and variant option in both languages', () => {
    for (const m of [zh, en])
      for (const type of FURNITURE_TYPES) {
        expect(m.furniture[type]).toBeTruthy()
        for (const axis of variantAxesOf(type))
          for (const o of axis.options) expect(m.variants[type]?.[o.id]).toBeTruthy()
      }
  })

  it('names every room, facility and camera view in both languages', () => {
    for (const m of [zh, en]) {
      for (const r of ROOMS) expect(m.rooms[r.id]?.name).toBeTruthy()
      for (const f of FACILITIES) expect(m.facilities[f.key]).toBeTruthy()
      for (const v of VIEWS) expect(m.views[v.key]).toBeTruthy()
    }
  })

  it('follows the chosen language, keeping dimensions as they are', () => {
    locale.value = 'zh'
    expect([nameOf('laptop'), variantName('laptop', 'silver'), sizeOf('zone')]).toEqual([
      '筆記型電腦',
      '銀色',
      '可調整尺寸',
    ])
    locale.value = 'en'
    expect([nameOf('laptop'), variantName('laptop', 'silver'), sizeOf('zone')]).toEqual([
      'Laptop',
      'Silver',
      'Adjustable',
    ])
    expect(sizeOf('table2')).toBe('W1200×D450×H710')
  })
})
