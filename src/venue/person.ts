import * as THREE from 'three'

/*
 * The 人員 figure is one smooth, rounded body — a mannequin rather than parts glued together.
 * It is described as a signed distance field (capsules and spheres blended with a smooth
 * union) and turned into a mesh once with surface nets.
 */

type V3 = [number, number, number]

/** Distance from (px,py,pz) to the capsule (ax,ay,az)–(bx,by,bz) of radius r (negative inside) */
function capsule(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
) {
  const pax = px - ax
  const pay = py - ay
  const paz = pz - az
  const bax = bx - ax
  const bay = by - ay
  const baz = bz - az
  const h = Math.min(
    1,
    Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)),
  )
  // Math.sqrt rather than Math.hypot: this runs ~a million times while the mesh is built
  const dx = pax - bax * h
  const dy = pay - bay * h
  const dz = paz - baz * h
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r
}

/** Polynomial smooth minimum: blends two shapes over a band of width k */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - (h * h * k) / 4
}

/** Front faces +z; feet on y = 0; about 1.72m tall */
function personSdf(x: number, y: number, z: number) {
  // the torso and shoulders are a little flatter front-to-back
  const fz = z / 0.72
  const torso = capsule(x, y, fz, 0, 0.9, 0, 0, 1.28, 0, 0.165) * 0.72
  const shoulders = capsule(x, y, fz, -0.15, 1.36, 0, 0.15, 1.36, 0, 0.075) * 0.72
  let d = smin(torso, shoulders, 0.08)
  d = smin(d, capsule(x, y, z, 0, 1.38, 0, 0, 1.52, 0, 0.05), 0.05)
  d = smin(d, Math.sqrt(x * x + (y - 1.605) ** 2 + z * z) - 0.115, 0.04)
  for (let s = 1; s >= -1; s -= 2) {
    // a small blend keeps the arms and legs apart where they hang close together
    d = smin(d, capsule(x, y, z, s * 0.095, 0.07, 0, s * 0.095, 0.86, 0, 0.07), 0.03)
    d = smin(d, capsule(x, y, z, s * 0.215, 1.35, 0, s * 0.27, 0.93, 0.02, 0.055), 0.025)
  }
  return d
}

/**
 * Seated pose, origin on the seat surface under the hips: thighs forward, shins down,
 * hands resting on the knees. The head ends about 0.97m above the seat.
 */
function seatedSdf(x: number, y: number, z: number) {
  const fz = (z + 0.03) / 0.72
  const torso = capsule(x, y, fz, 0, 0.2, 0, 0, 0.5, 0, 0.165) * 0.72
  const shoulders = capsule(x, y, fz, -0.15, 0.6, 0, 0.15, 0.6, 0, 0.075) * 0.72
  let d = smin(torso, shoulders, 0.08)
  d = smin(d, capsule(x, y, z, 0, 0.62, -0.03, 0, 0.77, -0.03, 0.05), 0.05)
  d = smin(d, Math.sqrt(x * x + (y - 0.855) ** 2 + (z + 0.03) ** 2) - 0.115, 0.04)
  for (let s = 1; s >= -1; s -= 2) {
    // thigh forward along the seat, shin down to the floor
    d = smin(d, capsule(x, y, z, s * 0.1, 0.075, -0.02, s * 0.1, 0.085, 0.4, 0.07), 0.04)
    d = smin(d, capsule(x, y, z, s * 0.1, 0.085, 0.4, s * 0.1, -0.39, 0.44, 0.062), 0.03)
    // upper arm down the side, forearm forward onto the thigh
    d = smin(d, capsule(x, y, z, s * 0.215, 0.59, -0.03, s * 0.24, 0.33, 0.02, 0.052), 0.025)
    d = smin(d, capsule(x, y, z, s * 0.24, 0.33, 0.02, s * 0.17, 0.2, 0.3, 0.048), 0.03)
  }
  return d
}

/**
 * Surface nets: one vertex per grid cell the surface passes through (the average of its edge
 * crossings) and one quad per grid edge the surface crosses. Normals come from the field's
 * gradient, so shading stays smooth even on a coarse grid.
 */
function surfaceNets(
  sdf: (x: number, y: number, z: number) => number,
  min: V3,
  max: V3,
  step: number,
) {
  const n = [0, 1, 2].map((a) => Math.ceil((max[a]! - min[a]!) / step) + 1) as V3
  const [nx, ny, nz] = n
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k)
  const val = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        val[at(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step)

  const cell = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k)
  const vert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const pos: number[] = []
  const nor: number[] = []
  const corners: V3[] = []
  for (let c = 0; c < 8; c++) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1])
  const edges: [number, number][] = []
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) if ([1, 2, 4].includes(a ^ b)) edges.push([a, b])

  const e = step * 0.5
  const v = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let neg = 0
        for (let c = 0; c < 8; c++) {
          const [a, b, cc] = corners[c]!
          v[c] = val[at(i + a, j + b, k + cc)]!
          if (v[c]! < 0) neg++
        }
        if (neg === 0 || neg === 8) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let cnt = 0
        for (const [a, b] of edges) {
          const va = v[a]!
          const vb = v[b]!
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          const ca = corners[a]!
          const cb = corners[b]!
          sx += ca[0] + (cb[0] - ca[0]) * t
          sy += ca[1] + (cb[1] - ca[1]) * t
          sz += ca[2] + (cb[2] - ca[2]) * t
          cnt++
        }
        const x = min[0] + (i + sx / cnt) * step
        const y = min[1] + (j + sy / cnt) * step
        const z = min[2] + (k + sz / cnt) * step
        vert[cell(i, j, k)] = pos.length / 3
        pos.push(x, y, z)
        const g = new THREE.Vector3(
          sdf(x + e, y, z) - sdf(x - e, y, z),
          sdf(x, y + e, z) - sdf(x, y - e, z),
          sdf(x, y, z + e) - sdf(x, y, z - e),
        ).normalize()
        nor.push(g.x, g.y, g.z)
      }

  const idx: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) idx.push(a, c, b, a, d, c)
    else idx.push(a, b, c, a, c, d)
  }
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = val[at(i, j, k)]!
        const inside = v0 < 0
        // for each axis, the grid edge from (i,j,k) to its +1 neighbour, if the surface crosses it
        if (i < nx - 1 && j > 0 && k > 0 && inside !== val[at(i + 1, j, k)]! < 0)
          quad(
            vert[cell(i, j - 1, k - 1)]!,
            vert[cell(i, j, k - 1)]!,
            vert[cell(i, j, k)]!,
            vert[cell(i, j - 1, k)]!,
            !inside,
          )
        if (j < ny - 1 && i > 0 && k > 0 && inside !== val[at(i, j + 1, k)]! < 0)
          quad(
            vert[cell(i - 1, j, k - 1)]!,
            vert[cell(i - 1, j, k)]!,
            vert[cell(i, j, k)]!,
            vert[cell(i, j, k - 1)]!,
            !inside,
          )
        if (k < nz - 1 && i > 0 && j > 0 && inside !== val[at(i, j, k + 1)]! < 0)
          quad(
            vert[cell(i - 1, j - 1, k)]!,
            vert[cell(i, j - 1, k)]!,
            vert[cell(i, j, k)]!,
            vert[cell(i - 1, j, k)]!,
            !inside,
          )
      }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setIndex(idx)
  return geo
}

let standing: THREE.BufferGeometry | null = null
let seated: THREE.BufferGeometry | null = null

/** The shared standing figure, feet on y = 0; built on first use */
export function personGeometry() {
  if (!standing) {
    standing = surfaceNets(personSdf, [-0.36, -0.02, -0.16], [0.36, 1.76, 0.16], 0.02)
    // stand exactly on the floor
    standing.computeBoundingBox()
    standing.translate(0, -standing.boundingBox!.min.y, 0)
  }
  return standing
}

/** The shared seated figure, origin on the seat under the hips; built on first use */
export function seatedGeometry() {
  seated ??= surfaceNets(seatedSdf, [-0.36, -0.5, -0.24], [0.36, 1.0, 0.56], 0.02)
  return seated
}
