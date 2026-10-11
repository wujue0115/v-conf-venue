import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { STAGE_H, buildArchitecture } from '../architecture'
import { FLOORS, floorAt, floors1At, floorsOf, toCurrentFloors } from '../floors'
import {
  STORAGE_KEY,
  exportLayout,
  loadSavedLayout,
  readLayoutFile,
  saveLayout,
  type LayoutItem,
} from '../layout'

const at = (x: number, z: number, y?: number): LayoutItem => ({ t: 'sign', x, y, z, r: 0 })

describe('floors', () => {
  it('knows where the floors stood before, and nowhere else', () => {
    expect(floors1At(17, 10)).toBeNull() // A215
    expect(floors1At(33, 37.6)).toBe(0.9) // the stage
    expect(floors1At(9.5, 37)).toBeCloseTo(1.17) // behind A2's back row
    expect(floors1At(15, 24.5)).toBe(0.8) // the platform up to A2's back
    expect(floors1At(36.5, 38)).toBe(0) // the backstage, on the hall's floor then
  })

  it('moves what stood on a moved floor with it, by as much as the floor moved', () => {
    const [stage, back, platform, store] = toCurrentFloors(
      [at(33, 37.6, 0.9 + 0.75), at(9.5, 37, 1.17), at(15, 24.5, 0.8), at(22.8, 24.5, 0.8)],
      1,
    )
    // on a table on the stage: still on the table, the stage 0.2 lower
    expect(stage!.y).toBeCloseTo(STAGE_H + 0.75)
    expect(back!.y).toBeCloseTo(floorAt(9.5, 37))
    expect(platform!.y).toBeCloseTo(1.2)
    // A224 is on the corridor's level now, off the platform
    expect(store!.y).toBeCloseTo(0)
  })

  it('keeps someone seated in A2 on their seat as the rake steepens', () => {
    const { seats } = buildArchitecture(new THREE.Scene())
    // a seat in the sixth row (16 cm a row now); it was 9 cm a row then
    const seat = seats.find((f) => Math.abs(f.y - (5 * 0.16 + 0.49)) < 1e-6)!
    const person: LayoutItem = {
      t: 'person',
      x: seat.x,
      y: 5 * 0.09 + 0.49,
      z: seat.z,
      r: 0,
      sit: true,
    }
    expect(toCurrentFloors([person], 1)[0]!.y).toBeCloseTo(seat.y, 3)
  })

  it('leaves alone what has no height, stands where nothing moved, or is on today’s floors', () => {
    const items = [at(33, 37.6), at(17, 10, 0), at(33, 37.6, 0.9)]
    const moved = toCurrentFloors(items, 1)
    expect(moved[0]).toBe(items[0])
    expect(moved[1]).toBe(items[1])
    expect(toCurrentFloors(items, FLOORS)).toEqual(items)
  })

  it('reads a file’s floors, older files (and bare lists) being on the first', () => {
    expect(floorsOf(undefined)).toBe(1)
    expect(floorsOf(2)).toBe(2)
    expect(floorsOf('2')).toBe(1)
    const old = [at(33, 37.6, 0.9)]
    expect(readLayoutFile(old)[0]!.y).toBeCloseTo(STAGE_H)
    expect(readLayoutFile({ items: old })[0]!.y).toBeCloseTo(STAGE_H)
    expect(readLayoutFile({ floors: FLOORS, items: old })[0]!.y).toBe(0.9)
  })

  it('marks exported files with today’s floors', () => {
    expect(JSON.parse(exportLayout([])).floors).toBe(FLOORS)
  })

  it('moves the layout this browser kept before on to today’s floors, then lets the old copy go', () => {
    localStorage.clear()
    const OLD = 'vueconf26-nccu-layout-v4'
    localStorage.setItem(OLD, JSON.stringify([at(33, 37.6, 0.9)]))
    const items = loadSavedLayout()!
    expect(items[0]!.y).toBeCloseTo(STAGE_H)
    expect(saveLayout(items)).toBe(true)
    expect(localStorage.getItem(OLD)).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].y).toBeCloseTo(STAGE_H)
    // kept on today's floors now: read as it is
    expect(loadSavedLayout()![0]!.y).toBeCloseTo(STAGE_H)
  })
})
