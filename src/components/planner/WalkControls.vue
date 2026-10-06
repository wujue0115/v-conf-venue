<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'

/**
 * While walking through the venue: who as, first or third person, a way to leave, a mark in the
 * middle while the mouse turns the view, and on touch screens a stick to walk with (dragging
 * the stage turns the view)
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
const REACH = 55
/**
 * Pushed on up past forward, onto the 跑步 mark above the stick (this many pixels from its
 * middle, and no more than RUN_ANGLE radians off straight up), the walk becomes a run
 */
const RUN_FROM = 100
const RUN_ANGLE = 0.6
const knob = shallowRef({ x: 0, y: 0 })
/** The mark above the stick: hidden, showing (pushed forward, a run within reach), or running */
const run = shallowRef<'off' | 'near' | 'on'>('off')
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
  // how far off straight up the finger is
  const off = Math.abs(Math.atan2(x, -y))
  run.value = off > RUN_ANGLE ? 'off' : d >= RUN_FROM ? 'on' : -y >= REACH * 0.7 ? 'near' : 'off'
  if (d > REACH) {
    x *= REACH / d
    y *= REACH / d
  }
  knob.value = { x, y }
  editor.value?.setWalkStick(x / REACH, -y / REACH)
  editor.value?.setWalkRun(run.value === 'on')
}
function stickUp(e: PointerEvent) {
  if (e.pointerId !== stickId) return
  stickId = null
  knob.value = { x: 0, y: 0 }
  run.value = 'off'
  editor.value?.setWalkStick(0, 0)
  editor.value?.setWalkRun(false)
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
    <!-- beside a free seat, or sitting: F does the same -->
    <button
      v-if="store.walk.canSit || store.walk.seated"
      type="button"
      class="sit"
      :class="{ touch }"
      data-stage-ui
      @click="editor?.toggleSit()"
    >
      {{ store.walk.seated ? t().walk.stand : t().walk.sit }}
      <kbd v-if="!touch">F</kbd>
    </button>
    <!-- touch screens: Space's jump, across from the stick (on press, not on release) -->
    <button
      v-if="touch && !store.walk.seated"
      type="button"
      class="jump"
      data-stage-ui
      :aria-label="t().walk.jump"
      @pointerdown.prevent="editor?.jump()"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 19V6M6 11l6-6 6 6" />
      </svg>
      <span>{{ t().walk.jump }}</span>
    </button>
    <p class="hint" :class="{ touch }">
      {{ touch ? t().walk.touchHint : store.walk.mouseLook ? t().walk.hint : t().walk.freeHint }}
    </p>
    <!-- where the locked mouse looks -->
    <span v-if="store.walk.mouseLook" class="aim" aria-hidden="true"></span>
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
      <!-- above the stick once it's pushed forward: slide on up onto it to run -->
      <span v-if="run !== 'off'" class="run" :class="{ on: run === 'on' }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M6 13l6-6 6 6M6 19l6-6 6 6" />
        </svg>
        {{ t().walk.run }}
      </span>
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
.sit {
  position: absolute;
  left: 50%;
  bottom: calc(52px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--yel);
  color: var(--on-yel);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 4px 14px var(--shadow);
  cursor: pointer;
}
/* touch screens: in reach of the right thumb, clear of the stick on the left */
.sit.touch {
  left: auto;
  right: 22px;
  bottom: calc(140px + env(safe-area-inset-bottom, 0px));
  height: 48px;
  transform: none;
}
/* its bottom level with the stick's, for the right thumb */
.jump {
  position: absolute;
  right: 30px;
  bottom: calc(52px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 72px;
  height: 72px;
  border: 1.5px solid var(--control-line);
  border-radius: 50%;
  background: var(--surface-glass);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 4px 14px var(--shadow);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.jump:active {
  background: var(--hover);
  transform: scale(0.95);
}
.jump svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sit kbd {
  padding: 1px 6px;
  border: 1px solid currentColor;
  border-radius: 5px;
  font: 600 11px/1.4 var(--mono);
  opacity: 0.75;
}
.sit:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
/* touch screens: under the chip, clear of the stick and the buttons at the bottom */
.hint.touch {
  top: calc(var(--top-clear, 66px) + 46px);
  bottom: auto;
  white-space: nowrap;
}
.aim {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  background:
    linear-gradient(#fff, #fff) center / 2px 100% no-repeat,
    linear-gradient(#fff, #fff) center / 100% 2px no-repeat;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
  pointer-events: none;
}
.stick {
  position: absolute;
  left: 22px;
  bottom: calc(52px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: grid;
  place-items: center;
  width: 150px;
  height: 150px;
  border: 1.5px solid var(--control-line);
  border-radius: 50%;
  background: var(--surface-glass);
  box-shadow: 0 4px 14px var(--shadow);
  touch-action: none;
}
.run {
  position: absolute;
  left: 50%;
  /* clear of the knob pushed to the rim */
  bottom: calc(100% + 22px);
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 14px 0 10px;
  border: 1.5px solid var(--control-line);
  border-radius: 999px;
  background: var(--surface-glass);
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 14px var(--shadow);
  transform: translateX(-50%);
  pointer-events: none;
  transition:
    background 0.12s,
    color 0.12s,
    transform 0.12s;
}
.run svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.run.on {
  border-color: transparent;
  background: var(--yel);
  color: var(--on-yel);
  transform: translateX(-50%) scale(1.08);
}
.knob {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--ink);
  opacity: 0.75;
  pointer-events: none;
}
</style>
