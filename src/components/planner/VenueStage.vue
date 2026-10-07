<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import TagLayer from './TagLayer.vue'
import CloudNotice from '@/components/cloud/CloudNotice.vue'
import FollowFrame from '@/components/cloud/FollowFrame.vue'
import MobileDock from './MobileDock.vue'
import SelectionBar from './SelectionBar.vue'
import StageHelp from './StageHelp.vue'
import StageHistory from './StageHistory.vue'
import PlaceHint from './PlaceHint.vue'
import StageToast from './StageToast.vue'
import StageToolbar from './StageToolbar.vue'
import VenueLabels from './VenueLabels.vue'
import WalkControls from './WalkControls.vue'
import { usePhone } from '@/composables/usePhone'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { useCollabStore, type EditorLink } from '@/stores/collab'
import { usePlannerStore } from '@/stores/planner'
import { dark } from '@/theme'
import { VenueEditor } from '@/venue/VenueEditor'

const store = usePlannerStore()
const collab = useCollabStore()
const phone = usePhone()
let link: EditorLink | null = null
const editor = useVenueEditor()
const stageEl = useTemplateRef('stage')
const canvasEl = useTemplateRef('canvas')

onMounted(() => {
  if (!stageEl.value || !canvasEl.value) return
  const ed = new VenueEditor(canvasEl.value, stageEl.value, {
    onChange: (items) => (store.items = items),
    onSelect: (sel) => (store.selection = sel),
    onToast: store.notify,
    onHistory: (u, r) => {
      store.canUndo = u
      store.canRedo = r
    },
    onLive: (moves) => collab.move(moves),
    onCamera: () => collab.camera(),
    onFollowEnd: () => collab.followEnded(),
    onPointer: (p) => collab.pointer(p),
    onArmed: (type) => (store.armed = type),
    onPathDraw: (on) => (store.pathDrawing = on),
    onWalk: (w) => (store.walk = w),
    onWalker: (w) => collab.walker(w),
  })
  store.fixedSeats = ed.fixedSeats
  ed.load(store.items)
  editor.value = ed
  // other people's changes, drags and selections in a shared cloud project
  link = {
    applyRemote: (up, del) => ed.applyRemote(up, del),
    applyLive: (m) => ed.applyLive(m),
    setLocks: (l) => ed.setLocks(l),
    setCursors: (c) => ed.setCursors(c),
    follow: (cam) => ed.follow(cam),
    cameraState: () => ed.cameraState(),
    setWalkers: (w) => ed.setWalkers(w),
    setWalkerColor: (c) => ed.setWalkerColor(c),
  }
  collab.attach(link)
})

onBeforeUnmount(() => {
  if (link) collab.detach(link)
  editor.value?.dispose()
  editor.value = null
  store.armed = null
  store.pathDrawing = false
  store.walk = null
})

// Push view toggles from the store into the scene
watch([editor, () => store.editing], ([ed, on]) => ed?.setEditable(on), { immediate: true })
watch([editor, () => store.snap], ([ed, on]) => ed?.setSnap(on), { immediate: true })
watch([editor, () => store.multiSelect], ([ed, on]) => ed?.setMultiSelect(on), {
  immediate: true,
})
watch([editor, () => store.wallsCut], ([ed, on]) => ed?.setWallsCut(on), { immediate: true })
watch([editor, () => store.showLabels], ([ed, on]) => ed?.setLabelsVisible(on), { immediate: true })
watch([editor, () => store.shadows], ([ed, on]) => ed?.setShadows(on), { immediate: true })
watch([editor, dark], ([ed, on]) => ed?.setDark(on), { immediate: true })
watch(
  [editor, () => store.walkThroughWalls, () => store.walkThroughItems],
  ([ed, walls, items]) => ed?.setWalkThrough({ walls, items }),
  { immediate: true },
)
watch([editor, () => store.walkBob], ([ed, on]) => ed?.setWalkBob(on), { immediate: true })
watch([editor, () => store.lookSensitivity], ([ed, v]) => ed?.setLookSensitivity(v), {
  immediate: true,
})
watch([editor, () => store.hiddenTypes], ([ed, types]) => ed?.setHiddenTypes(types), {
  immediate: true,
})
watch([editor, () => store.hiddenTagTypes], ([ed, types]) => ed?.setHiddenTagTypes(types), {
  immediate: true,
})
watch([editor, () => store.hiddenInfoTypes], ([ed, types]) => ed?.setHiddenInfoTypes(types), {
  immediate: true,
})
watch(
  [editor, () => store.showGroupTags, () => store.showGroupInfo],
  ([ed, tags, info]) => ed?.setGroupLabelsVisible({ tags, info }),
  { immediate: true },
)
</script>

<template>
  <main ref="stage" class="stage">
    <canvas ref="canvas" tabindex="0"></canvas>
    <VenueLabels v-show="store.showLabels" />
    <TagLayer />
    <StageToolbar />
    <StageToast />
    <PlaceHint />
    <CloudNotice />
    <FollowFrame />
    <SelectionBar />
    <WalkControls />
    <StageHistory v-if="!phone" />
    <!-- walking, the stick and the hint take the bottom -->
    <MobileDock v-if="phone && !store.walk" />
    <StageHelp />
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  overflow: hidden;
  min-width: 0;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
</style>
