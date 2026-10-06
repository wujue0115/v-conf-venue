<script setup lang="ts" generic="K extends string">
import { computed, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'

/**
 * A menu in the phone's bottom bar: one button showing what's chosen, the choices listed above
 * it. An item's icon comes from the `icon` slot (given the item's key), when there is one.
 */

const props = defineProps<{
  /** What it chooses, for its tooltip and screen readers */
  label: string
  items: readonly { key: K; label: string; title?: string; disabled?: boolean }[]
  current: K
}>()
const emit = defineEmits<{ pick: [key: K] }>()
defineSlots<{ icon?: (p: { key: K }) => unknown }>()

const open = shallowRef(false)
const root = useTemplateRef('root')
const listId = useId()
const chosen = computed(() => props.items.find((i) => i.key === props.current))

function pick(key: K) {
  emit('pick', key)
  open.value = false
}

function onPointerDown(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
function unlisten() {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
}
// Light-dismiss: only listen while the list is showing
watch(open, (on) => {
  if (!on) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(unlisten)
</script>

<template>
  <div ref="root" class="picker">
    <div class="grp">
      <button
        class="btn current"
        :class="{ on: open }"
        type="button"
        :title="label"
        :aria-label="`${label}: ${chosen?.label ?? ''}`"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listId"
        @click="open = !open"
      >
        <span v-if="$slots.icon" class="icon"><slot name="icon" :key="current" /></span>
        <span class="name">{{ chosen?.label }}</span>
        <svg class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
    </div>
    <ul v-if="open" :id="listId" class="list" role="listbox" :aria-label="label">
      <li v-for="i in items" :key="i.key" role="presentation">
        <button
          class="item"
          :class="{ on: current === i.key }"
          type="button"
          role="option"
          :aria-selected="current === i.key"
          :title="i.title"
          :disabled="i.disabled"
          @click="pick(i.key)"
        >
          <span v-if="$slots.icon" class="icon"><slot name="icon" :key="i.key" /></span>
          {{ i.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  min-width: 0;
}
.current {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 120px;
  padding: 0 10px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon {
  display: grid;
  flex: none;
}
.icon :deep(svg) {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.chev {
  flex: none;
  color: var(--faint);
}
.chev path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* above the button, since the bar sits at the bottom */
.list {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 10;
  min-width: 150px;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.item:hover {
  background: var(--hover);
}
.item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.item.on {
  background: var(--yel);
  color: var(--on-yel);
  font-weight: 600;
}
.item:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: -2px;
}
/* The narrowest phones: the chosen one's icon stands for it, when it has one */
@media (max-width: 350px) {
  .icon + .name {
    display: none;
  }
}
</style>
