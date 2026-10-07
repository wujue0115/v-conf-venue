import { onMounted, shallowRef } from 'vue'
import {
  renderPaintedThumbnail,
  renderThumbnails,
  thumbKey,
  type FurnitureType,
} from '@/venue/furniture'

/** Keyed by `thumbKey(type, variant)` */
type Thumbs = Record<string, string | undefined>

// Rendering needs WebGL, so it happens once, lazily, after the first mount.
const thumbs = shallowRef<Thumbs>({})
let rendered = false

export function useFurnitureThumbnails() {
  onMounted(() => {
    if (rendered) return
    rendered = true
    try {
      thumbs.value = renderThumbnails()
    } catch (err) {
      console.warn('Furniture thumbnails unavailable:', err)
    }
  })
  return thumbs
}

const painted = new Map<string, string>()

/**
 * A kind's preview in a colour of its own (people's, a zone's or a 動線點's), rendered the first
 * time it's wanted and kept; '' where WebGL isn't to be had
 */
export function paintedThumbnail(type: FurnitureType, v: string | undefined, color: string) {
  const key = `${thumbKey(type, v)}|${color}`
  let url = painted.get(key)
  if (url === undefined) {
    try {
      url = renderPaintedThumbnail(type, v, color)
    } catch (err) {
      console.warn('Furniture thumbnail unavailable:', err)
      url = ''
    }
    painted.set(key, url)
  }
  return url
}
