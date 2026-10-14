<script setup lang="ts">
import FurniturePalette from './FurniturePalette.vue'
import LayoutSummary from './LayoutSummary.vue'
import { t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'

/** The furniture to place and what's placed so far, in a panel on the right */

const store = usePlannerStore()
</script>

<template>
  <aside class="side" :aria-label="t().sidebar.title">
    <div class="hd">
      <h1>{{ t().sidebar.title }}</h1>
      <button
        class="close"
        type="button"
        :title="t().sidebar.close"
        :aria-label="t().sidebar.close"
        @click="store.sidebarCollapsed = true"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            d="M6 6l12 12M18 6 6 18"
          />
        </svg>
      </button>
    </div>
    <div class="scroll">
      <FurniturePalette />
      <LayoutSummary />
    </div>
  </aside>
</template>

<style scoped>
.side {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.hd {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--line-soft);
}
.close {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.close:hover {
  color: var(--ink);
  background: var(--hover);
}
.close:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
h1 {
  /* pushes × to the edge */
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  line-height: 1.3;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scroll {
  overflow: auto;
  /* don't hand leftover scroll to the page when reaching the end */
  overscroll-behavior: contain;
  flex: 1;
  padding: 14px 14px 18px;
}
</style>
