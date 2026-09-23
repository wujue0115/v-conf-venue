<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import SelectionBar from './SelectionBar.vue'
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
watch([editor, () => store.snap], ([ed, on]) => ed?.setSnap(on), { immediate: true })
watch([editor, () => store.wallsCut], ([ed, on]) => ed?.setWallsCut(on), { immediate: true })
watch([editor, () => store.showLabels], ([ed, on]) => ed?.setLabelsVisible(on), { immediate: true })
</script>

<template>
  <main ref="stage" class="stage">
    <canvas ref="canvas" tabindex="0"></canvas>
    <VenueLabels v-show="store.showLabels" />
    <StageToolbar />
    <StageToast />
    <SelectionBar />
    <div class="help">
      左鍵拖曳：前後左右移動 · 右鍵：旋轉 · 滾輪：縮放 · WASD／方向鍵移動（Shift 加速）·
      拖曳物件可移動
    </div>
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
.help {
  position: absolute;
  left: calc(var(--stage-inset, 0px) + 14px);
  bottom: 14px;
  font-size: 11.5px;
  color: #6b6e75;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px 10px;
  pointer-events: none;
}
@media (max-width: 1100px) {
  .help {
    display: none;
  }
}
</style>
