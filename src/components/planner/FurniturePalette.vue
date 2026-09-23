<script setup lang="ts">
import SectionTitle from './SectionTitle.vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { FURNITURE, FURNITURE_TYPES, type FurnitureType } from '@/venue/furniture'

const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const tiles = FURNITURE_TYPES.map((type) => {
  const { name, size, price } = FURNITURE[type]
  return { type, name, size, price: `$${price[0]} / $${price[1]}` }
})

function onPointerDown(e: PointerEvent, type: FurnitureType) {
  editor.value?.startPlace(e, type)
}
</script>

<template>
  <SectionTitle title="家具與物件" note="拖曳放置" />
  <div class="palette">
    <div
      v-for="t in tiles"
      :key="t.type"
      class="tile"
      :data-type="t.type"
      @pointerdown="onPointerDown($event, t.type)"
    >
      <img :src="thumbs[t.type]" alt="" />
      <b>{{ t.name }}</b>
      <i>{{ t.size }}</i>
      <i class="pr">{{ t.price }}</i>
    </div>
  </div>
</template>

<style scoped>
.palette {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 22px;
}
.tile {
  border: 1px solid #e6e1d6;
  border-radius: 10px;
  background: var(--paper);
  padding: 6px 6px 8px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.tile:hover {
  border-color: var(--yel);
  box-shadow: 0 0 0 3px rgba(237, 179, 42, 0.18);
}
.tile:active {
  cursor: grabbing;
}
.tile img {
  display: block;
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: contain;
  pointer-events: none;
}
.tile b {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin: 2px 2px 0;
}
.tile i {
  display: block;
  font: 500 10.5px var(--mono);
  font-style: normal;
  color: var(--faint);
  margin: 1px 2px 0;
}
.tile .pr {
  color: #8a6a1c;
}
</style>
