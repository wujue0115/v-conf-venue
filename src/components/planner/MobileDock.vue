<script setup lang="ts">
import LibraryButton from './LibraryButton.vue'
import ModeSwitch from './ModeSwitch.vue'
import StageHistory from './StageHistory.vue'
import ViewPicker from './ViewPicker.vue'

/**
 * Phones: the tools along the bottom, in reach of a thumb: 復原 / 重做,
 * 檢視 / 編輯 / 導覽 as a menu and 多選, the camera views, and the furniture panel. ⚙ and ? are in ☰.
 */
</script>

<template>
  <div class="dock" data-stage-ui>
    <StageHistory docked />
    <ModeSwitch menu />
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
/*
 * Narrow phones: everything in one row still (what floats above the bar expects one), its
 * buttons a little narrower and closer together
 */
@media (max-width: 420px) {
  .dock {
    gap: 4px;
  }
  .dock :deep(.mode-switch) {
    gap: 4px;
  }
  /* the menus keep their names */
  .dock :deep(.grp .btn:not(.current)) {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
}
@media (max-width: 350px) {
  .dock {
    left: 6px;
    right: 6px;
  }
  .dock :deep(.grp .btn:not(.current)) {
    width: 30px;
  }
}
</style>
