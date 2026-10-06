<script setup lang="ts">
import { computed } from 'vue'
import DockMenu from './DockMenu.vue'
import ModeIcon from './ModeIcon.vue'
import { t } from '@/i18n'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore, type PlannerMode } from '@/stores/planner'

/**
 * 檢視 / 編輯 / 導覽, and 多選: in the top bar, or the bottom bar on phones (`menu`: the
 * three as one menu there). 多選 is always shown (greyed in View mode) so the bar doesn't
 * shift when the mode changes.
 */
defineProps<{ menu?: boolean }>()

const store = usePlannerStore()
const editor = useVenueEditor()
const MODES = computed(() =>
  (['view', 'edit'] as PlannerMode[]).map((mode) => ({ mode, ...t().modes[mode] })),
)
/** Which of the three is on: 導覽 while walking, else the mode */
const current = computed(() => (store.walk ? 'tour' : store.editing ? 'edit' : 'view'))
/** Picking 檢視 or 編輯 ends a walk; 導覽 starts one (from the middle of the view) */
function pick(mode: PlannerMode) {
  editor.value?.endWalk()
  store.mode = mode
}
function tour() {
  if (!store.walk) editor.value?.walkAs(null)
}
const MENU = computed(() => [
  ...MODES.value.map((m) => ({
    key: m.mode as PlannerMode | 'tour',
    label: m.label,
    title: m.title,
    disabled: store.readOnly && m.mode === 'edit',
  })),
  { key: 'tour' as const, label: t().walk.start, title: t().walk.startHint },
])
function choose(key: PlannerMode | 'tour') {
  if (key === 'tour') tour()
  else pick(key)
}
</script>

<template>
  <div class="mode-switch">
    <DockMenu v-if="menu" :label="t().modes.label" :items="MENU" :current="current" @pick="choose">
      <template #icon="{ key }"><ModeIcon :mode="key" /></template>
    </DockMenu>
    <div v-else class="grp mode" :class="current" role="radiogroup" :aria-label="t().modes.label">
      <span class="thumb" aria-hidden="true"></span>
      <button
        v-for="m in MODES"
        :key="m.mode"
        class="btn"
        :class="{ cur: current === m.mode }"
        role="radio"
        :aria-checked="current === m.mode"
        :aria-label="m.label"
        :title="store.readOnly ? t().palette.readOnly : `${m.label} · ${m.title}`"
        :disabled="store.readOnly"
        @click="pick(m.mode)"
      >
        <ModeIcon class="ico" :mode="m.mode" />
      </button>
      <!-- 導覽: not a mode of its own, a walk on top of either -->
      <button
        class="btn"
        :class="{ cur: current === 'tour' }"
        role="radio"
        :aria-checked="current === 'tour'"
        :aria-label="t().walk.start"
        :title="`${t().walk.start} · ${t().walk.startHint}`"
        @click="tour"
      >
        <ModeIcon class="ico" mode="tour" />
      </button>
    </div>
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
  </div>
</template>

<style scoped>
.mode-switch {
  display: flex;
  gap: 6px;
}
.mode .btn:disabled {
  cursor: not-allowed;
}
/* Mode switch: one yellow thumb slides between three equal thirds */
.mode {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
}
.thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  /* one column: (inner width − the two 2px gaps) / 3 */
  width: calc((100% - 10px) / 3);
  border-radius: 7px;
  background: var(--yel);
  color: var(--on-yel);
  transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.mode.edit .thumb {
  transform: translateX(calc(100% + 2px));
}
.mode.tour .thumb {
  transform: translateX(calc(200% + 4px));
}
.mode .btn {
  position: relative;
  background: transparent;
  transition: color 0.2s;
}
.mode .btn.cur {
  color: var(--on-yel);
}
.mode .btn:not(.cur) {
  color: var(--muted);
}
.mode .btn:not(.cur):hover {
  color: var(--ink);
}
/* icon-only buttons: square, their name in the tooltip and aria-label */
.mode-switch .btn {
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
