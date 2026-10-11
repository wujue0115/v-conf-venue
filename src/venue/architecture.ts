import * as THREE from 'three'
import { B, Cy, EA, EF, M, edges, mat, mesh, noRay } from './materials'
import { buildOuterEdges } from './outlines'

// Plan meters from 平面尺寸圖 (cm grid 900/250/565/580/580/565/245 · 615/895/810/655 · A2 780/390/397.5)
// origin = 景觀梯 NW corner, +x east, +z south

export const CENTER = new THREE.Vector3(19, 0, 17.5)
const H = 4
/** A2's raked seating: rows, and how much each row steps up toward the back (west) */
const A2_ROWS = 14
const A2_RISE = 0.16
/** A2's highest tier: the floor behind the back row, its control room and rear lobby */
const A2_BACK = (A2_ROWS - 1) * A2_RISE
/** A2's stage, and the backstage and 翻譯室 behind and beside it, above the hall's floor */
export const STAGE_H = 0.7
/** A2's walls: the hall stands about two storeys high */
const A2_H = 8
/** Row positions: the first (lowest) row's x, each row's depth, and how the rows bow east toward their ends */
const A2_X0 = 25.9
const A2_ROW = 1.105
const A2_BOW = 0.02
const A2_ZC = 37.6
/** The rake's tiers run on one curve from wall to wall, their ends within the side walls */
const A2_TIER_Z: [number, number] = [29.75, 45.5]
/** Where along z each tier's curved edges are drawn through */
const A2_TIER_STEPS = (() => {
  const [a, b] = A2_TIER_Z
  const n = 64
  return Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n)
})()
/** The front (east) edge of row i's tier at z: the rows bow east toward their ends */
const a2TierEdge = (i: number, z: number) =>
  A2_X0 - i * A2_ROW + A2_ROW / 2 + A2_BOW * (z - A2_ZC) ** 2 - 0.05
/** West edge of the back (highest) row's tier at z */
const a2BackEdge = (z: number) => a2TierEdge(A2_ROWS, z)

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
  /** Put down the cushions of these A2 seats (indices into `seats`), the rest folded up */
  openSeats: (open: ReadonlySet<number>) => void
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
  // between them opening to A215 on the west and ending in a window on the east (glass, below),
  // with A210 (電氣機房) north and A216 (弱電機房) south of its east end, their doors beside the lifts
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
  [35.8, 9.1, 37.4, 9.1],
  [35.8, 12.2, 37.2, 12.2],
  // the restrooms; A216 (34.8–37.2, 12.2–13.8) has a service door into the men's
  [28.35, 15.1, 34.8, 15.1],
  [34.8, 13.8, 37.2, 13.8],
  // restrooms | south stairwell. The way in is from the south, off the corridor running north
  // along the east glass past the stairwell, to a wall (♀|♂, its janitor's closet behind
  // it): the women's west along the basins, the men's north past the closet's east side.
  [28.35, 19.6, 37.2, 19.6],
  [33.3, 15.1, 33.3, 17.9],
  [33.3, 17.9, 36.15, 17.9],
  [34, 17.9, 34, 18.8],
  [34, 18.8, 36.15, 18.8],
  [36.15, 17.9, 36.15, 18.8],
  // the south stairwell's wall on to the corridor, the stair's door in it, and 茶水間 a niche
  // set back into the stairwell beside the door (the corridor keeps its full width)
  [28.35, 23.2, 28.8, 23.2],
  [28.8, 23.2, 28.8, 22.6],
  [28.8, 22.6, 32.6, 22.6],
  [32.6, 22.6, 32.6, 23.2],
  [32.6, 23.2, 35, 23.2],
  [35, 19.6, 35, 23.2],
  // east exterior
  [36.9, 0.3, 36.9, 5.8],
  [36.9, 5.8, 37.4, 5.8],
  [37.4, 5.8, 37.4, 9.1],
  [37.2, 12.2, 37.2, 19.6],
  [36.9, 23.2, 36.9, 29.75],
  // south band
  // on the way on to A2's back: a window (see glass) then a slanting wall beside the second
  // flight of steps; outside the window there is nothing
  [10.7, 23.2, 10.1, 23.2],
  [10.1, 26.2, 8.6, 28.3],
  [8.6, 28.3, 8.6, 29.75],
  // A223 VIP lounge, and the store beside it (door on its east)
  [19.4, 26.3, 23.35, 26.3],
  [19.4, 26.3, 19.4, 29.75],
  // A223's and A224's east wall, one flat wall; A224 a narrow store beside the platform, its
  // corner come forward to the top of the stair up from A215, where the stair's glass rail ends
  [23.35, 23.2, 23.35, 29.75],
  [22.45, 23.2, 22.45, 26.3],
  [22.45, 23.2, 23.35, 23.2],
  // A2's north lobby rooms: the entrance, the accessible toilet room, a service room
  // the entrance's double doors from the landing, 1.7 wide (the walls' ends padded by half
  // their thickness)
  [28.4, 25.3, 28.4, 26.205],
  [28.4, 28.165, 28.4, 29.75],
  [28.4, 25.3, 36.9, 25.3],
  [31.6, 25.3, 31.6, 29.75],
  [35.2, 25.3, 35.2, 28.9],
  [33.05, 25.98, 35.2, 25.98],
  [33.05, 25.98, 33.05, 28.2],
  [33.05, 28.2, 35.2, 28.2],
  // A2 國際會議廳
  [8.6, 29.75, 9.3, 29.75],
  [11, 29.75, 29.215, 29.75],
  [31.145, 29.75, 35.4, 29.75],
  [36.4, 29.75, 37.3, 29.75],
  // the entrance lobby at A2's north-west corner, with double doors south into the hall
  [8.6, 33.3, 11, 33.3],
  [8.6, 29.75, 8.6, 45.6],
  // its south wall, built below, bent where it slants out past 翻譯室
  [37.8, 47.9, 37.8, 36.2],
  [37.8, 36.2, 37.3, 36.2],
  [37.3, 36.2, 37.3, 29.75],
  // 控制室 in the south-west corner, its door at the west end of its north wall
  [8.6, 41.6, 11.2, 41.6],
  // 翻譯室: its front on to the hall built with A2's side walls, below; a door from the
  // backstage
  [34.2, 44.865, 36.2, 44.865],
  [29.63, 44.94, 29.63, 46.75],
  [36.2, 44.865, 36.2, 47.775],
]

/** A2's south wall, west to east: straight, then slanting out past 翻譯室 */
const SOUTH_WALL: Pt[] = [
  [8.6, 45.6],
  [26, 45.6],
  [32.9, 47.9],
  [37.8, 47.9],
]

/** A2's own walls, as tall as the hall (A2_H); the rest stand H */
const A2_WALLS = new Set<Seg>(
  WALLS.filter(([x1, z1, x2, z2]) => {
    const [x, z] = [(x1 + x2) / 2, (z1 + z2) / 2]
    // the hall's outline, the proscenium and stage, the back's lobby and 控制室, the backstage
    // and 翻譯室
    return z >= 29.7 && x >= 8.5
  }),
)

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
  // stairwells: north core by the lifts, south core (on to the corridor past the pantry)
  [33.5, 2.4, 34.4, 2.4],
  [32.75, 23.2, 33.6, 23.2],
  // A216's service door into the restrooms; the restrooms' way in from the corridor to the
  // south, and the janitor's closet's door
  [35.6, 13.8, 36.2, 13.8],
  [35.15, 19.6, 36.75, 19.6],
  [36.15, 18, 36.15, 18.7],
  // south band: store, VIP lounge, terrace, the accessible toilet room and its toilet
  [23.35, 24.2, 23.35, 25.1],
  [23.35, 26.3, 23.35, 27.2],
  [36.9, 23.85, 36.9, 24.7],
  [31.8, 25.3, 32.75, 25.3],
  [33.05, 26.2, 33.05, 27.1],
  // A2: the entrance lobby's double doors into the hall, 控制室's door, 翻譯室's door
  [9.3, 33.3, 10.7, 33.3],
  [9.3, 41.6, 10.1, 41.6],
  [35.3, 44.865, 36.1, 44.865],
]

/** Restroom fittings */
const PORCELAIN = mat('#fbfbf9', { roughness: 0.25, name: 'porcelain' })
const COUNTER = mat('#d9d4ca', { roughness: 0.5, name: 'counter' })
/** Lift doors */
const LIFT_DOOR = mat('#f0ebdf', { roughness: 0.5, name: 'lift_door' })
/** A2's stage curtains, and the white stand below the stage */
const CURTAIN = mat('#6e2a2c', { name: 'curtain' })
const PODIUM = mat('#f3f1ec', { roughness: 0.5, name: 'podium' })
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

// zone tints (官網配置圖), each on the floor it colours (on the hall's unless given)
const ZONES: [string, Pt[], number?][] = [
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
      [22.2, 21.1],
      [11.1, 21.1],
      [11.1, 15.4],
      [23.5, 15.4],
      [23.5, 5],
      [11.1, 5],
    ],
  ],
  [
    '#f3d9a8',
    [
      [19.5, 26.4],
      [23.5, 26.4],
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
      [37.2, 36.3],
      [37.7, 36.3],
      [37.7, 44.95],
      [34.3, 44.95],
      [34.3, 43.45],
      [35.4, 42.45],
      [35.4, 32.75],
      [34.3, 31.75],
    ],
    STAGE_H,
  ],
  [
    '#e6d2f3',
    [
      [8.75, 41.7],
      [11.2, 41.7],
      [11.5, 45.4],
      [8.75, 45.4],
    ],
    A2_BACK,
  ],
  [
    '#d3efc4',
    [
      [29.8, 45.2],
      [36.1, 45.2],
      [36.1, 47.8],
      [32.9, 47.8],
      [29.8, 46.75],
    ],
    STAGE_H,
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
        [8.6, 28.3],
        [10.1, 26.2],
      ],
      0.3,
      M.floor,
      arch,
      -0.3,
    ),
  )
  slab(8.6, 29.75, 37.8, 45.6) // A2
  // 翻譯室 and the rooms beside it, out to the outer walls' faces (the west one slanting)
  walk.push(
    prism(
      [
        [26, 45.6],
        [37.925, 45.6],
        [37.925, 48.025],
        [32.885, 48.025],
        [25.96, 45.719],
      ],
      0.3,
      M.service,
      arch,
      -0.3,
    ),
  )

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

  /**
   * A board along x1,z1 → x2,z2, `t` thick, from y0 up to y1: `off` from that line, on the side
   * facing `to`
   */
  function board(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    to: Pt,
    off: number,
    t: number,
    y0: number,
    y1: number,
    m: THREE.Material,
  ) {
    const L = Math.hypot(x2 - x1, z2 - z1)
    let [nx, nz] = [-(z2 - z1) / L, (x2 - x1) / L]
    if ((to[0] - (x1 + x2) / 2) * nx + (to[1] - (z1 + z2) / 2) * nz < 0) [nx, nz] = [-nx, -nz]
    const o = mesh(
      B(L, y1 - y0, t),
      m,
      wallsG,
      (x1 + x2) / 2 + nx * off,
      (y0 + y1) / 2,
      (z1 + z2) / 2 + nz * off,
      { e: null },
    )
    o.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
    return o
  }

  // walls, opened up where a door stands in them, with a lintel over each doorway (added once
  // the floors are in, below: a doorway is DOOR_H tall from the floor it's on)
  const lintels: [Pt, Pt, number][] = []
  for (const w of WALLS) {
    const [x1, z1, x2, z2] = w
    const top = A2_WALLS.has(w) ? A2_H : H
    const wall = (a: number, b: number, c: number, d: number) =>
      seg(a, b, c, d, WALL_T, top, M.wall, wallsG)
    const L = Math.hypot(x2 - x1, z2 - z1)
    const at = (t: number): Pt => [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]
    // seg() pads each piece by half the wall's thickness at both ends; pull pieces back from doorways
    const pad = WALL_T / 2 / L
    let from = 0
    for (const [a, b, lintel] of doorGaps(w)) {
      if (a - pad > from) wall(...at(from), ...at(a - pad))
      if (lintel) lintels.push([at(a + pad), at(b - pad), top])
      from = b + pad
    }
    if (from < 1) wall(...at(from), ...at(1))
  }

  // A215's west side: a low glass rail along the lower ground south of 景觀梯's landing, then
  // a curtain wall; on the way on to A2's back, a window beside the second flight of steps
  glass(11.1, 9.4, 11.1, 15.1, 1.1, arch)
  glass(10.7, 15.2, 10.7, 23.2)
  glass(10.1, 23.2, 10.1, 26.2)
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
  // the lift lobby's window at its east end, and the glass along the restrooms' corridor
  glass(35.9, 9.1, 35.9, 12.2)
  glass(36.9, 19.6, 36.9, 23.2)
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
      [17.15, 0],
      [28.75, 0],
      [11.5, 0],
      [22.95, 0],
      [34.4, 0],
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
  basins(31.75, 18.03, 34, 18.6, [
    [32.1, 18.32],
    [32.85, 18.32],
    [33.6, 18.32],
  ])
  ;[14.2, 14.85, 15.5].forEach((z) => urinal(35.0, z, FACE.e))
  ;[14.2, 14.85, 15.5].forEach((z) => urinal(37.0, z, FACE.w))
  basins(36.6, 16.35, 37.1, 17.9, [
    [36.85, 16.74],
    [36.85, 17.5],
  ])
  // the accessible toilet by A2's lobby: the toilet and basin along its south wall
  toilet(33.45, 27.85, FACE.n)
  basins(34.45, 27.7, 35.05, 28.1, [[34.75, 27.9]])
  // 茶水間, the niche off the corridor: a sink counter, a water heater on its west end, and
  // the water dispenser at its east end
  {
    const w1 = 28.8 + WALL_T / 2
    const back = 22.6 + WALL_T / 2
    const x2 = 31.95
    mesh(B(x2 - w1, 0.8, 0.6), COUNTER, arch, (w1 + x2) / 2, 0.4, back + 0.3, { e: EF })
    basins(w1, back, x2, back + 0.6, [[29.9, back + 0.3]])
    mesh(B(0.4, 1.3, 0.45), M.steel, arch, 32.25, 0.65, back + 0.25, { e: EF })
    mesh(B(0.32, 0.5, 0.32), PODIUM, arch, w1 + 0.25, 1.11, back + 0.22, { e: EF })
  }

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
    // two equal rows across the stairwell
    north: [2.525, 4.105],
    south: [4.295, 5.875],
    n: 9,
    spine: [30.2, 33],
  })
  switchback({
    x0: 30.45,
    x1: 32.6,
    west: 28.475,
    // two equal rows across the stairwell, 茶水間's niche taking its south side
    north: [19.725, 21.01],
    south: [21.19, 22.475],
    n: 8,
    spine: [29.9, 32.6],
  })
  // 景觀梯, as 空間圖 shows it on 2F: in the stairwell, the south row is the short flight
  // arriving from below (climbing east onto 2F at x 7.9), the north row the one leaving upward
  // (from 2F at x 9.1, climbing west). Each turns on a landing at the west (x 1.8, where the
  // plan draws the stair's outline), half a storey below 2F and half above. Solid stone steps
  // on a grey-clad flight, glass balustrades topped with a handrail all round.
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
        // each step solid down to the flight's soffit
        mesh(
          B(tread, rise + 0.3, z2 - z1),
          M.step,
          arch,
          x,
          top - (rise + 0.3) / 2,
          (z1 + z2) / 2,
          {
            e: EF,
          },
        )
      }
      // the line through the treads' tops, from the foot's end of the flight to the head's
      const [xa, xb] = dir > 0 ? [x0, x1] : [x1, x0]
      const [ya, yb] = [from + rise / 2, from + H / 2 + rise / 2]
      for (const z of [z1, z2]) {
        slant(xa, ya, xb, yb, z + (z === z1 ? 0.03 : -0.03), [-0.4, 0.06], 0.06, M.steel)
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
        M.step,
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
    m: THREE.Material = M.step,
  ) {
    const d = (z2 - z1) / n
    for (let i = 0; i < n; i++) {
      const hh = base + rise * (i + 1)
      walk.push(
        mesh(B(x2 - x1, hh, d), m, arch, (x1 + x2) / 2, hh / 2, z1 + d * (i + 0.5), {
          e: EF,
          cast: false,
        }),
      )
    }
  }
  // 流光中庭 → A2 國際會議廳's raised back: the floor keeps climbing south. A first flight rises
  // from the atrium to a wide platform, a second from there to the level of A2's top seating
  // row, where A2's rear doors open. Each flight is timber bleacher seating, its big tiers two
  // steps high, with ordinary steps (about 15 cm) to walk up at either end: four tiers to the
  // platform, three more to the landing. The platform stops at A224's wall, the store (and A223
  // beside it) on the corridor's level.
  const MID = 1.2
  /** Where the second flight reaches the landing in front of A2's rear lobby */
  const LANDING = 27.8
  /** The slanting wall beside the second flight: x along it at z, then the hall's west wall */
  const slantX = (z: number) => Math.max(8.6, 10.1 + ((z - 26.2) * (8.6 - 10.1)) / (28.3 - 26.2))
  /**
   * A flight of bleachers from z1 up to z2 (rising south) by `rise`, from `base`, over `n`
   * tiers: between x west(z) and x2, two steps a tier in the lanes people walk up, one big
   * step elsewhere
   */
  function bleachers(
    west: (z: number) => number,
    x2: number,
    [z1, z2]: [number, number],
    base: number,
    rise: number,
    n: number,
    lanes: (z: number) => [number, number][],
  ) {
    const D = (z2 - z1) / n
    const box = (a: number, b: number, za: number, zb: number, hh: number) =>
      walk.push(
        mesh(B(b - a, hh, zb - za), M.step, arch, (a + b) / 2, hh / 2, (za + zb) / 2, {
          e: EF,
          cast: false,
        }),
      )
    for (let t = 0; t < n; t++) {
      const za = z1 + D * t
      const x1 = west(za)
      const ls = lanes(za)
      // the big tier between the lanes
      let from = x1
      for (const [a, b] of ls) {
        if (a > from) box(from, a, za, za + D, base + (rise * (t + 1)) / n)
        from = Math.max(from, b)
      }
      if (x2 > from) box(from, x2, za, za + D, base + (rise * (t + 1)) / n)
      // the lanes' two steps
      for (const [a, b] of ls) {
        box(a, b, za, za + D / 2, base + (rise * (2 * t + 1)) / (2 * n))
        box(a, b, za + D / 2, za + D, base + (rise * (t + 1)) / n)
      }
    }
  }
  /** A glass balustrade at x, its foot along z from (za, ya) to (zb, yb), a handrail on top */
  function sideRail(x: number, za: number, ya: number, zb: number, yb: number) {
    for (const [lo, hi, m, t] of [
      [0, 0.9, M.glass, 0.03],
      [0.9, 0.95, M.dark, 0.05],
    ] as const) {
      const sh = new THREE.Shape([
        new THREE.Vector2(za, ya + lo),
        new THREE.Vector2(zb, yb + lo),
        new THREE.Vector2(zb, yb + hi),
        new THREE.Vector2(za, ya + hi),
      ])
      const o = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), m)
      // the shape's x runs along z, its extrusion toward -x
      o.rotation.y = -Math.PI / 2
      o.position.x = x + t / 2
      o.raycast = noRay
      arch.add(o)
    }
  }
  // the first flight, from the atrium's floor, its lanes at either end railed on their outer side
  bleachers(
    () => 12.2,
    22.45,
    [21.1, 23.2],
    0,
    MID,
    4,
    () => [
      [12.2, 13.7],
      [20.7, 22.45],
    ],
  )
  sideRail(12.25, 21.1, 0, 23.2, MID)
  sideRail(22.4, 21.1, 0, 23.2, MID)
  walk.push(
    prism(
      [
        [10.1, 23.2],
        [22.45, 23.2],
        [22.45, 26.3],
        [slantX(26.3), 26.3],
        [10.1, 26.2],
      ],
      MID,
      M.floor,
      arch,
    ),
  )
  // the second flight, from the platform, running west to the slanting wall; its lanes along
  // the wall and along A223's
  bleachers(slantX, 19.4, [26.3, LANDING], MID, A2_BACK - MID, 3, (z) => [
    [slantX(z), 12.2],
    [17.65, 19.4],
  ])
  // inside A2, everything behind the back row (and the small room off it) sits at that row's
  // level; its east edge follows the back row's curve so it meets the seating exactly
  const backEdge = A2_TIER_STEPS.map((z): Pt => [a2BackEdge(z), z]).reverse()
  walk.push(prism([[8.6, A2_TIER_Z[0]], [8.6, A2_TIER_Z[1]], ...backEdge], A2_BACK, M.rake, arch))
  // and the rows' tiers in front of it, each one curved step from wall to wall
  for (let i = 1; i < A2_ROWS; i++) {
    const front = A2_TIER_STEPS.map((z): Pt => [a2TierEdge(i, z), z])
    const back = A2_TIER_STEPS.map((z): Pt => [a2TierEdge(i + 1, z), z]).reverse()
    const tier = prism([...front, ...back], i * A2_RISE, M.rake, arch, 0, EF)
    tier.castShadow = false
    walk.push(tier)
  }
  walk.push(
    prism(
      [
        [slantX(LANDING), LANDING],
        [19.4, LANDING],
        [19.4, 29.75],
        [8.6, 29.75],
        [8.6, 28.3],
      ],
      A2_BACK,
      M.floor,
      arch,
    ),
  )

  // A2: stage on the east, seats face east, rake rises to the west. The stage's curved front
  // leaves a notch at each end for a short flight up onto it.
  walk.push(
    prism(
      [
        [32.24, 30.53],
        [34.07, 30.53],
        [34.07, 32.3],
        [35.37, 32.8],
        [35.37, 42.4],
        [34.07, 42.9],
        [34.07, 44.69],
        [32.24, 44.69],
        [32.24, 42.87],
        [30.82, 42.87],
        [30.55, 42.4],
        [30.38, 41.83],
        [30.38, 33.37],
        [30.55, 32.85],
        [30.82, 32.36],
        [32.24, 32.36],
      ],
      STAGE_H,
      M.stage,
      arch,
      0,
      EA,
    ),
  )
  // the flights: from the floor at the stage's north and south ends, climbing toward its middle
  // behind the stage's front, which runs on past them at full height, angled as at its corners,
  // so from the hall they're hidden and they're come to from the ends
  const CHEEK = 0.12
  /** The front's line beside a flight: from its open end (z0) to the stage's notch (z1) */
  const cheekX = (z: number, z0: number, z1: number) => 30.82 + (0.5 * (z - z1)) / (z0 - z1)
  for (const [z0, z1] of [
    [31.46, 32.36],
    [43.77, 42.87],
  ] as const) {
    const dir = Math.sign(z1 - z0)
    for (let i = 0; i < 3; i++) {
      const hh = (STAGE_H / 4) * (i + 1)
      const [za, zb] = [z0 + dir * 0.3 * i, z0 + dir * 0.3 * (i + 1)]
      walk.push(
        prism(
          [
            [cheekX(za, z0, z1) + CHEEK, za],
            [32.24, za],
            [32.24, zb],
            [cheekX(zb, z0, z1) + CHEEK, zb],
          ],
          hh,
          M.step,
          arch,
          0,
          EF,
        ),
      )
    }
    walk.push(
      prism(
        [
          [cheekX(z0, z0, z1), z0],
          [cheekX(z0, z0, z1) + CHEEK, z0],
          [30.82 + CHEEK, z1],
          [30.82, z1],
        ],
        STAGE_H,
        M.stage,
        arch,
        0,
        EA,
      ),
    )
  }
  // the front, past the flights and round the stage: a rail along its top and slats below,
  // each standing just proud of it
  {
    const front: Pt[] = [
      [cheekX(31.46, 31.46, 32.36), 31.46],
      [30.82, 32.36],
      [30.55, 32.85],
      [30.38, 33.37],
      [30.38, 41.83],
      [30.55, 42.4],
      [30.82, 42.87],
      [cheekX(43.77, 43.77, 42.87), 43.77],
    ]
    const PROUD = 0.025
    const bands: [y: number, h: number][] = [[STAGE_H - 0.04, 0.08]]
    for (let k = 0; k < 6; k++) bands.push([0.08 + 0.09 * k, 0.045])
    for (let i = 0; i + 1 < front.length; i++) {
      const [x1, z1] = front[i]!
      const [x2, z2] = front[i + 1]!
      const L = Math.hypot(x2 - x1, z2 - z1)
      // out from the front, toward the hall
      const [nx, nz] = [-(z2 - z1) / L, (x2 - x1) / L]
      for (const [y, h] of bands) {
        const b = mesh(
          B(L + PROUD, h, PROUD * 2),
          M.stage,
          arch,
          (x1 + x2) / 2 + nx * (PROUD / 2),
          y,
          (z1 + z2) / 2 + nz * (PROUD / 2),
          { e: EF, cast: false },
        )
        b.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
      }
    }
  }
  // the screen (about 6.2 × 3.5, 16:9), its foot 1.1 above the stage, just off the back wall
  mesh(B(0.1, 3.5, 6.2), M.screen, arch, 35.27, STAGE_H + 1.1 + 1.75, 37.6, { e: EA })
  // on each proscenium wall's face, a speaker hung level with the screen's top, and a camera
  // below it
  for (const z of [31.1, 44.1]) {
    mesh(B(0.5, 1.6, 0.55), M.dark, arch, 33.82, STAGE_H + 4.5, z, { e: EF })
    mesh(B(0.2, 0.2, 0.2), M.dark, arch, 33.97, STAGE_H + 3.1, z, { e: null })
  }
  // the backstage behind the stage, and 翻譯室 off it, are on the stage's level: the back door
  // (north-east, off the closed corridor) is up four steps
  walk.push(
    prism(
      [
        [34.1, 29.75],
        [37.3, 29.75],
        [37.3, 36.2],
        [37.8, 36.2],
        [37.8, 44.865],
        [34.07, 44.865],
        [34.07, 42.9],
        [35.37, 42.4],
        [35.37, 32.8],
        [34.07, 32.3],
      ],
      STAGE_H,
      M.service,
      arch,
    ),
  )
  walk.push(
    prism(
      [
        [29.63, 44.815],
        [36.2, 44.815],
        [36.2, 47.9],
        [32.9, 47.9],
        [29.63, 46.81],
      ],
      STAGE_H,
      M.service,
      arch,
    ),
  )
  tiers(35.2, 36.9, 28.1, 29.75, 4, STAGE_H / 4)
  // the side curtains, half drawn across the ways through to the backstage between each
  // proscenium wall and the back wall's turned end
  for (const z of [32.33, 42.87]) seg(34.75, z, 35.25, z, 0.12, STAGE_H + 5.5, CURTAIN, wallsG)

  // the venue's own furniture: its wooden lectern on the stage's south side and a white stand
  // on the floor below, facing the hall
  mesh(B(0.6, 1.1, 0.8), M.wood, arch, 31.35, STAGE_H + 0.55, 41.25, { e: EF })
  mesh(B(0.6, 1, 0.8), PODIUM, arch, 29.2, 0.5, 42.4, { e: EF })

  // A2's side walls, solid from the corridor's and the outer wall's face to the hall's, as
  // 平面尺寸圖 draws them (the columns are within): on each side three sections, each angled
  // in toward the stage and stepping back out at its end (the seat by the wall is left out
  // where they come in), then straight on to the stage. On the north the double doors in
  // from the corridor, at the back of their reveal; on the south 翻譯室's front, with its
  // window on to the hall above a sill a metre over its floor.
  {
    const CORRIDOR = 29.75 - WALL_T / 2
    const OUTER = 45.6 + WALL_T / 2
    /** A wall of thickness t along a line through pts, mitred at its bends, squared off half
     * its thickness past its ends */
    const band = (pts: Pt[], t: number): Pt[] => {
      const n = pts.length
      const dir = (i: number) => {
        const [ax, az] = pts[i]!
        const [bx, bz] = pts[i + 1]!
        const L = Math.hypot(bx - ax, bz - az)
        return [(bx - ax) / L, (bz - az) / L] as const
      }
      const left: Pt[] = []
      const right: Pt[] = []
      for (let i = 0; i < n; i++) {
        const [dx, dz] = dir(Math.min(i, n - 2))
        const [px, pz] = dir(Math.max(i - 1, 0))
        // the bisector of the two normals, lengthened to keep the faces t / 2 off the line
        let [mx, mz] = [-(dz + pz) / 2, (dx + px) / 2]
        const k = t / 2 / (mx * -dz + mz * dx)
        ;[mx, mz] = [mx * k, mz * k]
        let [x, z] = pts[i]!
        if (i === 0) [x, z] = [x - (dx * t) / 2, z - (dz * t) / 2]
        if (i === n - 1) [x, z] = [x + (dx * t) / 2, z + (dz * t) / 2]
        left.push([x + mx, z + mz])
        right.unshift([x - mx, z - mz])
      }
      return [...left, ...right]
    }
    const side = (pts: Pt[]) => prism(pts, A2_H, M.wall, wallsG)
    side([
      [11.17, CORRIDOR],
      [29.34, CORRIDOR],
      [29.34, 30.53],
      [27.5, 30.53],
      [24.2, 30.22],
      [23.9, 30.83],
      [18.2, 30.09],
      [17.9, 30.7],
      [11.78, 29.94],
      [11.78, 30.39],
      [11.17, 30.39],
    ])
    side([
      [31.02, CORRIDOR],
      [34.08, CORRIDOR],
      [34.08, 30.53],
      [31.02, 30.53],
    ])
    side([
      [11.52, 44.79],
      [11.82, 44.79],
      [11.82, 45.28],
      [17.9, 44.52],
      [18.2, 45.13],
      [23.9, 44.39],
      [24.2, 45],
      [27.5, 44.69],
      [29.63, 44.69],
      [29.63, 46.81],
      [26, 45.6],
      [11.6, 45.6],
    ])
    // the south wall, its bends mitred
    side(band(SOUTH_WALL, WALL_T))
    // the walls at 控制室's and the entrance lobby's hall side, slanting as the plan has them,
    // squared off at their ends against the walls they meet
    side([
      [11.075, CORRIDOR],
      [11.325, CORRIDOR],
      [11.125, 33.425],
      [10.875, 33.425],
    ])
    side([
      [11.075, 41.475],
      [11.325, 41.475],
      [11.725, OUTER],
      [11.475, OUTER],
    ])
    // the proscenium: a wall either side of the stage's opening, hooked in at its end; and the
    // stage's back wall, the screen hung in front of it, its ends turned forward. Between each
    // hook and the back wall's end, a curtained way through to the backstage behind.
    const mirror = (pts: Pt[]) => pts.map(([x, z]): Pt => [x, 75.2 - z])
    const hook: Pt[] = [
      [34.07, CORRIDOR],
      [34.27, CORRIDOR],
      [34.27, 32.145],
      [34.735, 32.27],
      [34.645, 32.52],
      [34.07, 32.3],
    ]
    side(hook)
    side(mirror(hook).map(([x, z]): Pt => [x, Math.min(z, 44.94)]))
    side([
      [35.59, 32.27],
      [35.77, 32.355],
      [35.575, 32.835],
      [35.575, 42.365],
      [35.77, 42.845],
      [35.59, 42.93],
      [35.37, 42.4],
      [35.37, 32.8],
    ])
    // 翻譯室's front
    const [front, back] = [44.69, 44.94]
    const [win, end] = [31.27, 34.08]
    const [sill, head] = [STAGE_H + 1, STAGE_H + 2.2]
    const pane = (x1: number, x2: number, y0: number, h: number) =>
      prism(
        [
          [x1, front],
          [x2, front],
          [x2, back],
          [x1, back],
        ],
        h,
        M.wall,
        wallsG,
        y0,
      )
    pane(29.63, win, 0, A2_H)
    pane(win, end, 0, sill)
    pane(win, end, head, A2_H - head)
    glass(win, (front + back) / 2, end, (front + back) / 2, head - sill, wallsG, sill)
  }
  // 控制室's window on to the stage
  board(
    11.3,
    42.6,
    11.45,
    44.2,
    [20, 37.6],
    WALL_T / 2 + 0.03,
    0.02,
    A2_BACK + 1,
    A2_BACK + 1.9,
    M.glass,
  )

  const { seats, openSeats } = buildA2Seating(arch, walk)
  const fixedSeats = seats.length

  // the lintels, over the higher of the floors either side of each doorway (A2's back rooms
  // stand on its top tier, well above the rest)
  arch.updateMatrixWorld(true)
  const down = new THREE.Raycaster()
  const floorAt = (x: number, z: number) => {
    down.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0))
    return down.intersectObjects(walk, false)[0]?.point.y ?? 0
  }
  for (const [[x1, z1], [x2, z2], top] of lintels) {
    const L = Math.hypot(x2 - x1, z2 - z1)
    // a step either side of the wall, square to it
    const nx = (-(z2 - z1) / L) * 0.4
    const nz = ((x2 - x1) / L) * 0.4
    const [mx, mz] = [(x1 + x2) / 2, (z1 + z2) / 2]
    const y0 = Math.max(0, floorAt(mx + nx, mz + nz), floorAt(mx - nx, mz - nz)) + DOOR_H
    if (y0 < top) seg(x1, z1, x2, z2, WALL_T, top - y0, M.wall, wallsG, y0)
  }

  ZONES.forEach(([c, p, y = 0]) => {
    const o = prism(p, 0.01, mat(c, { name: 'zone' }), zonesG, y + 0.002, null)
    o.castShadow = false
    o.raycast = noRay
  })
  setZones(zonesG, false)
  wallsG.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.raycast = noRay
  })

  buildOuterEdges(wallsG, EA)
  // walls' faces drawn a hair behind their outlines, so a line along one wall's edge doesn't
  // flicker into dashes against another's face meeting it there
  wallsG.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined
    if (!(o as THREE.Mesh).isMesh || !m) return
    m.polygonOffset = true
    m.polygonOffsetFactor = 1
    m.polygonOffsetUnits = 1
  })
  return { arch, wallsG, zonesG, walk, fixedSeats, seats, openSeats, ground }
}

/**
 * A2's seats, as in the hall: upholstered dark red, every so often mauve, on a black frame,
 * the armrests glossy black, a dark wooden panel at the end of each row by an aisle
 */
const SEAT = {
  red: new THREE.Color('#7b2c2a'),
  mauve: new THREE.Color('#b59ba4'),
  fabric: mat('#ffffff', { roughness: 0.95, name: 'seat_fabric' }),
  shell: mat('#1f1f22', { roughness: 0.6, name: 'seat_shell' }),
  arm: mat('#18181a', { roughness: 0.3, name: 'seat_arm' }),
  end: mat('#4b2e20', { roughness: 0.55, name: 'seat_end' }),
}
/**
 * Rows (from the front) whose side blocks are a seat short, the one by the wall: the side walls
 * step in toward the stage in three sections, leaving no room for it there (平面尺寸圖: 6 seats
 * a side in the other rows, 10 in the middle; 296 in all)
 */
const A2_SHORT_ROWS = new Set([2, 3, 4, 5, 8, 9])

/**
 * Curved, raked fixed seating in A2, each seat's cushion folded up until someone sits on it.
 * Returns where people sit, and how to put cushions down.
 */
function buildA2Seating(
  arch: THREE.Group,
  walk: THREE.Mesh[],
): { seats: FixedSeat[]; openSeats: (open: ReadonlySet<number>) => void } {
  const K = A2_BOW
  const ZC = A2_ZC
  const blocks: Pt[] = [
    [30.7, 33.6],
    [35, 40.2],
    [41.6, 44.6],
  ]
  type Slot = { x: number; z: number; h: number; r: number; mauve: boolean }
  const slots: Slot[] = []
  /** The seats at the ends of each row's block, by an aisle or a wall: the end panels stand there */
  const ends: { s: Slot; side: 1 | -1 }[] = []
  for (let i = 0; i < A2_ROWS; i++) {
    const xr = A2_X0 - i * A2_ROW
    const hh = i * A2_RISE
    blocks.forEach(([p, q], b) => {
      const n = Math.floor((q - p) / 0.53) + 1
      // the north block's wall end is its first seat, the south block's its last
      const short = A2_SHORT_ROWS.has(i) && b !== 1
      const from = short && b === 0 ? 1 : 0
      const to = short && b === 2 ? n - 1 : n
      for (let k = from; k < to; k++) {
        const z = p + k * 0.53
        // the fabric's two colours mixed through the hall, about one seat in three mauve
        const mauve = (i * 7 + k * 3 + b * 5) % 10 < 3
        const s = { x: xr + K * (z - ZC) ** 2, z, h: hh, r: Math.atan(2 * K * (z - ZC)), mauve }
        slots.push(s)
        if (k === from) ends.push({ s, side: -1 })
        if (k === to - 1) ends.push({ s, side: 1 })
      }
    })
  }

  const at = new THREE.Matrix4()
  const off = new THREE.Matrix4()
  const turn = new THREE.Matrix4()
  const place = (s: Slot) => at.makeRotationY(s.r).setPosition(s.x, s.h, s.z)
  const add = (im: THREE.InstancedMesh) => {
    im.castShadow = im.receiveShadow = true
    arch.add(im)
    return im
  }
  // each fixed part of a seat as it stands facing +x (the stage), from its spot on the floor:
  // the back (leaning back a little) and its foot, the armrest on its +z side and the standard
  // under it
  const fixed: [THREE.BufferGeometry, THREE.Material, [number, number, number], number][] = [
    [B(0.09, 0.56, 0.5), SEAT.fabric, [-0.25, 0.75, 0], 0.17],
    [B(0.1, 0.12, 0.5), SEAT.shell, [-0.24, 0.42, 0], 0],
    [B(0.5, 0.06, 0.07), SEAT.arm, [-0.03, 0.64, 0.27], 0],
    [B(0.07, 0.6, 0.06), SEAT.shell, [-0.2, 0.3, 0.27], 0],
  ]
  fixed.forEach(([geo, m, [ox, oy, oz], lean], j) => {
    const im = add(new THREE.InstancedMesh(geo, m, slots.length))
    slots.forEach((s, k) => {
      im.setMatrixAt(
        k,
        place(s)
          .multiply(off.makeTranslation(ox, oy, oz))
          .multiply(turn.makeRotationZ(lean)),
      )
      if (j === 0) im.setColorAt(k, s.mauve ? SEAT.mauve : SEAT.red)
    })
  })
  // the cushion, upholstered on top and black beneath, drawn down; it folds up about a hinge
  // near its back, its underside then facing the stage
  const HINGE = [-0.12, 0.42] as const
  const cushion: [THREE.InstancedMesh, [number, number]][] = [
    [add(new THREE.InstancedMesh(B(0.46, 0.09, 0.48), SEAT.fabric, slots.length)), [0, 0.445]],
    [add(new THREE.InstancedMesh(B(0.44, 0.05, 0.48), SEAT.shell, slots.length)), [0, 0.375]],
  ]
  slots.forEach((s, k) => cushion[0]![0].setColorAt(k, s.mauve ? SEAT.mauve : SEAT.red))
  const hinge = new THREE.Matrix4()
  const openSeats = (open: ReadonlySet<number>) => {
    for (const [im, [ox, oy]] of cushion) {
      slots.forEach((s, k) =>
        im.setMatrixAt(
          k,
          place(s)
            .multiply(hinge.makeTranslation(HINGE[0], HINGE[1], 0))
            .multiply(turn.makeRotationZ(open.has(k) ? 0 : Math.PI / 2))
            .multiply(off.makeTranslation(ox - HINGE[0], oy - HINGE[1], 0)),
        ),
      )
      im.instanceMatrix.needsUpdate = true
      im.boundingSphere = null
    }
  }
  openSeats(new Set())
  // at each end of a block's row: a dark wooden end panel, the row's last armrest on top
  const endPanel = add(new THREE.InstancedMesh(B(0.55, 0.62, 0.04), SEAT.end, ends.length))
  const endArm = add(new THREE.InstancedMesh(B(0.5, 0.06, 0.08), SEAT.arm, ends.length))
  ends.forEach(({ s, side }, k) => {
    endPanel.setMatrixAt(k, place(s).multiply(off.makeTranslation(-0.08, 0.32, side * 0.28)))
    endArm.setMatrixAt(k, place(s).multiply(off.makeTranslation(-0.03, 0.66, side * 0.28)))
  })
  // seats face east (the stage), bowed by r; hips sit just behind the cushion's centre
  const seats = slots.map((s) => ({
    x: s.x - 0.04 * Math.cos(s.r),
    y: s.h + 0.49,
    z: s.z + 0.04 * Math.sin(s.r),
    turn: Math.PI / 2 + s.r,
  }))
  return { seats, openSeats }
}
