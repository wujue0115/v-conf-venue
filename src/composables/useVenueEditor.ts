import { inject, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'
import type { VenueEditor } from '@/venue/VenueEditor'

const VenueEditorKey: InjectionKey<ShallowRef<VenueEditor | null>> = Symbol('venue-editor')

/** Call in the planner root; VenueStage fills it in once the canvas is mounted. */
export function provideVenueEditor() {
  const editor = shallowRef<VenueEditor | null>(null)
  provide(VenueEditorKey, editor)
  return editor
}

export function useVenueEditor() {
  const editor = inject(VenueEditorKey)
  if (!editor)
    throw new Error('useVenueEditor() called outside of a planner (missing provideVenueEditor)')
  return editor
}
