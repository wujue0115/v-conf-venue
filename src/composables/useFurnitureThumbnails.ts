import { onMounted, shallowRef } from 'vue'
import { renderThumbnails } from '@/venue/furniture'

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
