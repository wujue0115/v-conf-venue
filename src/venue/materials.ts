import * as THREE from 'three'

export const YEL = '#EDB32A'

export const mat = (
  color: THREE.ColorRepresentation,
  o: THREE.MeshStandardMaterialParameters = {},
) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o })

export const M = {
  floor: mat('#fbfaf6', { name: 'floor' }),
  floor2: mat('#f4f1e9', { name: 'floor_hall' }),
  wall: mat('#ffffff', { name: 'wall' }),
  step: mat('#ebe6da', { name: 'step' }),
  stage: mat('#d9c9ae', { name: 'stage' }),
  rake: mat('#ebe6da', { name: 'rake' }),
  service: mat('#e7e4dd', { name: 'service_floor' }),
  dark: mat('#2f3237', { name: 'dark' }),
  steel: mat('#d8dce1', { name: 'steel' }),
  glass: new THREE.MeshStandardMaterial({
    color: '#b9d3db',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    roughness: 0.1,
    side: THREE.DoubleSide,
    name: 'glass',
  }),
  seatA: mat('#4a4e57', { name: 'seat' }),
  seatB: mat('#2f3237', { name: 'seat_back' }),
  ink: mat('#3a3d44', { name: 'ink' }),
  leg: mat('#9aa0a8', { metalness: 0.4, roughness: 0.45, name: 'leg' }),
  top: mat('#f7f6f2', { name: 'top' }),
  wood: mat('#c9a57c', { name: 'wood' }),
  yel: mat(YEL, { name: 'yellow' }),
  green: mat('#42b883', { name: 'vue_green' }),
  navy: mat('#35495e', { name: 'vue_navy' }),
  leaf: mat('#5f9a5c', { flatShading: true, name: 'leaf' }),
  pot: mat('#d6d0c4', { name: 'pot' }),
  screen: mat('#1c1e22', { roughness: 0.3, name: 'screen' }),
}

/** Furniture finishes, matched to the photos in 家具設備租借費用圖表 */
const metal = (color: string, name: string) => mat(color, { metalness: 0.55, roughness: 0.3, name })
export const FM = {
  chrome: metal('#e2e5e9', 'chrome'),
  silver: metal('#c3c7cc', 'silver'),
  frame: metal('#5f6267', 'frame_grey'),
  blackMetal: mat('#1f2023', { metalness: 0.3, roughness: 0.5, name: 'black_metal' }),
  black: mat('#26282c', { name: 'black' }),
  mesh: mat('#2c2d31', { roughness: 1, name: 'mesh' }),
  greyLeather: mat('#5a5a5c', { roughness: 0.6, name: 'grey_leather' }),
  brownLeather: mat('#6e4b3b', { roughness: 0.6, name: 'brown_leather' }),
  charcoal: mat('#3a3c41', { roughness: 0.6, name: 'charcoal_panel' }),
  redOrange: mat('#df4a2c', { name: 'red_orange' }),
  tan: mat('#c27a3e', { roughness: 0.55, name: 'tan_leather' }),
  olive: mat('#9cb23c', { roughness: 0.55, name: 'olive_leather' }),
  cream: mat('#e8e3d5', { name: 'cream' }),
  pattern: mat('#a9a296', { name: 'pattern_fabric' }),
  shell: mat('#e3e3e0', { roughness: 0.5, name: 'plastic_shell' }),
  blue: mat('#6090b4', { name: 'blue_pad' }),
  white: mat('#f4f3ef', { roughness: 0.5, name: 'white' }),
  laminate: mat('#a4a8ad', { roughness: 0.6, name: 'grey_laminate' }),
  oak: mat('#dcbc8f', { name: 'oak' }),
  walnut: mat('#7c4a2d', { roughness: 0.6, name: 'walnut' }),
  panel: mat('#c5c8cc', { name: 'grey_panel' }),
  teal: mat('#2f6b77', { roughness: 0.5, name: 'teal' }),
  belt: mat('#c8322b', { name: 'belt_red' }),
}

/** Edge line materials: strong (architecture outlines) / faint (details) */
export const EA = new THREE.LineBasicMaterial({ color: '#34363b' })
export const EF = new THREE.LineBasicMaterial({ color: '#55585f', transparent: true, opacity: 0.7 })

export const noRay = () => {}

export function edges<T extends THREE.Mesh>(m: T, em: THREE.LineBasicMaterial = EA, th = 25): T {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, th), em)
  e.raycast = noRay
  m.add(e)
  return m
}

export interface MeshOpts {
  e?: THREE.LineBasicMaterial | null
  cast?: boolean
  recv?: boolean
}

export function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
  { e = EA, cast = true, recv = true }: MeshOpts = {},
) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = recv
  if (e) edges(m, e)
  parent.add(m)
  return m
}

export const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const Cy = (rt: number, rb: number, h: number, s = 40) =>
  new THREE.CylinderGeometry(rt, rb, h, s)
