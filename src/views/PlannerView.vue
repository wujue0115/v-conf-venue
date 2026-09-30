<script setup lang="ts">
import { storeToRefs } from 'pinia'
import PlannerSidebar from '@/components/planner/PlannerSidebar.vue'
import VenueStage from '@/components/planner/VenueStage.vue'
import { provideVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'

provideVenueEditor()
const { sidebarCollapsed } = storeToRefs(usePlannerStore())
</script>

<template>
  <!--
    Everything floats over a full-size stage: ☰ and the tools along the top,
    the selected item's panel on the left, the furniture on the right. Opening
    or closing a panel never resizes the scene.
  -->
  <div class="planner">
    <VenueStage class="planner-stage" />
    <PlannerSidebar
      id="planner-sidebar"
      class="library"
      :class="{ collapsed: sidebarCollapsed }"
      :inert="sidebarCollapsed"
      data-stage-ui
    />
  </div>
</template>

<style scoped>
.planner {
  /* how far down the panels start, clear of the top bar (one row; two on phones) */
  --top-clear: calc(66px + env(safe-area-inset-top, 0px));
  position: relative;
  height: 100vh;
  /* dvh = visible area on mobile (100vh includes the space under the browser toolbars) */
  height: 100dvh;
  overflow: hidden;
}
.planner > .planner-stage {
  position: absolute;
  inset: 0;
}
.library {
  position: absolute;
  top: var(--top-clear);
  right: 14px;
  /* leaves the ? button below it showing */
  bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  z-index: 2;
  width: 288px;
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
.library.collapsed {
  transform: translateX(calc(100% + 14px));
  opacity: 0;
}
/* Narrow screens: the top bar takes two rows */
@media (max-width: 871px) {
  .planner {
    --top-clear: calc(106px + env(safe-area-inset-top, 0px));
  }
}
/* Phones: the furniture panel spans the width */
@media (max-width: 720px) {
  .library {
    left: 10px;
    right: 10px;
    bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    width: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .library {
    transition: none;
  }
}
</style>
