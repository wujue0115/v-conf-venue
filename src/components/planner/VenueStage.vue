<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import TagLayer from './TagLayer.vue'
import SelectionBar from './SelectionBar.vue'
import StageHelp from './StageHelp.vue'
import StageHistory from './StageHistory.vue'
import StageToast from './StageToast.vue'
import StageToolbar from './StageToolbar.vue'
import VenueLabels from './VenueLabels.vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { VenueEditor } from '@/venue/VenueEditor'

const store = usePlannerStore()
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
  })
  store.fixedSeats = ed.fixedSeats
  ed.load(store.initialItems)
  editor.value = ed
})

onBeforeUnmount(() => {
  editor.value?.dispose()
  editor.value = null
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
    <SelectionBar />
    <StageHistory />
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
