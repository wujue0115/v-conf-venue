<script setup lang="ts">
import LibraryButton from './LibraryButton.vue'
import ModeSwitch from './ModeSwitch.vue'
import StageHistory from './StageHistory.vue'
import ViewPicker from './ViewPicker.vue'

/**
 * Phones: the tools along the bottom, in reach of a thumb: 復原 / 重做,
 * 檢視 / 編輯 and 多選, the camera views, and the furniture panel. ⚙ and ? are in ☰.
 */
</script>

<template>
  <div class="dock" data-stage-ui>
    <StageHistory docked />
    <ModeSwitch />
    <ViewPicker />
    <LibraryButton />
  </div>
</template>

<style scoped>
.dock {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
</style>
