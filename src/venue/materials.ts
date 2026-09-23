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

/** Furniture fabrics */
export const FM = {
  red: mat('#c8322b', { name: 'red' }),
  orange: mat('#e98a2e', { name: 'orange' }),
  lime: mat('#7cae4a', { name: 'green' }),
  beige: mat('#e2d6bf', { name: 'beige' }),
  white: mat('#f4f3ef', { name: 'white' }),
  black: mat('#26282c', { name: 'black' }),
  fabric: mat('#8c8f96', { name: 'fabric' }),
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
