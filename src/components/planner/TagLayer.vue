<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import type { TagKind } from '@/venue/VenueEditor'

const props = defineProps<{ kind: TagKind }>()
const editor = useVenueEditor()
const layer = useTemplateRef('layer')

// The editor adds and positions one child per tagged object every frame
watch([editor, layer], ([ed, el]) => ed?.setTagLayer(props.kind, el), { immediate: true })
onBeforeUnmount(() => editor.value?.setTagLayer(props.kind, null))
</script>

<template>
  <div ref="layer" class="tags"></div>
</template>

<style scoped>
.tags {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.tags :deep(.ptag),
.tags :deep(.ztag) {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  will-change: transform;
}

/*
 * Each tag wears its item's colour (--tc) with readable text (--tt), both set per tag by the
 * editor; borders use a slightly darker shade of it. People's tags are pills above the head,
 * zones' sit on a leader line above the zone, like the room labels.
 */
.tags :deep(.ptag) {
  padding: 2px 9px;
  border: 1px solid color-mix(in srgb, var(--tc) 80%, #000);
  border-radius: 99px;
  background: var(--tc);
  color: var(--tt);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.5;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
.tags :deep(.ptag)::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  border: 4px solid transparent;
  border-top-color: color-mix(in srgb, var(--tc) 80%, #000);
  transform: translateX(-50%);
}

/* the leader line's length matches ZONE_TAG_LIFT in the editor */
.tags :deep(.ztag) {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--tc) 80%, #000);
  border-radius: 7px;
  background: var(--tc);
  color: var(--tt);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
}
.tags :deep(.ztag)::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1.5px;
  height: 22px;
  background: var(--tc);
  transform: translateX(-50%);
}
.tags :deep(.ztag)::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(100% + 20px);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tc);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tc) 80%, #000);
  transform: translateX(-50%);
}
</style>
