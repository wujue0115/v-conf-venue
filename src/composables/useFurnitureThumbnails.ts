import { onMounted, shallowRef } from 'vue'
import { renderThumbnails, type FurnitureType } from '@/venue/furniture'

type Thumbs = Partial<Record<FurnitureType, string>>

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
