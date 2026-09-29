<script setup lang="ts">
/**
 * The body of a collapsible row: it slides open and shut like the sidebar's sections
 * (CollapsibleSection) and stays mounted, inert while shut.
 */
defineProps<{ open: boolean }>()
</script>

<template>
  <!-- grid-template-rows 1fr ↔ 0fr animates to the content's natural height -->
  <div class="collapse" :class="{ closed: !open }" :inert="!open">
    <div class="inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.28s ease;
}
.collapse.closed {
  grid-template-rows: 0fr;
}
.inner {
  /* no padding here: at 0fr it would stay visible below the clip */
  min-height: 0;
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .collapse {
    transition: none;
  }
}
</style>
