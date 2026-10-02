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
      <div class="top">
        <div class="eyebrow">v-conf-venue for v-conf Taiwan 2026</div>
        <a
          class="gh"
          href="https://github.com/wujue0115/v-conf-venue"
          target="_blank"
          rel="noreferrer"
          title="GitHub"
          aria-label="GitHub repository"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
            />
          </svg>
        </a>
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
      <h1>{{ t().heading }}</h1>
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
  padding: 14px 14px 12px 16px;
  border-bottom: 1px solid var(--line-soft);
}
.top {
  display: flex;
  align-items: center;
  gap: 2px;
}
.gh,
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
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.gh {
  color: var(--yel-ink);
}
.close {
  color: var(--muted);
}
.gh:hover,
.close:hover {
  color: var(--ink);
  background: var(--hover);
}
.gh:focus-visible,
.close:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.eyebrow {
  /* pushes GitHub and × to the edge */
  flex: 1;
  min-width: 0;
  font: 500 11px/1.3 var(--mono);
  letter-spacing: 0.08em;
  color: var(--yel-ink);
}
h1 {
  margin: 4px 0 0;
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
