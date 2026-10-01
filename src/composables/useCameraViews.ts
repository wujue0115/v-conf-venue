import { shallowRef } from 'vue'
import { useVenueEditor } from './useVenueEditor'
import { VIEWS, type CameraView } from '@/venue/places'

/** The camera view last flown to (an index into VIEWS), shared by the top bar and the phone's picker */
const active = shallowRef(0)

/** The preset camera views (全景, 俯視, the rooms), and flying to one */
export function useCameraViews() {
  const editor = useVenueEditor()
  function flyTo(view: CameraView, i: number) {
    active.value = i
    editor.value?.flyTo(view)
  }
  return { views: VIEWS, active, flyTo }
}
