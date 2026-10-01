<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { computed } from 'vue'
import { FURNITURE_GROUPS, priceOf, type FurnitureType } from '@/venue/furniture'
import { nameOf, sizeOf, t } from '@/i18n'

const editor = useVenueEditor()
const store = usePlannerStore()
const thumbs = useFurnitureThumbnails()

const sections = computed(() =>
  FURNITURE_GROUPS.map((g) => ({
    id: g.id,
    title: t().groups[g.id],
    tiles: g.types.map((type) => {
      const price = priceOf(type)
      return {
        type,
        name: nameOf(type),
        size: sizeOf(type),
        price: price && `$${price[0]} / $${price[1]}`,
      }
    }),
  })),
)

function onPointerDown(e: PointerEvent, type: FurnitureType) {
  // placing a kind that is hidden (設定 → 物件顯示) shows it again, or it would vanish on drop
  if (store.editing && store.hiddenTypes.includes(type)) {
    store.setTypesVisible([type], true)
    store.notify(t().palette.reshown(nameOf(type)))
  }
  editor.value?.startPlace(e, type)
}
</script>

<template>
  <p v-if="!store.editing" class="locked">
    {{ store.readOnly ? t().palette.readOnly : t().palette.locked }}
  </p>
  <CollapsibleSection
    v-for="sec in sections"
    :key="sec.id"
    :title="sec.title"
    :storage-key="`vueconf26-palette-${sec.id}-collapsed`"
  >
    <div class="palette" :class="{ off: !store.editing }" :inert="!store.editing">
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
.locked {
  margin: 0 4px 10px;
  padding: 8px 10px;
  border: 1px solid rgba(237, 179, 42, 0.45);
  border-radius: 8px;
  background: #fdf7e6;
  font-size: 12px;
  color: #8a6a1c;
}
.palette.off {
  opacity: 0.45;
  filter: grayscale(0.4);
}
.palette.off .tile {
  cursor: default;
}
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
