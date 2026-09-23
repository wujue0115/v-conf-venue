<script setup lang="ts">
import PlannerSidebar from '@/components/planner/PlannerSidebar.vue'
import VenueStage from '@/components/planner/VenueStage.vue'
import { provideVenueEditor } from '@/composables/useVenueEditor'

provideVenueEditor()
</script>

<template>
  <div class="planner">
    <PlannerSidebar />
    <VenueStage />
  </div>
</template>

<style scoped>
.planner {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  height: 100vh;
}
</style>
