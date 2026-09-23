<script setup lang="ts">
import FurniturePalette from './FurniturePalette.vue'
import LayoutSummary from './LayoutSummary.vue'
</script>

<template>
  <aside class="side">
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
      </div>
      <h1>政大公企 · A 棟 2F · 3D 場地規劃</h1>
    </div>
    <div class="scroll">
      <FurniturePalette />
      <LayoutSummary />
    </div>
  </aside>
</template>

<style scoped>
.side {
  background: #fff;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.hd {
  padding: 20px 20px 16px;
  border-bottom: 1px solid #eee9de;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gh {
  display: grid;
  place-items: center;
  padding: 6px;
  margin: -6px -6px -6px 0;
  border-radius: 8px;
  color: #8a6a1c;
  transition:
    color 0.15s,
    background 0.15s;
}
.gh:hover {
  color: #6b5214;
  background: #f4f1ea;
}
.gh:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.eyebrow {
  font: 500 11px/1 var(--mono);
  letter-spacing: 0.08em;
  color: #8a6a1c;
}
h1 {
  margin: 8px 0 0;
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
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}
</style>
