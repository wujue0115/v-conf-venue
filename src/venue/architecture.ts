import * as THREE from 'three'
import { B, EA, EF, M, edges, mat, mesh, noRay } from './materials'

// Plan meters from 平面尺寸圖 (cm grid 900/250/565/580/580/565/245 · 615/895/810/655 · A2 780/390/397.5)
// origin = 景觀梯 NW corner, +x east, +z south

export const CENTER = new THREE.Vector3(19, 0, 17.5)
const H = 4

type Seg = [x1: number, z1: number, x2: number, z2: number]
type Pt = [x: number, z: number]

export interface Architecture {
  /** Floors, stairs, stage, fixed seating */
  arch: THREE.Group
  /** Walls / glass / columns — can be cut down (剖切) */
  wallsG: THREE.Group
  /** Coloured zone tints from 官網配置圖 */
  zonesG: THREE.Group
  /** Walkable meshes used to find the floor height under a point */
  walk: THREE.Mesh[]
  /** Fixed seats in A2 (not billed) */
  fixedSeats: number
  ground: THREE.Mesh
}

const WALLS: Seg[] = [
  // A201 (2355 × 720 cm)
  [11.1, -8.05, 11.1, 0.3],
  [34.85, -8.05, 34.85, 0.3],
  [15.37, -8.95, 20.78, -8.95],
  [25.13, -8.95, 30.53, -8.95],
  [15.37, -8.95, 15.37, -8.6],
  [20.78, -8.95, 20.78, -8.6],
  [25.13, -8.95, 25.13, -8.6],
  [30.53, -8.95, 30.53, -8.6],
  // A201 | A215：門僅在柱旁（11.5 東側、22.95 兩側、34.4 西側）
  [12.9, -0.85, 21.4, -0.85],
  [24.5, -0.85, 33, -0.85],
  [33.73, -6.05, 33.73, -1.25],
  [33.73, -8.05, 33.73, -6.85],
  // 景觀梯 / 服務核北牆
  [0, 0.3, 11.1, 0.3],
  [34.85, 0.3, 36.9, 0.3],
  // 景觀梯 + A215 west
  [0, 0.3, 0, 6.3],
  [0, 6.3, 8.2, 6.3],
  [11.1, 6.3, 11.1, 15.2],
  // service core
  [28.35, 2.4, 28.35, 9.1],
  [28.35, 12.2, 28.35, 23.2],
  [28.35, 2.4, 34.8, 2.4],
  [34.8, 2.4, 34.8, 6],
  [28.35, 6, 34.8, 6],
  [31.4, 6, 31.4, 9.1],
  [28.35, 9.1, 34.4, 9.1],
  [28.35, 12.2, 34.4, 12.2],
  [31.4, 12.2, 31.4, 15.1],
  [28.35, 15.1, 37.2, 15.1],
  [28.35, 19.6, 31.8, 19.6],
  [33, 19.6, 37.2, 19.6],
  [33.3, 15.1, 33.3, 17.2],
  [33.3, 18.4, 33.3, 19.6],
  [28.35, 23.2, 33.5, 23.2],
  [33.5, 19.6, 33.5, 21.6],
  // east exterior
  [36.9, 0.3, 36.9, 5.8],
  [36.9, 5.8, 37.4, 5.8],
  [37.4, 5.8, 37.4, 9.1],
  [37.4, 9.1, 36.9, 9.1],
  [36.9, 9.1, 36.9, 12.2],
  [36.9, 12.2, 37.2, 12.2],
  [37.2, 12.2, 37.2, 19.6],
  [36.9, 19.6, 36.9, 29.75],
  // south band
  [10.7, 23.2, 8.6, 23.2],
  [8.6, 23.2, 8.6, 29.75],
  [19.4, 25.4, 23.6, 25.4],
  [19.4, 25.4, 19.4, 29.75],
  [23.6, 25.4, 23.6, 26.9],
  [23.6, 28.1, 23.6, 29.75],
  [23.4, 23.2, 23.4, 25.4],
  [28.4, 25.3, 28.4, 26.4],
  [28.4, 28.4, 28.4, 29.75],
  [28.4, 25.3, 36.9, 25.3],
  [31.6, 25.3, 31.6, 29.75],
  [35.2, 25.3, 35.2, 28.9],
  // A2 國際會議廳
  [8.6, 29.75, 9.3, 29.75],
  [11.3, 29.75, 29.4, 29.75],
  [31.2, 29.75, 35.4, 29.75],
  [36.4, 29.75, 37.3, 29.75],
  [11.2, 29.75, 11, 33.3],
  [8.6, 29.75, 8.6, 45.6],
  [8.6, 45.6, 26, 45.6],
  [26, 45.6, 32.9, 47.9],
  [32.9, 47.9, 37.8, 47.9],
  [37.8, 47.9, 37.8, 36.2],
  [37.8, 36.2, 37.3, 36.2],
  [37.3, 36.2, 37.3, 29.75],
  [8.6, 42.3, 9, 42.3],
  [10.2, 42.3, 11.1, 42.3],
  [11.1, 42.3, 11.6, 45.6],
  [34.2, 29.75, 34.2, 31.8],
  [34.2, 43.4, 34.2, 45.1],
  [26, 45.5, 29.7, 45.1],
  [36.2, 45.1, 36.2, 47.9],
]

// zone tints (官網配置圖)
const ZONES: [string, Pt[]][] = [
  [
    '#f3d9a8',
    [
      [11.1, 5],
      [23.5, 5],
      [23.5, 15.4],
      [11.1, 15.4],
    ],
  ],
  [
    '#cdebea',
    [
      [11.1, 0.4],
      [34.7, 0.4],
      [34.7, 2.2],
      [28.35, 2.2],
      [28.35, 22.7],
      [22.2, 22.7],
      [22.2, 20.6],
      [11.1, 20.6],
      [11.1, 15.4],
      [23.5, 15.4],
      [23.5, 5],
      [11.1, 5],
    ],
  ],
  [
    '#f3d9a8',
    [
      [19.5, 25.5],
      [23.5, 25.5],
      [23.5, 29.6],
      [19.5, 29.6],
    ],
  ],
  [
    '#dedede',
    [
      [31.7, 25.4],
      [35.1, 25.4],
      [35.1, 29.6],
      [31.7, 29.6],
    ],
  ],
  [
    '#f1d3dc',
    [
      [11.2, 30],
      [32.2, 30],
      [32.2, 44.9],
      [11.6, 45.4],
      [11.1, 42.4],
      [8.75, 42.4],
      [8.75, 33.3],
      [11, 33.3],
    ],
  ],
  [
    '#c9eef0',
    [
      [34.3, 29.9],
      [37.2, 29.9],
      [37.2, 44.9],
      [34.3, 44.9],
    ],
  ],
  [
    '#e6d2f3',
    [
      [8.75, 42.4],
      [11.1, 42.4],
      [11.5, 45.4],
      [8.75, 45.4],
    ],
  ],
  [
    '#d3efc4',
    [
      [29.7, 45.2],
      [36.1, 45.2],
      [36.1, 47.8],
      [32.9, 47.8],
      [29.7, 46.7],
    ],
  ],
]
const ZONE_ON = { rake: '#ecc6d2', stage: '#b9bdf0' }
const ZONE_OFF = { rake: '#ebe6da', stage: '#d9c9ae' }

export function setZones(zonesG: THREE.Group, on: boolean) {
  zonesG.visible = on
  const c = on ? ZONE_ON : ZONE_OFF
  M.rake.color.set(c.rake)
  M.stage.color.set(c.stage)
}

export function buildArchitecture(scene: THREE.Scene): Architecture {
  const arch = new THREE.Group()
  const wallsG = new THREE.Group()
  const zonesG = new THREE.Group()
  const walk: THREE.Mesh[] = []
  scene.add(arch, wallsG, zonesG)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ opacity: 0.08 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(CENTER.x, -0.31, CENTER.z)
  ground.receiveShadow = true
  scene.add(ground)

  function slab(x1: number, z1: number, x2: number, z2: number, m: THREE.Material = M.floor) {
    const s = mesh(B(x2 - x1, 0.3, z2 - z1), m, arch, (x1 + x2) / 2, -0.15, (z1 + z2) / 2, {
      cast: false,
    })
    walk.push(s)
    return s
  }
  function prism(
    pts: Pt[],
    hgt: number,
    m: THREE.Material,
    parent: THREE.Object3D,
    y0 = 0,
    e: THREE.LineBasicMaterial | null = EF,
  ) {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
    const o = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: hgt, bevelEnabled: false }), m)
    o.rotation.x = -Math.PI / 2
    o.position.y = y0
    o.castShadow = o.receiveShadow = true
    if (e) edges(o, e)
    parent.add(o)
    return o
  }

  slab(11.1, -9.2, 34.9, 0.3, M.floor2) // A201 (2355 × 720 + 門斗)
  slab(0, 0.3, 11.1, 6.3, M.service) // 景觀梯
  slab(11.1, 0.3, 28.35, 23.2) // A215
  slab(28.35, 0.3, 37.4, 23.2, M.service) // service core
  slab(8.6, 23.2, 36.9, 29.75) // south band: A223 / A2 lobby
  slab(8.6, 29.75, 37.8, 45.6) // A2
  slab(26, 45.6, 37.8, 47.9, M.service) // 翻譯室

  function seg(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    t: number,
    hh: number,
    m: THREE.Material,
    parent: THREE.Object3D,
    y0 = 0,
  ) {
    const dx = x2 - x1
    const dz = z2 - z1
    const L = Math.hypot(dx, dz)
    const w = mesh(B(L + t, hh, t), m, parent, (x1 + x2) / 2, y0 + hh / 2, (z1 + z2) / 2, {
      e: m === M.glass ? null : EA,
      cast: m !== M.glass,
    })
    w.rotation.y = Math.atan2(-dz, dx)
    return w
  }
  const wall = (a: number, b: number, c: number, d: number, hh = H) =>
    seg(a, b, c, d, 0.25, hh, M.wall, wallsG)
  function glass(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    hh = H,
    parent: THREE.Object3D = wallsG,
  ) {
    seg(x1, z1, x2, z2, 0.06, hh, M.glass, parent)
    const L = Math.hypot(x2 - x1, z2 - z1)
    const n = Math.max(1, Math.round(L / 1.6))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      mesh(B(0.1, hh, 0.1), M.dark, parent, x1 + (x2 - x1) * t, hh / 2, z1 + (z2 - z1) * t, {
        e: null,
      })
    }
    seg(x1, z1, x2, z2, 0.1, 0.08, M.dark, parent, hh - 0.08)
    if (hh > 2) seg(x1, z1, x2, z2, 0.1, 0.06, M.dark, parent, hh * 0.5)
  }

  WALLS.forEach((w) => wall(...w))
  glass(10.7, 15.2, 10.7, 23.2)
  ;(
    [
      [12.05, 15.37],
      [20.78, 22.4],
      [23.5, 25.13],
      [30.53, 33.85],
    ] as Pt[]
  ).forEach(([p, q]) => glass(p, -8.74, q, -8.74))
  ;(
    [
      [11.5, -8.6],
      [22.95, -8.6],
      [34.4, -8.6],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(1.1, H, 1.1), M.wall, wallsG, x, H / 2, z))
  glass(29.7, 45.1, 36.2, 45.1, 2.4)
  glass(0.6, 9.4, 11.1, 9.4, 1.1, arch)

  // columns (structural grid)
  ;(
    [
      [11.5, 6.15],
      [22.95, 6.15],
      [11.5, 15.1],
      [22.95, 15.1],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(1, H + 0.3, 1), M.wall, wallsG, x, (H + 0.3) / 2, z))
  ;(
    [
      [11.5, 23.2],
      [22.95, 23.2],
      [17.15, -0.85],
      [28.75, -0.85],
      [11.5, -0.85],
      [22.95, -0.85],
      [34.4, -0.85],
      [11.5, 29.75],
      [17.15, 29.75],
      [22.95, 29.75],
      [28.75, 29.75],
      [34.4, 29.75],
      [11.5, 45.5],
      [17.15, 45.5],
      [22.95, 45.5],
      [28.75, 45.3],
      [34.4, 45.3],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(0.8, H, 0.8), M.wall, wallsG, x, H / 2, z))
  // elevators
  ;(
    [
      [29.9, 7.6],
      [32.9, 7.6],
      [29.9, 13.6],
      [32.9, 13.6],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(1.6, H, 1.8), M.steel, wallsG, x, H / 2, z))
  // restroom stalls
  ;[15.9, 16.8, 17.7, 18.6].forEach((z) => seg(28.35, z, 29.7, z, 0.05, 2, M.steel, wallsG))
  ;[16.3, 17.2, 18.1].forEach((z) => seg(31.9, z, 33.3, z, 0.05, 2, M.steel, wallsG))

  // stairs
  function flight(x: number, z0: number, dir: number, n = 11, w = 2.4) {
    for (let i = 0; i < n; i++)
      mesh(B(w, 0.18 * (i + 1), 0.3), M.step, arch, x, 0.09 * (i + 1), z0 + dir * i * 0.3, {
        e: EF,
      })
  }
  function flightX(z: number, x0: number, dir: number, n = 11, w = 2.4) {
    for (let i = 0; i < n; i++)
      mesh(B(0.3, 0.18 * (i + 1), w), M.step, arch, x0 + dir * i * 0.3, 0.09 * (i + 1), z, {
        e: EF,
      })
  }
  flight(30.4, 2.7, 1, 10, 1.4)
  flight(32.1, 5.7, -1, 10, 1.4)
  flight(30.4, 19.9, 1, 11, 1.4)
  flight(32.1, 22.9, -1, 11, 1.4)
  flightX(2.15, 3.9, 1, 18, 1.4)
  flightX(4.4, 7.8, -1, 15, 2)

  function tiers(
    x1: number,
    x2: number,
    z1: number,
    z2: number,
    n: number,
    rise: number,
    south: boolean,
  ) {
    const d = (z2 - z1) / n
    for (let i = 0; i < n; i++) {
      const hh = rise * (south ? i + 1 : n - i)
      walk.push(
        mesh(B(x2 - x1, hh, d), M.step, arch, (x1 + x2) / 2, hh / 2, z1 + d * (i + 0.5), {
          e: EF,
          cast: false,
        }),
      )
    }
  }
  tiers(12.2, 22.1, 20.6, 23.1, 4, 0.2, true)
  tiers(9.2, 19.2, 25.8, 27.4, 3, 0.2, false)

  // A2: stage on the east, seats face east, rake rises to the west
  walk.push(
    prism(
      [
        [32.2, 30.5],
        [34.2, 30.5],
        [34.2, 31.8],
        [35.3, 32.8],
        [35.3, 42.4],
        [34.2, 43.4],
        [34.2, 44.7],
        [32.2, 44.7],
        [32.2, 43.8],
        [31.4, 43.8],
        [30.9, 42.8],
        [30.4, 40.8],
        [30.4, 34.4],
        [30.9, 32.4],
        [31.4, 31.4],
        [32.2, 31.4],
      ],
      0.9,
      M.stage,
      arch,
      0,
      EA,
    ),
  )
  mesh(B(0.1, 3.4, 10), M.screen, arch, 34.1, 3, 37.6, { e: EA })

  const fixedSeats = buildA2Seating(arch, walk)

  ZONES.forEach(([c, p]) => {
    const o = prism(p, 0.01, mat(c, { name: 'zone' }), zonesG, 0.002, null)
    o.castShadow = false
    o.raycast = noRay
  })
  setZones(zonesG, false)
  wallsG.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.raycast = noRay
  })

  return { arch, wallsG, zonesG, walk, fixedSeats, ground }
}

/** Curved, raked fixed seating in A2. Returns the seat count. */
function buildA2Seating(arch: THREE.Group, walk: THREE.Mesh[]) {
  const K = 0.02
  const ZC = 37.6
  const blocks: Pt[] = [
    [30.7, 33.6],
    [35, 40.2],
    [41.6, 44.6],
  ]
  const cuts: Pt[] = [
    [30.3, 34.3],
    [34.3, 40.9],
    [40.9, 44.9],
  ]
  const slots: { x: number; z: number; h: number; r: number }[] = []
  for (let i = 0; i < 14; i++) {
    const xr = 26.6 - i * 1.14
    const hh = i * 0.09
    if (hh > 0)
      cuts.forEach(([p, q]) => {
        const zc = (p + q) / 2
        walk.push(
          mesh(B(1.14, hh, q - p), M.rake, arch, xr + K * (zc - ZC) ** 2 - 0.05, hh / 2, zc, {
            e: EF,
            cast: false,
          }),
        )
      })
    blocks.forEach(([p, q]) => {
      const n = Math.floor((q - p) / 0.53) + 1
      for (let k = 0; k < n; k++) {
        const z = p + k * 0.53
        slots.push({ x: xr + K * (z - ZC) ** 2, z, h: hh, r: Math.atan(2 * K * (z - ZC)) })
      }
    })
  }
  const s1 = new THREE.InstancedMesh(B(0.48, 0.1, 0.5), M.seatA, slots.length)
  const s2 = new THREE.InstancedMesh(B(0.07, 0.5, 0.5), M.seatB, slots.length)
  const d = new THREE.Object3D()
  slots.forEach((s, i) => {
    d.rotation.set(0, s.r, 0)
    d.position.set(s.x, s.h + 0.44, s.z)
    d.updateMatrix()
    s1.setMatrixAt(i, d.matrix)
    d.position.set(s.x - 0.22 * Math.cos(s.r), s.h + 0.7, s.z + 0.22 * Math.sin(s.r))
    d.updateMatrix()
    s2.setMatrixAt(i, d.matrix)
  })
  for (const m of [s1, s2]) {
    m.castShadow = m.receiveShadow = true
    arch.add(m)
  }
  return slots.length
}
