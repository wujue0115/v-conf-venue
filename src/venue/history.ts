import type { LayoutItem } from './layout'

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
