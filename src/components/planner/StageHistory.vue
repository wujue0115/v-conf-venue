<script setup lang="ts">
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { t } from '@/i18n'

/** 復原 and 重做 at the bottom left; always shown (greyed in View mode) */

const store = usePlannerStore()
const editor = useVenueEditor()
</script>

<template>
  <div class="history grp" data-stage-ui>
    <button
      class="btn"
      type="button"
      :aria-label="t().history.undo"
      :disabled="!store.editing || !store.canUndo"
      :title="
        store.editing ? t().history.undoTitle : `${t().history.undo} · ${t().history.editOnly}`
      "
      @click="editor?.undo()"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </svg>
    </button>
    <button
      class="btn"
      type="button"
      :aria-label="t().history.redo"
      :disabled="!store.editing || !store.canRedo"
      :title="
        store.editing ? t().history.redoTitle : `${t().history.redo} · ${t().history.editOnly}`
      "
      @click="editor?.redo()"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.history {
  position: absolute;
  left: 14px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
}
.btn {
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
@media (max-width: 720px) {
  .history {
    left: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
