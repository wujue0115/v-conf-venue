import * as THREE from 'three'
import { B, Cy, EA, EF, M, edges, mat, mesh, noRay } from './materials'

// Plan meters from 平面尺寸圖 (cm grid 900/250/565/580/580/565/245 · 615/895/810/655 · A2 780/390/397.5)
// origin = 景觀梯 NW corner, +x east, +z south

export const CENTER = new THREE.Vector3(19, 0, 17.5)
const H = 4
/** A2's raked seating: rows, and how much each row steps up toward the back (west) */
const A2_ROWS = 14
const A2_RISE = 0.09
/** Row positions: the first (lowest) row's x, each row's depth, and how the rows bow east toward their ends */
const A2_X0 = 25.9
const A2_ROW = 1.105
const A2_BOW = 0.02
const A2_ZC = 37.6
/** The rake is built in three sections along z, each bowed by the curve at its centre */
const A2_CUTS: [number, number][] = [
  [30.3, 34.3],
  [34.3, 40.9],
  [40.9, 44.9],
]
/** West edge of the back (highest) row's section centred at zc */
const a2BackEdge = (zc: number) =>
  A2_X0 - (A2_ROWS - 1) * A2_ROW - A2_ROW / 2 + A2_BOW * (zc - A2_ZC) ** 2 - 0.05

type Seg = [x1: number, z1: number, x2: number, z2: number]

export interface FixedSeat {
  x: number
  y: number
  z: number
  /** Rotation about y for a figure facing +z to face the stage */
  turn: number
}
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
  /** Where someone sits on each fixed A2 seat (hips on the cushion) and the way they face */
  seats: FixedSeat[]
  ground: THREE.Mesh
}

const WALLS: Seg[] = [
  // A201 (2355 × 720 cm), its south columns on A215's first grid line (z 0)
  [11.1, -8.3, 11.1, -0.5],
  [34.85, -8.3, 34.85, -0.5],
  // the two 540.5 bays in the north façade, and the wall stubs either side of the glass
  [15.3, -8.75, 20.9, -8.75],
  [25.05, -8.75, 30.65, -8.75],
  [15.3, -8.75, 15.3, -8.25],
  [20.9, -8.75, 20.9, -8.25],
  [25.05, -8.75, 25.05, -8.25],
  [30.65, -8.75, 30.65, -8.25],
  [12.1, -8.4, 13.1, -8.4],
  [32.8, -8.4, 33.8, -8.4],
  // the strip along A201's east wall, open to the room at both ends
  [33.73, -6.9, 33.73, -1.43],
  [33.73, -8.3, 33.73, -7.7],
  // A201 | A215: one wall that steps. Along the two 690 bays it stands forward (A201 reaching
  // into A215); either end and between the bays it steps back, and the four doors are there,
  // beside the columns standing in front of it.
  [11.1, -0.5, 13.8, -0.5],
  [13.8, -0.5, 13.8, 0.4],
  [13.8, 0.4, 20.7, 0.4],
  [20.7, 0.4, 20.7, -0.5],
  [20.7, -0.5, 25.1, -0.5],
  [25.1, -0.5, 25.1, 0.4],
  [25.1, 0.4, 32, 0.4],
  [32, 0.4, 32, -0.5],
  [32, -0.5, 34.85, -0.5],
  // 服務核 north wall
  [34.85, 0.3, 36.9, 0.3],
  // service core: the north stair, the two lift rooms (east walls on 34.8), the lift lobby
  // between them opening to A215 on the west and to two rooms on the east
  [28.35, 2.4, 28.35, 9.1],
  [28.35, 12.2, 28.35, 23.2],
  [28.35, 2.4, 34.8, 2.4],
  [34.8, 2.4, 34.8, 9.1],
  [28.35, 6, 34.8, 6],
  [31.6, 6, 31.6, 9.1],
  [28.35, 9.1, 34.8, 9.1],
  [28.35, 12.2, 34.8, 12.2],
  [34.8, 12.2, 34.8, 15.1],
  [31.97, 12.2, 31.97, 15.1],
  [35.9, 9.1, 35.9, 12.2],
  [35.8, 9.1, 37.4, 9.1],
  [35.8, 12.2, 37.2, 12.2],
  // the restrooms, reached from the lobby through a small hall (34.8–37.2, 12.2–13.8)
  [28.35, 15.1, 34.8, 15.1],
  [34.8, 13.8, 37.2, 13.8],
  // restrooms | south stairwell: a solid wall, the stair has no way into the restrooms
  [28.35, 19.6, 37.2, 19.6],
  [33.3, 15.1, 33.3, 17.2],
  [33.3, 18.4, 33.3, 19.6],
  [28.35, 23.2, 33.5, 23.2],
  [33.5, 19.6, 33.5, 23.2],
  // east exterior
  [36.9, 0.3, 36.9, 5.8],
  [36.9, 5.8, 37.4, 5.8],
  [37.4, 5.8, 37.4, 9.1],
  [37.2, 12.2, 37.2, 19.6],
  [36.9, 19.6, 36.9, 29.75],
  // south band
  // on the way on to A2's back: a window (see glass) then a slanting wall beside the second
  // flight of steps; outside the window there is nothing
  [10.7, 23.2, 10.1, 23.2],
  [10.1, 25.8, 8.6, 27.9],
  [8.6, 27.9, 8.6, 29.75],
  // A223 VIP lounge, and the store beside it (door on its east)
  [19.4, 25.98, 23.6, 25.98],
  [19.4, 25.98, 19.4, 29.75],
  [23.6, 25.98, 23.6, 29.75],
  [23.4, 23.2, 23.4, 25.98],
  [22.35, 23.2, 22.35, 25.98],
  // A2's north lobby rooms: the entrance, the accessible toilet room, a service room
  [28.4, 25.3, 28.4, 26.62],
  [28.4, 28.05, 28.4, 29.75],
  [28.4, 25.3, 36.9, 25.3],
  [31.6, 25.3, 31.6, 29.75],
  [35.2, 25.3, 35.2, 28.9],
  [33.05, 25.98, 35.2, 25.98],
  [33.05, 25.98, 33.05, 28.2],
  [33.05, 28.2, 35.2, 28.2],
  // A2 國際會議廳
  [8.6, 29.75, 9.3, 29.75],
  [11, 29.75, 29.4, 29.75],
  [31.2, 29.75, 35.4, 29.75],
  [36.4, 29.75, 37.3, 29.75],
  [11.2, 29.75, 11, 33.3],
  // the entrance lobby at A2's north-west corner, with double doors south into the hall
  [8.6, 33.3, 11, 33.3],
  [8.6, 29.75, 8.6, 45.6],
  [8.6, 45.6, 26, 45.6],
  [26, 45.6, 32.9, 47.9],
  [32.9, 47.9, 37.8, 47.9],
  [37.8, 47.9, 37.8, 36.2],
  [37.8, 36.2, 37.3, 36.2],
  [37.3, 36.2, 37.3, 29.75],
  // 控制室 in the south-west corner, its door at the west end of its north wall
  [8.6, 41.6, 11.2, 41.6],
  [11.2, 41.6, 11.6, 45.6],
  [34.2, 29.75, 34.2, 31.8],
  [34.2, 43.4, 34.2, 45.1],
  [26, 45.5, 29.7, 45.1],
  [36.2, 45.1, 36.2, 47.9],
]

/**
 * Doorways from 平面尺寸圖: where a door (a swing arc whose radius is drawn as a thin leaf)
 * stands in a modelled wall, the wall is left open along the door's closed line, with a lintel
 * above unless marked 'full'. The doors themselves aren't drawn.
 */
const OPENINGS: (Seg | [...Seg, 'full'])[] = [
  // A201 | A215: at either end, and either side of the column between the bays
  [12.35, -0.5, 13.25, -0.5],
  [21.45, -0.5, 22.4, -0.5],
  [23.6, -0.5, 24.55, -0.5],
  [32.8, -0.5, 33.7, -0.5],
  // stairwells: north core by the lifts, south core (its south-east corner, away from the restrooms)
  [33.5, 2.4, 34.4, 2.4],
  [32.9, 23.2, 33.5, 23.2],
  // the restroom hall, from its door off the lobby into the restrooms
  [35.6, 13.8, 36.2, 13.8],
  // south band: store, VIP lounge, terrace, the accessible toilet room and its toilet
  [23.4, 23.6, 23.4, 24.7],
  [23.6, 26.4, 23.6, 27.25],
  [36.9, 23.85, 36.9, 24.7],
  [31.8, 25.3, 32.75, 25.3],
  [33.05, 26.2, 33.05, 27.1],
  // A2: the entrance lobby's double doors into the hall, 控制室's door
  [9.3, 33.3, 10.7, 33.3],
  [9.3, 41.6, 10.1, 41.6],
]

/** Restroom fittings */
const PORCELAIN = mat('#fbfbf9', { roughness: 0.25, name: 'porcelain' })
const COUNTER = mat('#d9d4ca', { roughness: 0.5, name: 'counter' })
/** Lift doors */
const LIFT_DOOR = mat('#f0ebdf', { roughness: 0.5, name: 'lift_door' })
/** Turns (about y) that face a fitting's front, built facing +z, east / west / north / south */
const FACE = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 }

const DOOR_H = 2.1
const WALL_T = 0.25

/** Stretches of wall [a, b] (as fractions 0–1) left open by doorways along it, and whether each keeps a lintel */
function doorGaps([x1, z1, x2, z2]: Seg): [number, number, boolean][] {
  const L = Math.hypot(x2 - x1, z2 - z1)
  const [ux, uz] = [(x2 - x1) / L, (z2 - z1) / L]
  const along = ([x, z]: Pt) => (x - x1) * ux + (z - z1) * uz
  const off = ([x, z]: Pt) => Math.abs((x - x1) * -uz + (z - z1) * ux)
  const gaps: [number, number, boolean][] = []
  for (const [ax, az, bx, bz, full] of OPENINGS) {
    const p: Pt = [ax, az]
    const q: Pt = [bx, bz]
    if (off(p) > 0.3 || off(q) > 0.3) continue
    const a = Math.max(0, Math.min(along(p), along(q)))
    const b = Math.min(L, Math.max(along(p), along(q)))
    if (b - a > 0.2) gaps.push([a / L, b / L, full !== 'full'])
  }
  return gaps.sort((p, q) => p[0] - q[0])
}

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
      [19.5, 26.1],
      [23.5, 26.1],
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
      [11.2, 41.7],
      [8.75, 41.7],
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
      [8.75, 41.7],
      [11.2, 41.7],
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

  slab(11.1, -8.9, 34.9, -0.5, M.floor2) // A201 (2355 × 720)
  slab(13.8, -0.5, 20.7, 0.4, M.floor2) // A201's two bays, reaching into A215
  slab(25.1, -0.5, 32, 0.4, M.floor2)
  // 景觀梯's stairwell is open; the 2F floor runs round its east side, where both flights
  // meet it, and on south to the railed edge at z 9.4
  slab(9.1, -0.4, 11.1, 5.9, M.service)
  slab(7.9, 2.85, 9.1, 5.9, M.service)
  slab(0.55, 5.9, 11.1, 9.4, M.service)
  slab(11.1, 0.4, 28.35, 23.2) // A215, and its strips in front of the stepped-back wall
  slab(11.1, -0.5, 13.8, 0.4)
  slab(20.7, -0.5, 25.1, 0.4)
  slab(32, -0.5, 34.85, 0.4)
  slab(28.35, 0.4, 37.4, 23.2, M.service) // service core
  // south band: A223 / A2 lobby, its west edge the window and the slanting wall
  walk.push(
    prism(
      [
        [10.1, 23.2],
        [36.9, 23.2],
        [36.9, 29.75],
        [8.6, 29.75],
        [8.6, 27.9],
        [10.1, 25.8],
      ],
      0.3,
      M.floor,
      arch,
      -0.3,
    ),
  )
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
    y0 = 0,
    bay = 1.6,
  ) {
    seg(x1, z1, x2, z2, 0.06, hh, M.glass, parent, y0)
    const L = Math.hypot(x2 - x1, z2 - z1)
    const n = Math.max(1, Math.round(L / bay))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      mesh(B(0.1, hh, 0.1), M.dark, parent, x1 + (x2 - x1) * t, y0 + hh / 2, z1 + (z2 - z1) * t, {
        e: null,
      })
    }
    seg(x1, z1, x2, z2, 0.1, 0.08, M.dark, parent, y0 + hh - 0.08)
    if (hh > 2) seg(x1, z1, x2, z2, 0.1, 0.06, M.dark, parent, y0 + hh * 0.5)
  }

  // walls, opened up where a door stands in them, with a lintel over each doorway
  for (const w of WALLS) {
    const [x1, z1, x2, z2] = w
    const L = Math.hypot(x2 - x1, z2 - z1)
    const at = (t: number): Pt => [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]
    // seg() pads each piece by half the wall's thickness at both ends; pull pieces back from doorways
    const pad = WALL_T / 2 / L
    let from = 0
    for (const [a, b, lintel] of doorGaps(w)) {
      if (a - pad > from) wall(...at(from), ...at(a - pad))
      if (lintel) seg(...at(a + pad), ...at(b - pad), WALL_T, H - DOOR_H, M.wall, wallsG, DOOR_H)
      from = b + pad
    }
    if (from < 1) wall(...at(from), ...at(1))
  }

  // A215's west side: a low glass rail along the lower ground south of 景觀梯's landing, then
  // a curtain wall; on the way on to A2's back, a window beside the second flight of steps
  glass(11.1, 9.4, 11.1, 15.1, 1.1, arch)
  glass(10.7, 15.2, 10.7, 23.2)
  glass(10.1, 23.2, 10.1, 25.8)
  // A201's north façade: glass between its columns and the bays
  ;(
    [
      [13.1, 15.3],
      [20.9, 22.4],
      [23.5, 25.05],
      [30.65, 32.8],
    ] as Pt[]
  ).forEach(([p, q]) => glass(p, -8.4, q, -8.4))
  ;(
    [
      [11.5, -8.3],
      [22.95, -8.3],
      [34.4, -8.3],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(1.1, H, 1.1), M.wall, wallsG, x, H / 2, z))
  glass(29.7, 45.1, 36.2, 45.1, 2.4)
  // the floor south of 景觀梯, railed on its west and south
  glass(0.6, 5.9, 0.6, 9.4, 1.1, arch)
  glass(0.6, 9.4, 11.1, 9.4, 1.1, arch)
  // 景觀梯's stairwell, open on three sides round the stair: on the north a curtain wall
  // (mullions 124.5 apart as the plan ticks them, on to A201's corner) behind a solid parapet,
  // glazed on the west between the corner columns; the 2F floor is railed where it meets the
  // well east of the parapet and south of the arriving flight
  glass(0.55, -0.4, 9.3, -0.4, H, wallsG, 0, 1.25)
  glass(9.3, -0.4, 11.1, -0.4)
  mesh(B(8.75, 1.5, 0.74), M.wall, wallsG, 4.925, 0.45, 0.07)
  glass(0.5, 0.5, 0.5, 5.65)
  ;(
    [
      [0, 0],
      [0, 6.15],
    ] as Pt[]
  ).forEach(([x, z]) => mesh(B(1, H + 0.3, 1), M.wall, wallsG, x, (H + 0.3) / 2, z))
  glass(9.1, 0.44, 9.1, 1.26, 1.1, arch)
  glass(0.6, 5.9, 7.9, 5.9, 1.1, arch)
  glass(7.9, 4.93, 7.9, 5.9, 1.1, arch)

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
      [17.15, 0],
      [28.75, 0],
      [11.5, 0],
      [22.95, 0],
      [34.4, 0],
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
  // lift cars, two in each lift room where the plan draws them (146 wide, 215 / 220 deep), each
  // with its doors in the lobby wall: the north room's face south, the south room's north
  ;(
    [
      [30.56, 7.65, 2.15, 9.1, 1],
      [33.03, 7.65, 2.15, 9.1, 1],
      [30.53, 13.5, 2.2, 12.2, -1],
      [33.04, 13.5, 2.2, 12.2, -1],
    ] as [number, number, number, number, 1 | -1][]
  ).forEach(([x, z, d, wz, face]) => {
    mesh(B(1.46, 2.5, d), M.steel, wallsG, x, 1.25, z)
    mesh(
      B(0.95, DOOR_H, 0.03),
      LIFT_DOOR,
      wallsG,
      x,
      DOOR_H / 2,
      wz + face * (WALL_T / 2 + 0.015),
      {
        e: EF,
      },
    )
  })

  // restrooms: the women's stalls down the west wall and back to back in the middle, the men's
  // two stalls east of the middle wall, urinals facing each other across the men's side, and
  // the basins: a counter of three, and two on the men's east wall
  const place = (x: number, z: number, turn: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = turn
    arch.add(g)
    return g
  }
  /** A toilet with its bowl at (x, z), the cistern against the wall behind it */
  function toilet(x: number, z: number, turn: number) {
    const g = place(x, z, turn)
    mesh(B(0.42, 0.78, 0.18), PORCELAIN, g, 0, 0.39, -0.3, { e: EF })
    mesh(Cy(0.19, 0.15, 0.4, 20), PORCELAIN, g, 0, 0.2, 0, { e: null }).scale.z = 1.3
  }
  /** A urinal on the wall at (x, z), facing out */
  function urinal(x: number, z: number, turn: number) {
    mesh(B(0.36, 0.62, 0.28), PORCELAIN, place(x, z, turn), 0, 0.8, 0, { e: EF })
  }
  /** A basin counter from x1–x2, z1–z2 with bowls at these points */
  function basins(x1: number, z1: number, x2: number, z2: number, bowls: Pt[]) {
    mesh(B(x2 - x1, 0.08, z2 - z1), COUNTER, arch, (x1 + x2) / 2, 0.82, (z1 + z2) / 2, { e: EF })
    for (const [x, z] of bowls)
      mesh(Cy(0.2, 0.2, 0.02, 20), PORCELAIN, arch, x, 0.87, z, { e: null })
  }
  /** Stalls along x (at `front`) between these z edges: side panels back to `back`, a door-less front beside each door */
  function stalls(back: number, front: number, edges: number[]) {
    for (const z of edges.slice(1, -1)) seg(back, z, front, z, 0.04, 1.9, M.steel, wallsG, 0.12)
    for (let i = 0; i + 1 < edges.length; i++)
      seg(front, edges[i]!, front, edges[i]! + 0.25, 0.04, 1.9, M.steel, wallsG, 0.12)
  }
  stalls(28.35, 30.25, [15.1, 16.05, 16.97, 17.88, 18.8])
  ;[15.58, 16.51, 17.42, 18.33].forEach((z) => toilet(29.0, z, FACE.e))
  stalls(33.3, 31.65, [15.1, 16.05, 16.97, 17.88])
  ;[15.6, 16.5, 17.4].forEach((z) => toilet(32.85, z, FACE.w))
  stalls(33.3, 34.8, [16.05, 16.97, 17.88])
  ;[16.5, 17.4].forEach((z) => toilet(33.8, z, FACE.e))
  basins(31.75, 17.95, 33.25, 18.55, [
    [32.2, 18.25],
    [32.95, 18.25],
  ])
  basins(33.35, 17.95, 34.15, 18.55, [[33.75, 18.25]])
  ;[14.2, 14.85, 15.5].forEach((z) => urinal(35.0, z, FACE.e))
  ;[14.2, 14.85, 15.5].forEach((z) => urinal(37.0, z, FACE.w))
  basins(36.6, 16.35, 37.1, 17.9, [
    [36.85, 16.74],
    [36.85, 17.5],
  ])
  // the accessible toilet by A2's lobby: the toilet and basin along its south wall
  toilet(33.45, 27.85, FACE.n)
  basins(34.45, 27.7, 35.05, 28.1, [[34.75, 27.9]])

  // stairs, their outer edges against the stairwells' walls (the walls' inner faces)
  /**
   * A service-core stair between floors (4m), treads running east–west in two rows: the first
   * flight climbs west along the south row (the one the plan's break line crosses) from the floor
   * at the east end to a half-landing, the second climbs back east along the north row.
   * x0–x1: the treads' extent; west: the landing's far edge; north / south: each row's z range;
   * spine: the x range of the wall between the two rows.
   */
  function switchback({
    x0,
    x1,
    west,
    north,
    south,
    n,
    spine,
  }: {
    x0: number
    x1: number
    west: number
    north: [number, number]
    south: [number, number]
    n: number
    spine: [number, number]
  }) {
    // the wall between the flights, full height
    mesh(
      B(spine[1] - spine[0], H, south[0] - north[1]),
      M.wall,
      wallsG,
      (spine[0] + spine[1]) / 2,
      H / 2,
      (north[1] + south[0]) / 2,
    )
    const tread = (x1 - x0) / n
    const rise = H / (2 * (n + 1))
    const step = (x: number, [z1, z2]: [number, number], top: number) =>
      mesh(B(tread, top, z2 - z1), M.step, arch, x, top / 2, (z1 + z2) / 2, { e: EF })
    for (let i = 0; i < n; i++) {
      step(x1 - tread * (i + 0.5), south, rise * (i + 1))
      step(x0 + tread * (i + 0.5), north, rise * (n + 2 + i))
    }
    // half-landing across both rows
    const top = rise * (n + 1)
    mesh(
      B(x0 - west, top, south[1] - north[0]),
      M.step,
      arch,
      (west + x0) / 2,
      top / 2,
      (north[0] + south[1]) / 2,
      {
        e: EF,
      },
    )
  }
  switchback({
    x0: 30,
    x1: 33,
    west: 28.475,
    north: [2.525, 4.29],
    south: [4.48, 5.875],
    n: 9,
    spine: [30.2, 33],
  })
  switchback({
    x0: 30.45,
    x1: 32.6,
    west: 28.475,
    north: [19.725, 21.5],
    south: [21.68, 23.075],
    n: 8,
    spine: [29.9, 32.6],
  })
  // 景觀梯, as 空間圖 shows it on 2F: in the stairwell, the south row is the short flight
  // arriving from below (climbing east onto 2F at x 7.9), the north row the one leaving upward
  // (from 2F at x 9.1, climbing west). Each turns on a landing at the west (x 1.8, where the
  // plan draws the stair's outline), half a storey below 2F and half above. Open steel treads
  // on a dark stringer each side, glass balustrades topped with a handrail all round.
  {
    const NORTH: [number, number] = [1.26, 2.85]
    const SOUTH: [number, number] = [3.38, 4.93]
    const LANDING = 1.8
    /** A plate in the plane z = `z`, running from (xa, ya) to (xb, yb) between lo and hi above that line */
    const slant = (
      xa: number,
      ya: number,
      xb: number,
      yb: number,
      z: number,
      [lo, hi]: [number, number],
      t: number,
      m: THREE.Material,
    ) => {
      const o = prism(
        [
          [xa, -(ya + lo)],
          [xb, -(yb + lo)],
          [xb, -(yb + hi)],
          [xa, -(ya + hi)],
        ],
        t,
        m,
        arch,
        0,
        m === M.glass ? null : EF,
      )
      // prism() lays its outline flat; stand it up in the x–y plane at z
      o.rotation.x = 0
      o.position.z = z - t / 2
      o.castShadow = m !== M.glass
    }
    /** Frameless glass with a handrail along its top, level at height y */
    const rail = (x1: number, z1: number, x2: number, z2: number, y: number) => {
      seg(x1, z1, x2, z2, 0.03, 1, M.glass, arch, y)
      seg(x1, z1, x2, z2, 0.06, 0.05, M.dark, arch, y + 1)
    }
    /** A flight rising H/2 from `from` along a row, its foot at the east (dir -1) or west (1) */
    const flight = (
      x0: number,
      x1: number,
      [z1, z2]: [number, number],
      n: number,
      from: number,
      dir: 1 | -1,
    ) => {
      const tread = (x1 - x0) / n
      const rise = H / 2 / n
      for (let i = 0; i < n; i++) {
        const top = from + rise * (i + 1)
        const x = dir > 0 ? x0 + tread * (i + 0.5) : x1 - tread * (i + 0.5)
        mesh(B(tread + 0.02, 0.05, z2 - z1 - 0.1), M.dark, arch, x, top - 0.025, (z1 + z2) / 2, {
          e: EF,
        })
      }
      // the line through the treads' tops, from the foot's end of the flight to the head's
      const [xa, xb] = dir > 0 ? [x0, x1] : [x1, x0]
      const [ya, yb] = [from + rise / 2, from + H / 2 + rise / 2]
      for (const z of [z1, z2]) {
        slant(xa, ya, xb, yb, z + (z === z1 ? 0.03 : -0.03), [-0.32, 0.06], 0.06, M.dark)
        slant(xa, ya, xb, yb, z, [0.06, 1], 0.03, M.glass)
        slant(xa, ya, xb, yb, z, [1, 1.05], 0.06, M.dark)
      }
    }
    flight(3.75, 7.9, SOUTH, 14, -H / 2, 1)
    flight(3.8, 9.1, NORTH, 17, 0, -1)
    // the landings: below 2F the arriving flight's, above it the rising one's
    for (const [y, east] of [
      [-H / 2, 3.75],
      [H / 2, 3.8],
    ] as const) {
      const [z1, z2] = [NORTH[0], SOUTH[1]]
      mesh(
        B(east - LANDING, 0.2, z2 - z1),
        M.dark,
        arch,
        (LANDING + east) / 2,
        y - 0.1,
        (z1 + z2) / 2,
        {
          e: EF,
        },
      )
      rail(LANDING, z1, LANDING, z2, y)
      rail(LANDING, z1, east, z1, y)
      rail(LANDING, z2, east, z2, y)
    }
  }

  /** n steps across x1–x2 from z1 to z2, each `rise` higher going south, starting from `base` */
  function tiers(
    x1: number,
    x2: number,
    z1: number,
    z2: number,
    n: number,
    rise: number,
    base = 0,
  ) {
    const d = (z2 - z1) / n
    for (let i = 0; i < n; i++) {
      const hh = base + rise * (i + 1)
      walk.push(
        mesh(B(x2 - x1, hh, d), M.step, arch, (x1 + x2) / 2, hh / 2, z1 + d * (i + 0.5), {
          e: EF,
          cast: false,
        }),
      )
    }
  }
  // 流光中庭 → A2 國際會議廳's raised back: the floor keeps climbing south. A first flight rises
  // from the atrium to a platform, a second from there to the level of A2's top seating row,
  // where A2's rear doors open.
  const A2_BACK = (A2_ROWS - 1) * A2_RISE // A2's highest tier
  const MID = 0.8
  tiers(12.2, 22.1, 20.6, 23.1, 4, MID / 4)
  walk.push(
    prism(
      [
        [10.1, 23.2],
        [23.4, 23.2],
        [23.4, 25.98],
        [9.98, 25.98],
        [10.1, 25.8],
      ],
      MID,
      M.floor,
      arch,
    ),
  )
  // the second flight: each step runs west to the slanting wall
  const slantX = (z: number) => 10.1 + ((z - 25.8) * (8.6 - 10.1)) / (27.9 - 25.8)
  {
    const d = (27.4 - 25.98) / 3
    for (let i = 0; i < 3; i++) {
      const z1 = 25.98 + d * i
      const x1 = slantX(z1)
      const hh = MID + ((A2_BACK - MID) / 3) * (i + 1)
      walk.push(
        mesh(B(19.2 - x1, hh, d), M.step, arch, (x1 + 19.2) / 2, hh / 2, z1 + d / 2, {
          e: EF,
          cast: false,
        }),
      )
    }
  }
  // inside A2, everything behind the back row (and the small room off it) sits at that row's
  // level; its east edge steps with the rake's sections so it meets the seating exactly
  const backEdge: Pt[] = []
  for (let i = A2_CUTS.length - 1; i >= 0; i--) {
    const [p, q] = A2_CUTS[i]!
    const x = a2BackEdge((p + q) / 2)
    // the outer sections run on to the hall's north and south walls
    backEdge.push([x, i === A2_CUTS.length - 1 ? 45.6 : q], [x, i === 0 ? 29.75 : p])
  }
  walk.push(prism([[8.6, 29.75], [8.6, 45.6], ...backEdge], A2_BACK, M.rake, arch))
  walk.push(
    prism(
      [
        [slantX(27.4), 27.4],
        [19.4, 27.4],
        [19.4, 29.75],
        [8.6, 29.75],
        [8.6, 27.9],
      ],
      A2_BACK,
      M.floor,
      arch,
    ),
  )

  // A2: stage on the east, seats face east, rake rises to the west. The stage's curved front
  // leaves a notch at each end for a short flight up onto it.
  const STAGE_H = 0.9
  walk.push(
    prism(
      [
        [32.4, 30.5],
        [34.2, 30.5],
        [34.2, 31.8],
        [35.3, 32.8],
        [35.3, 42.4],
        [34.2, 43.4],
        [34.2, 44.7],
        [32.4, 44.7],
        [32.4, 42.95],
        [31.1, 42.95],
        [30.8, 41.5],
        [30.4, 39.5],
        [30.4, 35.5],
        [30.8, 33.8],
        [31.1, 32.4],
        [32.4, 32.4],
      ],
      STAGE_H,
      M.stage,
      arch,
      0,
      EA,
    ),
  )
  // the flights: from the floor at the stage's north and south ends, climbing toward its middle
  for (const [z0, dir] of [
    [31.5, 1],
    [43.8, -1],
  ] as const)
    for (let i = 0; i < 3; i++) {
      const hh = (STAGE_H / 4) * (i + 1)
      walk.push(
        mesh(B(1.3, hh, 0.3), M.step, arch, 31.75, hh / 2, z0 + dir * (0.15 + i * 0.3), {
          e: EF,
          cast: false,
        }),
      )
    }
  mesh(B(0.1, 3.4, 10), M.screen, arch, 34.1, 3, 37.6, { e: EA })

  const seats = buildA2Seating(arch, walk)
  const fixedSeats = seats.length

  ZONES.forEach(([c, p]) => {
    const o = prism(p, 0.01, mat(c, { name: 'zone' }), zonesG, 0.002, null)
    o.castShadow = false
    o.raycast = noRay
  })
  setZones(zonesG, false)
  wallsG.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.raycast = noRay
  })

  return { arch, wallsG, zonesG, walk, fixedSeats, seats, ground }
}

/** Curved, raked fixed seating in A2. Returns the seat count. */
function buildA2Seating(arch: THREE.Group, walk: THREE.Mesh[]): FixedSeat[] {
  const K = A2_BOW
  const ZC = A2_ZC
  const blocks: Pt[] = [
    [30.7, 33.6],
    [35, 40.2],
    [41.6, 44.6],
  ]
  const cuts = A2_CUTS
  const slots: { x: number; z: number; h: number; r: number }[] = []
  for (let i = 0; i < A2_ROWS; i++) {
    const xr = A2_X0 - i * A2_ROW
    const hh = i * A2_RISE
    if (hh > 0)
      cuts.forEach(([p, q]) => {
        const zc = (p + q) / 2
        walk.push(
          mesh(B(A2_ROW, hh, q - p), M.rake, arch, xr + K * (zc - ZC) ** 2 - 0.05, hh / 2, zc, {
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
  // seats face east (the stage), bowed by r; hips sit just behind the cushion's centre
  return slots.map((s) => ({
    x: s.x - 0.04 * Math.cos(s.r),
    y: s.h + 0.49,
    z: s.z + 0.04 * Math.sin(s.r),
    turn: Math.PI / 2 + s.r,
  }))
}
