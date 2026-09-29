<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import StageSettings from './StageSettings.vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore, type PlannerMode } from '@/stores/planner'
import { VIEWS, type CameraView } from '@/venue/places'
import { t } from '@/i18n'

const store = usePlannerStore()
const editor = useVenueEditor()
const activeView = shallowRef(0)

const MODES = computed(() =>
  (['view', 'edit'] as PlannerMode[]).map((mode) => ({ mode, ...t().modes[mode] })),
)

function flyTo(view: CameraView, i: number) {
  activeView.value = i
  editor.value?.flyTo(view)
}
</script>

<template>
  <div class="topbars">
    <div class="bar views" data-stage-ui>
      <div class="grp">
        <button
          v-for="(v, i) in VIEWS"
          :key="v.key"
          class="btn"
          :class="{ on: activeView === i }"
          @click="flyTo(v, i)"
        >
          {{ t().views[v.key] }}
        </button>
      </div>
    </div>
    <div class="bar tools" data-stage-ui>
      <div
        class="grp mode"
        :class="{ edit: store.editing }"
        role="radiogroup"
        :aria-label="t().modes.label"
      >
        <span class="thumb" aria-hidden="true"></span>
        <button
          v-for="m in MODES"
          :key="m.mode"
          class="btn"
          :class="{ cur: store.mode === m.mode }"
          role="radio"
          :aria-checked="store.mode === m.mode"
          :aria-label="m.label"
          :title="`${m.label} · ${m.title}`"
          @click="store.mode = m.mode"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="m.mode === 'view'">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </template>
            <template v-else>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </template>
          </svg>
        </button>
      </div>
      <!-- always shown (greyed in View mode) so the bar doesn't shift when the mode changes -->
      <div class="grp">
        <button
          class="btn"
          :class="{ on: store.multiSelect && store.editing }"
          type="button"
          :aria-pressed="store.multiSelect && store.editing"
          :aria-label="t().multi.label"
          :disabled="!store.editing"
          :title="`${t().multi.label} · ${store.editing ? t().multi.title : t().multi.editOnly}`"
          @click="store.multiSelect = !store.multiSelect"
        >
          <!-- a dashed selection box around two items -->
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="3" stroke-dasharray="3 2.4" />
            <rect x="6.5" y="6.5" width="5" height="5" rx="1" />
            <rect x="12.5" y="12.5" width="5" height="5" rx="1" />
          </svg>
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

/* Narrow screens: the bars wrap onto two rows; line the views up on the right too */
@media (max-width: 500px) {
  .views {
    justify-content: flex-end;
    margin-left: auto;
  }
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
/* icon-only buttons: square, their name in the tooltip and aria-label */
.tools .btn {
  width: 34px;
  padding: 0;
  display: grid;
  place-items: center;
}
.ico {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
