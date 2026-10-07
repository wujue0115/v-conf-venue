import * as THREE from 'three'
import type { VariantAxis } from './furniture'
import { B, Cy, FM, mat, mesh } from './materials'

/*
 * Outlets as found in Taiwan, whose plans the venue doesn't give: they're put where they turn
 * out to be on site.
 *
 * 插座 hangs on a wall: a white plate with two sockets one above the other. It hangs from its
 * group origin, the centre of the plate's back on the wall, like a poster; local +z points out
 * of the wall. Its variant is the kind of socket: 110V with an earth hole (two upright flat
 * slots over a round hole), 110V without one (the two slots alone), or 220V (two flat slots
 * lying side by side over the hole).
 *
 * 地板插座 is set in the floor: a stainless plate round a white insert with two 110V earthed
 * sockets side by side, facing up and read from the front (+z). The origin is its middle on
 * the floor.
 */

export const OUTLET_AXES: readonly VariantAxis[] = [
  {
    label: 'kind',
    options: [
      { id: 'g110', swatch: '' },
      { id: 'n110', swatch: '' },
      { id: 'v220', swatch: '' },
    ],
  },
]

/** The wall plate, in metres */
const PLATE_W = 0.07
const PLATE_H = 0.12
const PLATE_T = 0.008
/** Each socket's raised face, and how far apart two sit, centre to centre */
const FACE = 0.044
const FACE_T = 0.002
const FACE_GAP = 0.054
/** The slots: 12.7 mm apart, 7 mm long, a little above the socket's middle when earthed */
const SLOT_X = 0.00635
const SLOT_Y = 0.005
const SLOT_W = 0.0018
const SLOT_L = 0.007
/** The round earth hole below them */
const EARTH_Y = -0.01
const EARTH_R = 0.0024
/** The floor box: its stainless plate, and the white insert the sockets sit in */
const BOX = 0.13
const BOX_T = 0.006
const INSERT = 0.104

const plastic = mat('#f4f3ef', { roughness: 0.45, name: 'outlet_plastic' })
const flat = { e: null, cast: false }

/**
 * One socket's raised face of `kind`, centred on (x, y) of `g`'s xy plane, looking along +z
 * from `z` (its back)
 */
function socket(g: THREE.Object3D, kind: string, x: number, y: number, z: number) {
  mesh(B(FACE, FACE, FACE_T), plastic, g, x, y, z + FACE_T / 2, flat)
  const top = z + FACE_T
  const earthed = kind !== 'n110'
  const sy = y + (earthed ? SLOT_Y : 0)
  for (const dx of [-SLOT_X, SLOT_X]) {
    const [w, h] = kind === 'v220' ? [SLOT_L, SLOT_W] : [SLOT_W, SLOT_L]
    mesh(B(w, h, 0.0004), FM.black, g, x + dx, sy, top, flat)
  }
  if (!earthed) return
  const earth = mesh(Cy(EARTH_R, EARTH_R, 0.0004, 16), FM.black, g, x, y + EARTH_Y, top, flat)
  earth.rotation.x = Math.PI / 2
}

export function buildOutlet(g: THREE.Group, v?: string) {
  // the size a wall item keeps above the floor and steps along by when copied
  g.userData.w = PLATE_W
  g.userData.h = PLATE_H
  mesh(B(PLATE_W, PLATE_H, PLATE_T), plastic, g, 0, 0, PLATE_T / 2)
  for (const y of [FACE_GAP / 2, -FACE_GAP / 2]) socket(g, v ?? 'g110', 0, y, PLATE_T)
}

export function buildFloorOutlet(g: THREE.Group) {
  mesh(B(BOX, BOX_T, BOX), FM.chrome, g, 0, BOX_T / 2, 0)
  mesh(B(INSERT, 0.001, INSERT), plastic, g, 0, BOX_T + 0.0005, 0, flat)
  // the sockets' plane, turned to face up: its +y points away from the front
  const top = new THREE.Group()
  top.rotation.x = -Math.PI / 2
  top.position.y = BOX_T + 0.001
  g.add(top)
  for (const x of [FACE_GAP / 2, -FACE_GAP / 2]) socket(top, 'g110', x, 0, 0)
}
