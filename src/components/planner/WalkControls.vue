<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'

/**
 * While walking through the venue: who as, first or third person, a way to leave, and on
 * touch screens a stick to walk with (dragging the stage turns the view)
 */

const store = usePlannerStore()
const editor = useVenueEditor()
const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false

const title = computed(() => {
  const w = store.walk
  if (!w) return ''
  return w.name === null ? t().walk.virtual : t().walk.as(w.name || t().walk.someone)
})

/** How far the knob may leave the stick's centre, in pixels: that far is full speed */
const REACH = 40
const knob = shallowRef({ x: 0, y: 0 })
let stickId: number | null = null
let centre = { x: 0, y: 0 }

function stickDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  stickId = e.pointerId
  const r = el.getBoundingClientRect()
  centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  stickMove(e)
}
function stickMove(e: PointerEvent) {
  if (e.pointerId !== stickId) return
  let x = e.clientX - centre.x
  let y = e.clientY - centre.y
  const d = Math.hypot(x, y)
  if (d > REACH) {
    x *= REACH / d
    y *= REACH / d
  }
  knob.value = { x, y }
  editor.value?.setWalkStick(x / REACH, -y / REACH)
}
function stickUp(e: PointerEvent) {
  if (e.pointerId !== stickId) return
  stickId = null
  knob.value = { x: 0, y: 0 }
  editor.value?.setWalkStick(0, 0)
}
</script>

<template>
  <template v-if="store.walk">
    <div class="chip" data-stage-ui>
      <span class="name">{{ title }}</span>
      <div class="seg" role="group">
        <button
          type="button"
          :class="{ on: !store.walk.third }"
          :aria-pressed="!store.walk.third"
          @click="editor?.setWalkView(false)"
        >
          {{ t().walk.first }}
        </button>
        <button
          type="button"
          :class="{ on: store.walk.third }"
          :aria-pressed="store.walk.third"
          @click="editor?.setWalkView(true)"
        >
          {{ t().walk.third }}
        </button>
      </div>
      <button type="button" class="leave" @click="editor?.endWalk()">{{ t().walk.leave }}</button>
    </div>
    <p class="hint">{{ touch ? t().walk.touchHint : t().walk.hint }}</p>
    <div
      v-if="touch"
      class="stick"
      data-stage-ui
      role="application"
      :aria-label="t().walk.stick"
      @pointerdown="stickDown"
      @pointermove="stickMove"
      @pointerup="stickUp"
      @pointercancel="stickUp"
    >
      <span class="knob" :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"></span>
    </div>
  </template>
</template>

<style scoped>
.chip {
  position: absolute;
  left: 50%;
  top: var(--top-clear, 66px);
  z-index: 3;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 28px);
  padding: 5px 6px 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-glass);
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 14px var(--shadow);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.seg {
  display: flex;
  flex: none;
  padding: 2px;
  border-radius: 999px;
  background: var(--sunken);
}
.seg button,
.leave {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.seg button.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px var(--shadow);
}
.leave {
  flex: none;
  background: var(--ink);
  color: var(--surface);
  font-weight: 700;
}
.seg button:focus-visible,
.leave:focus-visible {
  outline: 2px solid var(--yel, #edb32a);
  outline-offset: 2px;
}
.hint {
  position: absolute;
  left: 50%;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 2;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-glass);
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  pointer-events: none;
}
.stick {
  position: absolute;
  left: 22px;
  bottom: calc(52px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border: 1.5px solid var(--control-line);
  border-radius: 50%;
  background: var(--surface-glass);
  box-shadow: 0 4px 14px var(--shadow);
  touch-action: none;
}
.knob {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--ink);
  opacity: 0.75;
  pointer-events: none;
}
</style>
