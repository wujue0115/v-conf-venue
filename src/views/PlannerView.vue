<script setup lang="ts">
import { storeToRefs } from 'pinia'
import PlannerSidebar from '@/components/planner/PlannerSidebar.vue'
import SidebarToggle from '@/components/planner/SidebarToggle.vue'
import VenueStage from '@/components/planner/VenueStage.vue'
import { provideVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'

provideVenueEditor()
const { sidebarCollapsed } = storeToRefs(usePlannerStore())
</script>

<template>
  <!-- The sidebar floats over a full-size stage, so collapsing it never resizes the scene or moves the stage UI -->
  <div class="planner" :class="{ collapsed: sidebarCollapsed }">
    <VenueStage class="planner-stage" />
    <div class="side-panel" data-stage-ui>
      <PlannerSidebar id="planner-sidebar" class="side-inner" :inert="sidebarCollapsed" />
      <SidebarToggle v-model="sidebarCollapsed" class="side-toggle" />
    </div>
  </div>
</template>

<style scoped>
.planner {
  --side-w: 272px;
  /* Stage overlays (toolbars, help, selection bar) stay clear of the sidebar — a
     constant, so toggling the sidebar never moves them */
  --stage-inset: var(--side-w);
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
.side-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: var(--side-w);
  transition: transform 0.25s ease;
}
.collapsed .side-panel {
  transform: translateX(-100%);
}
.side-inner {
  height: 100%;
}
.side-toggle {
  position: absolute;
  top: 50%;
  left: 100%;
  transform: translateY(-50%);
}
/* Phones: the sidebar is a drawer over the stage; overlays use the full width */
@media (max-width: 720px) {
  .planner {
    --stage-inset: 0px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .side-panel {
    transition: none;
  }
}
</style>
