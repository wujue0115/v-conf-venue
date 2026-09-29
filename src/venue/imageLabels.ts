import { YEL } from './materials'

/*
 * Tags and room labels drawn onto an exported picture. On the stage they are HTML over the
 * canvas (VenueLabels, TagLayer), which a picture of the canvas leaves out; here they are drawn
 * again with a 2D canvas, matching those components' styles. Sizes are in CSS pixels, drawn
 * `scale` times as large.
 */

/** What a room or facility label says (VenueLabels fills it in, in the current language) */
export type LabelFace =
  | { kind: 'room'; id: string; name: string; cap: string }
  | { kind: 'facility'; text: string }

/** A room or facility label whose anchor is at (x, y) in the picture, `offset` px below it */
export interface LabelMark {
  x: number
  y: number
  offset: number
  face: LabelFace
}

/** An item's, group's or zone's tag whose point is at (x, y) in the picture */
export interface TagMark {
  kind: 'item' | 'zone'
  x: number
  y: number
  text: string
  /** Its colour, and the text colour that reads on it */
  fill: string
  ink: string
}

/** Pixels a zone's tag is raised above its centre (ZONE_TAG_LIFT in the editor) */
const ZONE_LIFT = 26
/** `normal` line height for the page's fonts, as a multiple of the font size */
const LINE = 1.45

/** `c` mixed with black, like CSS color-mix(in srgb, c k%, #000) */
function shade(c: string, k = 0.8) {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  if (!m) return c
  const n = parseInt(m[1]!, 16)
  const ch = (s: number) => Math.round(((n >> s) & 255) * k)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function fonts() {
  const css = getComputedStyle(document.documentElement)
  return {
    sans: getComputedStyle(document.body).fontFamily || 'sans-serif',
    mono: css.getPropertyValue('--mono').trim() || 'monospace',
  }
}

/** A thin leader line down from (x, top) and the dot at its end, `len` long */
function leader(ctx: CanvasRenderingContext2D, x: number, top: number, len: number, dot: number) {
  ctx.fillRect(x - 0.75, top, 1.5, len)
  ctx.beginPath()
  ctx.arc(x, top + len - 2 + dot / 2, dot / 2, 0, Math.PI * 2)
  ctx.fill()
}

function shadow(ctx: CanvasRenderingContext2D, blur: number, y: number, a: number) {
  ctx.shadowColor = `rgba(0,0,0,${a})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = y
}
function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function drawZoneTag(ctx: CanvasRenderingContext2D, t: TagMark, sans: string) {
  ctx.font = `700 12px ${sans}`
  const w = ctx.measureText(t.text).width + 22
  const h = 12 * 1.4 + 8
  const bottom = t.y - ZONE_LIFT
  const edge = shade(t.fill)
  ctx.fillStyle = t.fill
  leader(ctx, t.x, bottom, 22, 7)
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(t.x, bottom + 23.5, 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(t.x - w / 2, bottom - h, w, h, 7)
  shadow(ctx, 6, 2, 0.16)
  ctx.fill()
  noShadow(ctx)
  ctx.stroke()
  ctx.fillStyle = t.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t.text, t.x, bottom - h / 2 + 0.5)
}

function drawItemTag(ctx: CanvasRenderingContext2D, t: TagMark, sans: string) {
  ctx.font = `700 11.5px ${sans}`
  const w = ctx.measureText(t.text).width + 20
  const h = 11.5 * 1.5 + 6
  const edge = shade(t.fill)
  // the pill's point: a small triangle down to the tag's point
  ctx.fillStyle = edge
  ctx.beginPath()
  ctx.moveTo(t.x - 4, t.y - 4)
  ctx.lineTo(t.x + 4, t.y - 4)
  ctx.lineTo(t.x, t.y)
  ctx.fill()
  const bottom = t.y - 4
  ctx.fillStyle = t.fill
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(t.x - w / 2, bottom - h, w, h, h / 2)
  shadow(ctx, 6, 2, 0.18)
  ctx.fill()
  noShadow(ctx)
  ctx.stroke()
  ctx.fillStyle = t.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t.text, t.x, bottom - h / 2 + 0.5)
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A room label's box (and how to draw it), its bottom `offset` px above (x, y) */
function roomLabel(ctx: CanvasRenderingContext2D, l: LabelMark, f: ReturnType<typeof fonts>) {
  const face = l.face
  if (face.kind === 'facility') {
    ctx.font = `500 11.5px ${f.sans}`
    const w = ctx.measureText(face.text).width + 20
    const h = 11.5 * LINE + 6
    const box = { x: l.x - w / 2, y: l.y - l.offset - h, w, h }
    const draw = () => {
      ctx.fillStyle = YEL
      leader(ctx, l.x, box.y + h, 12, 5)
      ctx.beginPath()
      ctx.roundRect(box.x, box.y, w, h, h / 2)
      shadow(ctx, 8, 2, 0.08)
      ctx.fill()
      noShadow(ctx)
      ctx.fillStyle = '#1f2126'
      ctx.font = `500 11.5px ${f.sans}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(face.text, l.x, box.y + h / 2 + 0.5)
    }
    return { box, draw }
  }
  // two rows in a white box with a yellow border: the id and name, then the capacity on yellow
  ctx.font = `500 11px ${f.mono}`
  const idW = ctx.measureText(face.id).width
  ctx.font = `700 13px ${f.sans}`
  const nameW = ctx.measureText(face.name).width
  ctx.font = `500 12px ${f.mono}`
  const capW = ctx.measureText(face.cap).width
  const r1 = 13 * LINE + 7
  const r2 = 12 * LINE + 4
  const w = Math.max(idW + 6 + nameW, capW) + 23
  const h = r1 + r2 + 3
  const box = { x: l.x - w / 2, y: l.y - l.offset - h, w, h }
  const draw = () => {
    ctx.fillStyle = YEL
    leader(ctx, l.x, box.y + h, 22, 7)
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, w, h, 7)
    shadow(ctx, 8, 2, 0.08)
    ctx.fillStyle = '#fff'
    ctx.fill()
    noShadow(ctx)
    ctx.save()
    ctx.clip()
    ctx.fillStyle = YEL
    ctx.fillRect(box.x, box.y + 1.5 + r1, w, r2 + 1.5)
    ctx.restore()
    ctx.strokeStyle = YEL
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(box.x + 0.75, box.y + 0.75, w - 1.5, h - 1.5, 6.25)
    ctx.stroke()
    ctx.fillStyle = '#1f2126'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const base = box.y + 1.5 + 4 + 13 * LINE * 0.78
    const left = box.x + 1.5 + 10
    ctx.font = `500 11px ${f.mono}`
    ctx.fillText(face.id, left, base)
    ctx.font = `700 13px ${f.sans}`
    ctx.fillText(face.name, left + idW + 6, base)
    ctx.font = `500 12px ${f.mono}`
    ctx.textBaseline = 'middle'
    ctx.fillText(face.cap, left, box.y + 1.5 + r1 + r2 / 2 + 0.5)
  }
  return { box, draw }
}

/**
 * Draw the tags (zones' under items') and then the room and facility labels, whose positions
 * are in the picture's pixels. As on the stage, a label that would overlap one drawn before it
 * is left out.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  scale: number,
  labels: readonly LabelMark[],
  tags: readonly TagMark[],
) {
  const f = fonts()
  const at = <T extends { x: number; y: number }>(m: T): T => ({
    ...m,
    x: m.x / scale,
    y: m.y / scale,
  })
  ctx.save()
  ctx.scale(scale, scale)
  for (const t of tags) if (t.kind === 'zone') drawZoneTag(ctx, at(t), f.sans)
  for (const t of tags) if (t.kind === 'item') drawItemTag(ctx, at(t), f.sans)
  const taken: Box[] = []
  for (const l of labels) {
    const { box, draw } = roomLabel(ctx, at(l), f)
    const [x, y, r, b] = [box.x - 3, box.y - 3, box.x + box.w + 3, box.y + box.h + 3]
    if (taken.some((q) => x < q.x + q.w && r > q.x && y < q.y + q.h && b > q.y)) continue
    taken.push({ x, y, w: r - x, h: b - y })
    draw()
  }
  ctx.restore()
}
