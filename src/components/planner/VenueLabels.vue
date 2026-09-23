<script setup lang="ts">
import { watch, type ComponentPublicInstance } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { FACILITIES, FACILITY_OFFSET, ROOMS } from '@/venue/places'
import type { LabelAnchor } from '@/venue/VenueEditor'

const editor = useVenueEditor()

// Label order matters: earlier labels win when two overlap on screen.
const roomEls: HTMLElement[] = []
const facEls: HTMLElement[] = []
const setEl =
  (list: HTMLElement[], i: number) => (el: Element | ComponentPublicInstance | null) => {
    if (el instanceof HTMLElement) list[i] = el
  }

watch(
  editor,
  (ed) => {
    if (!ed) return
    const anchors: LabelAnchor[] = [
      ...ROOMS.flatMap((r, i) =>
        roomEls[i] ? [{ el: roomEls[i], pos: r.pos, offset: r.offset }] : [],
      ),
      ...FACILITIES.flatMap((f, i) =>
        facEls[i] ? [{ el: facEls[i], pos: f.pos, offset: FACILITY_OFFSET }] : [],
      ),
    ]
    ed.setLabels(anchors)
  },
  { immediate: true },
)
</script>

<template>
  <div class="labels">
    <div v-for="(r, i) in ROOMS" :key="r.id" :ref="setEl(roomEls, i)" class="tag">
      <div class="bx">
        <div class="n">
          <small>{{ r.id }}</small
          >{{ r.name }}
        </div>
        <div class="c">{{ r.cap }}</div>
      </div>
    </div>
    <div v-for="(f, i) in FACILITIES" :key="i" :ref="setEl(facEls, i)" class="tag fac">
      <div class="bx">{{ f.name }}</div>
    </div>
  </div>
</template>

<style scoped>
.labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.tag {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}
.bx {
  background: #fff;
  border: 1.5px solid var(--yel);
  border-radius: 7px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}
.n {
  padding: 4px 10px 3px;
  font-size: 13px;
  font-weight: 700;
}
.n small {
  font: 500 11px var(--mono);
  margin-right: 6px;
  color: var(--ink);
}
.c {
  background: var(--yel);
  padding: 2px 10px;
  font: 500 12px var(--mono);
}
/* leader line + dot pointing at the anchor */
.tag::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1.5px;
  height: 22px;
  background: var(--yel);
  transform: translateX(-50%);
}
.tag::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(100% + 20px);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--yel);
  transform: translateX(-50%);
}
.fac .bx {
  border-radius: 99px;
  background: var(--yel);
  border: none;
  padding: 3px 10px;
  font-size: 11.5px;
  font-weight: 500;
}
.fac::after {
  height: 12px;
}
.fac::before {
  top: calc(100% + 10px);
  width: 5px;
  height: 5px;
}
</style>
