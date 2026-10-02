<script setup lang="ts">
import { computed } from 'vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { nameOf, t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'
import { isWallItem, onTableOnly } from '@/venue/furniture'

/**
 * Phones, after picking a kind in the palette: where to tap to put it down (the floor, a wall
 * or a table top), with 取消. The camera still moves meanwhile, to find the spot first.
 */

const store = usePlannerStore()
const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const title = computed(() => {
  const type = store.armed
  if (!type) return ''
  const name = nameOf(type)
  if (isWallItem(type)) return t().place.wall(name)
  if (onTableOnly(type)) return t().place.table(name)
  return t().place.floor(name)
})
</script>

<template>
  <div v-if="store.armed" class="place-hint" role="status" data-stage-ui>
    <img v-if="thumbs[store.armed]" :src="thumbs[store.armed]" alt="" />
    <span class="txt">
      <b>{{ title }}</b>
      <i>{{ t().place.hint }}</i>
    </span>
    <button class="cancel" type="button" @click="editor?.armPlace(null)">
      {{ t().place.cancel }}
    </button>
  </div>
</template>

<style scoped>
.place-hint {
  position: absolute;
  left: 10px;
  right: 10px;
  /* above the bottom bar of tools (MobileDock) */
  bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: calc(100% - 20px);
  margin-inline: auto;
  padding: 6px 6px 6px 8px;
  border: 1px solid var(--yel-line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 8px 24px var(--shadow);
}
img {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--yel-soft);
  object-fit: contain;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.txt b {
  font-size: 13px;
  line-height: 1.35;
}
.txt i {
  font-style: normal;
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--muted);
}
.cancel {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  font-size: 13px;
  cursor: pointer;
}
.cancel:hover {
  background: var(--hover);
}
.cancel:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
</style>
