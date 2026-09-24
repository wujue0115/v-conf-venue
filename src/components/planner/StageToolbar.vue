<script setup lang="ts">
import { shallowRef } from 'vue'
import StageSettings from './StageSettings.vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore, type PlannerMode } from '@/stores/planner'
import { VIEWS, type CameraView } from '@/venue/places'

const store = usePlannerStore()
const editor = useVenueEditor()
const activeView = shallowRef(0)

const MODES: { mode: PlannerMode; label: string; title: string }[] = [
  { mode: 'view', label: '檢視', title: '只瀏覽場地，不會動到物件' },
  { mode: 'edit', label: '編輯', title: '擺放、移動與調整物件' },
]

function flyTo(view: CameraView, i: number) {
  activeView.value = i
  editor.value?.flyTo(view)
}
</script>

<template>
  <div class="topbars">
    <div class="bar" data-stage-ui>
      <div class="grp">
        <button
          v-for="(v, i) in VIEWS"
          :key="v.name"
          class="btn"
          :class="{ on: activeView === i }"
          @click="flyTo(v, i)"
        >
          {{ v.name }}
        </button>
      </div>
    </div>
    <div class="bar tools" data-stage-ui>
      <div class="grp mode" :class="{ edit: store.editing }" role="radiogroup" aria-label="模式">
        <span class="thumb" aria-hidden="true"></span>
        <button
          v-for="m in MODES"
          :key="m.mode"
          class="btn"
          :class="{ cur: store.mode === m.mode }"
          role="radio"
          :aria-checked="store.mode === m.mode"
          :title="m.title"
          @click="store.mode = m.mode"
        >
          {{ m.label }}
        </button>
      </div>
      <StageSettings />
    </div>
  </div>
</template>

<style scoped>
.topbars {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: calc(var(--stage-inset, 0px) + 14px);
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
  pointer-events: none;
}
.bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  pointer-events: auto;
}
.tools {
  justify-content: flex-end;
  margin-left: auto;
}

/* Mode switch: one yellow thumb slides between two equal halves */
.mode {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  /* one column: (inner width − the 2px gap) / 2 */
  width: calc((100% - 8px) / 2);
  border-radius: 7px;
  background: var(--yel);
  transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.mode.edit .thumb {
  transform: translateX(calc(100% + 2px));
}
.mode .btn {
  position: relative;
  background: transparent;
  transition: color 0.2s;
}
.mode .btn:not(.cur) {
  color: var(--muted);
}
.mode .btn:not(.cur):hover {
  color: var(--ink);
}
@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
