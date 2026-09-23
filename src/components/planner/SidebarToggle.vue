<script setup lang="ts">
import { computed } from 'vue'

const collapsed = defineModel<boolean>({ required: true })
const label = computed(() => (collapsed.value ? '展開側邊欄' : '收合側邊欄'))
</script>

<template>
  <button
    class="toggle"
    type="button"
    :title="label"
    :aria-label="label"
    :aria-expanded="!collapsed"
    aria-controls="planner-sidebar"
    @click="collapsed = !collapsed"
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" :class="{ flip: collapsed }">
      <path
        d="M10 3 5 8l5 5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<style scoped>
.toggle {
  width: 20px;
  height: 56px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-left: 0;
  border-radius: 0 10px 10px 0;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  box-shadow: 2px 1px 4px rgba(0, 0, 0, 0.05);
  transition:
    color 0.15s,
    background 0.15s;
}
.toggle:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.toggle:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
svg {
  transition: transform 0.25s;
}
.flip {
  transform: rotate(180deg);
}
</style>
