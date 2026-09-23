<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { FURNITURE, FURNITURE_TYPES, priceOf, type FurnitureType } from '@/venue/furniture'

const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const tiles = FURNITURE_TYPES.map((type) => {
  const { name, size } = FURNITURE[type]
  const price = priceOf(type)
  return { type, name, size, price: price && `$${price[0]} / $${price[1]}` }
})
// Rented from the venue vs. brought by us (not charged)
const sections = [
  { id: 'venue', title: '場地物件', tiles: tiles.filter((t) => t.price) },
  { id: 'own', title: '自備物件', tiles: tiles.filter((t) => !t.price) },
]

function onPointerDown(e: PointerEvent, type: FurnitureType) {
  editor.value?.startPlace(e, type)
}
</script>

<template>
  <CollapsibleSection
    v-for="sec in sections"
    :key="sec.id"
    :title="sec.title"
    :storage-key="`vueconf26-palette-${sec.id}-collapsed`"
  >
    <div class="palette">
      <div
        v-for="t in sec.tiles"
        :key="t.type"
        class="tile"
        :data-type="t.type"
        @pointerdown="onPointerDown($event, t.type)"
      >
        <img :src="thumbs[t.type]" alt="" />
        <b>{{ t.name }}</b>
        <i>{{ t.size }}</i>
        <i v-if="t.price" class="pr">{{ t.price }}</i>
      </div>
    </div>
  </CollapsibleSection>
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
  /* vertical swipes scroll the palette; sideways drags place furniture */
  touch-action: pan-y;
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
