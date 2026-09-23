/** A stanchion post on the floor plan. `cut` holds bearings (radians) of belts removed at this post. */
export interface Post {
  x: number
  z: number
  cut?: readonly number[]
}

/** Longest belt the retractable cassette can reach, in metres */
export const BELT_MAX = 2.5
/** Posts closer than this are treated as stacked, not linked */
const BELT_MIN = 0.2
/** How far (radians, ~15°) a stored cut may drift from a belt's bearing and still remove it */
const CUT_TOLERANCE = 0.26

export const bearing = (a: Post, b: Post) => Math.atan2(b.z - a.z, b.x - a.x)

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

/** Whether post `p` has a stored cut pointing at bearing `ang` */
export const cutsToward = (p: Post, ang: number) =>
  !!p.cut?.some((c) => angleDiff(c, ang) < CUT_TOLERANCE)

/** Drop the cuts on `p` that point at bearing `ang` */
export const withoutCutToward = (p: Post, ang: number) =>
  p.cut?.filter((c) => angleDiff(c, ang) >= CUT_TOLERANCE) ?? []

/**
 * Pairs of posts that would naturally be linked: within {@link BELT_MAX} of each other and
 * with no third post inside the circle whose diameter is the pair (a Gabriel graph). A row
 * becomes a chain and a rectangle its outline — no belts skipping over a post or cutting
 * across a corner.
 */
export function beltCandidates(posts: readonly Post[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < posts.length; i++)
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i]!
      const b = posts[j]!
      const d = Math.hypot(b.x - a.x, b.z - a.z)
      if (d < BELT_MIN || d > BELT_MAX) continue
      const blocked = posts.some((c, k) => {
        if (k === i || k === j) return false
        // angle a-c-b is 90° or wider ⇔ c lies in (or on) the circle with diameter ab
        return (a.x - c.x) * (b.x - c.x) + (a.z - c.z) * (b.z - c.z) < 1e-2
      })
      if (!blocked) out.push([i, j])
    }
  return out
}

/** Split the candidate belts into the ones drawn and the ones the user has cut. */
export function linkPosts(posts: readonly Post[]) {
  const belts: [number, number][] = []
  const cut: [number, number][] = []
  for (const [i, j] of beltCandidates(posts)) {
    const a = posts[i]!
    const b = posts[j]!
    const isCut = cutsToward(a, bearing(a, b)) || cutsToward(b, bearing(b, a))
    ;(isCut ? cut : belts).push([i, j])
  }
  return { belts, cut }
}
