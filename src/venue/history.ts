import type { LayoutItem } from './layout'
import { inRect } from './zone'

/*
 * Undo history alongside other people's changes. Each undo step is the whole layout as it was;
 * when someone else's change comes in, every step takes it on too, so undoing puts back only
 * what this person changed and leaves theirs standing.
 */

/** One undo step (a JSON list of items), with these items as they now are and these ids gone */
export function rebaseStep(
  step: string,
  upserts: ReadonlyMap<string, LayoutItem>,
  gone: ReadonlySet<string>,
): string {
  const items = JSON.parse(step) as LayoutItem[]
  const seen = new Set<string>()
  const out: LayoutItem[] = []
  for (const item of items) {
    if (gone.has(item.id!)) continue
    const now = upserts.get(item.id!)
    if (now) seen.add(item.id!)
    out.push(now ?? item)
  }
  // added since that step: undoing back past it doesn't take them away
  for (const [id, item] of upserts) if (!seen.has(id)) out.push(item)
  return JSON.stringify(out)
}

/** The ids of the zones locked against editing in a layout, and of everything standing in one */
function lockedIds(items: readonly LayoutItem[]) {
  const zones = items.filter((i) => i.t === 'zone' && i.locked && i.w && i.d)
  const ids = new Set<string>()
  for (const i of items) {
    if (zones.includes(i)) ids.add(i.id!)
    else if (zones.some((z) => inRect({ ...z, w: z.w!, d: z.d! }, i.x, i.z))) ids.add(i.id!)
  }
  return ids
}

/** An item as a string, its keys sorted, so the same item reads the same however it was built */
const keyOf = (item: LayoutItem | undefined, unlocked = false) => {
  if (!item) return ''
  const { locked: _locked, ...rest } = item
  const o: Record<string, unknown> = unlocked ? rest : item
  return JSON.stringify(
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]),
  )
}

/**
 * Whether going from layout `now` to the undo or redo step `then` would change a zone locked
 * against editing, or anything standing in one, in either of them: someone else may have locked
 * it since the step was taken. Locking or unlocking a zone, and nothing else, can still be undone.
 */
export function touchesLocked(now: readonly LayoutItem[], then: readonly LayoutItem[]) {
  const a = new Map(now.map((i) => [i.id!, i]))
  const b = new Map(then.map((i) => [i.id!, i]))
  for (const id of new Set([...lockedIds(now), ...lockedIds(then)])) {
    const zone = a.get(id)?.t === 'zone' && b.get(id)?.t === 'zone'
    if (keyOf(a.get(id), zone) !== keyOf(b.get(id), zone)) return true
  }
  return false
}
