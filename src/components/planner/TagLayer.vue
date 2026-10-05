<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import type { TagKind } from '@/venue/VenueEditor'

const editor = useVenueEditor()
const layer = useTemplateRef('layer')

/*
 * Zones' and items' tags share this one layer, so an open note can rise above every other
 * row (see layoutTags) while the layer as a whole stays under the stage's toolbars.
 */
const KINDS: TagKind[] = ['zone', 'item']
// The editor adds and positions one child per tagged object every frame
watch([editor, layer], ([ed, el]) => KINDS.forEach((k) => ed?.setTagLayer(k, el)), {
  immediate: true,
})
onBeforeUnmount(() => KINDS.forEach((k) => editor.value?.setTagLayer(k, null)))
</script>

<template>
  <div ref="layer" class="tags"></div>
</template>

<style scoped>
.tags {
  position: absolute;
  inset: 0;
  /* its own stacking context: rows are ordered inside it, never above the stage's UI */
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
/* one row per item: its tag pill, then its ⓘ button; the editor moves the row every frame */
.tags :deep(.trow) {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  will-change: transform;
}
.tags :deep([hidden]) {
  display: none !important;
}
.tags :deep(.ptag),
.tags :deep(.ztag) {
  position: relative;
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
/* the ⓘ button and its note are the only parts of the layer that take the pointer */
.tags :deep(.tinfo) {
  pointer-events: auto;
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  /* without a tag: a quiet grey outline and icon, a light grey fill on hover */
  border: 1.5px solid var(--control-line);
  border-radius: 50%;
  background: var(--surface-glass);
  color: var(--muted, #5d6068);
  font:
    italic 700 12px/1 Georgia,
    'Times New Roman',
    serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}
.tags :deep(.tinfo:hover) {
  background: var(--hover);
}
/*
 * Beside a tag, the ⓘ and its note take the tag's colour (--ti, darkened when pale) for their
 * outline and text, over white that tints to a light shade of the tag on hover
 */
.tags :deep(.trow.tagged .tinfo) {
  border: 1.5px solid var(--ti);
  background: var(--surface);
  color: var(--ti);
}
.tags :deep(.trow.tagged .tinfo:hover) {
  border-color: var(--ti);
  background: color-mix(in srgb, var(--tc) 22%, var(--surface));
  color: var(--ti);
}
.tags :deep(.trow.tagged .tbox) {
  border: 1.5px solid var(--ti);
  background: color-mix(in srgb, var(--tc) 12%, var(--surface));
}
.tags :deep(.tinfo:focus-visible) {
  outline: 2px solid var(--yel, #edb32a);
  outline-offset: 2px;
}
/* the 👁 over a 人員's head: walk as them */
.tags :deep(.teye) {
  pointer-events: auto;
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1.5px solid var(--control-line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 2px 8px var(--shadow);
  cursor: pointer;
  will-change: transform;
}
.tags :deep(.teye svg) {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}
.tags :deep(.teye:hover) {
  background: var(--hover);
}
.tags :deep(.teye:focus-visible) {
  outline: 2px solid var(--yel, #edb32a);
  outline-offset: 2px;
}
/* the note opens above the row, centred on the ⓘ (the editor sets its left) */
.tags :deep(.tbox) {
  pointer-events: auto;
  position: absolute;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border: 1px solid var(--line, #e4dfd3);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink, #1f2126);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
}
</style>
