<script setup lang="ts">
import { onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useCameraViews } from '@/composables/useCameraViews'
import { t } from '@/i18n'

/**
 * The camera views as one button in the phone's bottom bar: it shows the view last flown to,
 * and lists them all above it
 */

const { views, active, flyTo } = useCameraViews()
const open = shallowRef(false)
const root = useTemplateRef('root')
const listId = useId()

function pick(i: number) {
  flyTo(views[i]!, i)
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
        :title="t().views.pick"
        :aria-label="`${t().views.pick}: ${t().views[views[active]!.key]}`"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listId"
        @click="open = !open"
      >
        <span class="name">{{ t().views[views[active]!.key] }}</span>
        <svg class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
    </div>
    <ul v-if="open" :id="listId" class="list" role="listbox" :aria-label="t().views.pick">
      <li v-for="(v, i) in views" :key="v.key" role="presentation">
        <button
          class="item"
          :class="{ on: active === i }"
          type="button"
          role="option"
          :aria-selected="active === i"
          @click="pick(i)"
        >
          {{ t().views[v.key] }}
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
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
.item {
  display: block;
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
  background: #f4f1ea;
}
.item.on {
  background: var(--yel);
  font-weight: 600;
}
.item:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: -2px;
}
</style>
