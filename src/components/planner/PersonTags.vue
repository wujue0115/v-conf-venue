<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'

const editor = useVenueEditor()
const layer = useTemplateRef('layer')

// The editor adds and positions one `.ptag` child per tagged person every frame
watch([editor, layer], ([ed, el]) => ed?.setPersonTagLayer(el), { immediate: true })
onBeforeUnmount(() => editor.value?.setPersonTagLayer(null))
</script>

<template>
  <div ref="layer" class="people"></div>
</template>

<style scoped>
.people {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
/* People's tags are green, so they never read as the yellow room / facility labels */
.people :deep(.ptag) {
  position: absolute;
  left: 0;
  top: 0;
  padding: 2px 9px;
  border-radius: 99px;
  background: #42b883;
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
  will-change: transform;
}
/* small pointer toward the head */
.people :deep(.ptag)::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  border: 4px solid transparent;
  border-top-color: #42b883;
  transform: translateX(-50%);
}
</style>
