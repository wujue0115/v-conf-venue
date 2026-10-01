<script setup lang="ts">
import { t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'

/** Opens and shuts the furniture panel: in the top bar, or the bottom bar on phones */

const store = usePlannerStore()
</script>

<template>
  <div class="grp">
    <button
      class="btn lib"
      :class="{ on: !store.sidebarCollapsed }"
      type="button"
      :title="store.sidebarCollapsed ? t().sidebar.open : t().sidebar.close"
      :aria-expanded="!store.sidebarCollapsed"
      aria-controls="planner-sidebar"
      @click="store.sidebarCollapsed = !store.sidebarCollapsed"
    >
      <!-- an armchair -->
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
        <path
          d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 4 0v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM5 19v2M19 19v2"
        />
      </svg>
      <span class="lib-label">{{ t().sidebar.title }}</span>
    </button>
  </div>
</template>

<style scoped>
.lib {
  padding: 0 10px;
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
/* Phones: just its icon */
@media (max-width: 480px) {
  .lib-label {
    display: none;
  }
}
</style>
