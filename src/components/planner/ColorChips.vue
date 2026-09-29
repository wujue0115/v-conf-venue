<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { t } from '@/i18n'

/*
 * A row of colour chips to pick from, then a custom chip (a colour picker) whose colour joins
 * the row. ✎ opens a small window listing the row one colour a line: drag a line by its grip
 * to reorder, tap it to retune the colour, × to drop it, + to add one, or reset the row. The
 * window edits a draft that only becomes the row on 完成; 取消, Esc or a click outside drop
 * it. Editing the row never recolours anything already coloured.
 */

const props = defineProps<{
  /** The current colour, #rrggbb */
  value: string
  /** Quick picks, in order; anything else shows on the custom chip */
  colors: readonly string[]
  /** What 重設 puts back */
  defaults: readonly string[]
  label: string
}>()
const emit = defineEmits<{
  pick: [color: string]
  /** The row changed: a custom colour joined it, or an edit was confirmed */
  'update:colors': [colors: string[]]
}>()

/** The row as it is being edited in the window, until 完成 */
const draft = shallowRef<string[]>([])
/** Each colour once, the first place it appears */
const once = (list: readonly string[]) => [...new Set(list)]

function openEditor() {
  draft.value = [...props.colors]
  dialog.value?.showModal()
}
/** 完成: the draft becomes the row (when it changed) */
function confirmEdit() {
  if (draft.value.join() !== props.colors.join()) emit('update:colors', once(draft.value))
  dialog.value?.close()
}

const dialog = useTemplateRef('dialog')
const grid = useTemplateRef('grid')
const tuner = useTemplateRef('tuner')

/** A colour from the picker: applied, and added to the row if it's new */
function pickCustom(e: Event) {
  const c = (e.target as HTMLInputElement).value.toLowerCase()
  emit('pick', c)
  if (!props.colors.includes(c)) emit('update:colors', [...props.colors, c])
}

/** + in the editor: a new colour joins the end of the draft (without being applied) */
function addColour(e: Event) {
  const c = (e.target as HTMLInputElement).value.toLowerCase()
  if (!draft.value.includes(c)) draft.value = [...draft.value, c]
}

function remove(i: number) {
  if (draft.value.length > 1) draft.value = draft.value.filter((_, k) => k !== i)
}

/** A click on the backdrop (the dialog itself, outside its panel) cancels, like 取消 */
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close()
}

/** Retuning a chip: the picker opens on its colour, and its choice replaces it in place */
let tuning = -1
function tune(i: number) {
  const input = tuner.value
  if (!input) return
  tuning = i
  input.value = draft.value[i]!
  try {
    input.showPicker()
  } catch {
    input.click()
  }
}
function onTuned(e: Event) {
  if (tuning < 0) return
  const list = [...draft.value]
  list[tuning] = (e.target as HTMLInputElement).value.toLowerCase()
  // a colour the row already has merges into its earlier line
  draft.value = once(list)
  tuning = -1
}

/*
 * Dragging a row by its grip (mouse or touch): it takes the slot of whichever row the pointer
 * is over. Rows are measured by their layout (offsetTop), not their on-screen boxes: those
 * are mid-slide while the list animates a move, and reading them made the row flip back and
 * forth between two slots.
 */
/** The row in hand: its slot, where on it the grip was taken, and its height */
let drag: { i: number; grab: number; h: number } | null = null
/**
 * The draft's order while a drag is under way. The list shows and reorders this copy, and it
 * becomes the draft when the drag ends.
 */
const order = shallowRef<string[] | null>(null)
const shown = computed(() => order.value ?? draft.value)
const dragIndex = shallowRef(-1)
/** The colour being dragged, lifted above the rest */
const lifted = computed(() => order.value?.[dragIndex.value])
/** How far (px) the lifted row is drawn from its slot, so it follows the pointer smoothly */
const follow = shallowRef(0)

/** The pointer's height in the list's own coordinates, scrolled content included */
function listY(e: PointerEvent, box: HTMLElement) {
  return e.clientY - box.getBoundingClientRect().top + box.scrollTop
}

function onGripDown(e: PointerEvent, i: number) {
  const box = grid.value
  const row = (e.currentTarget as HTMLElement).closest<HTMLElement>('.slot')
  if (!box || !row) return
  e.preventDefault()
  drag = { i, grab: listY(e, box) - row.offsetTop, h: row.offsetHeight }
  order.value = [...draft.value]
  dragIndex.value = i
  follow.value = 0
  addEventListener('pointermove', onMove)
  addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onUp)
}
function onMove(e: PointerEvent) {
  const box = grid.value
  if (!drag || !order.value || !box) return
  // slots are measured by layout (offsetTop), not on-screen boxes, which slide while the
  // list animates a move; every slot is the same height, whatever colour is drawn there
  const slots = [...box.querySelectorAll<HTMLElement>('.slot')]
  const first = slots[0]!.offsetTop
  const last = slots[slots.length - 1]!.offsetTop
  // where the row's top would be, kept within the list
  const top = Math.min(last, Math.max(first, listY(e, box) - drag.grab))
  // it takes over a slot once its middle passes into it
  const mid = top + drag.h / 2
  let near = slots.findIndex((el) => mid < el.offsetTop + el.offsetHeight)
  if (near < 0) near = slots.length - 1
  if (near !== drag.i) {
    const list = [...order.value]
    const [c] = list.splice(drag.i, 1)
    list.splice(near, 0, c!)
    order.value = list
    drag.i = dragIndex.value = near
  }
  follow.value = top - slots[near]!.offsetTop
}
function onUp() {
  unlisten()
  const done = order.value
  drag = null
  order.value = null
  dragIndex.value = -1
  // the row eases back into its slot (the transition on .line)
  follow.value = 0
  if (done) draft.value = done
}
function unlisten() {
  removeEventListener('pointermove', onMove)
  removeEventListener('pointerup', onUp)
  removeEventListener('pointercancel', onUp)
}
onBeforeUnmount(unlisten)
</script>

<template>
  <div class="colors" role="radiogroup" :aria-label="label">
    <button
      v-for="c in colors"
      :key="c"
      class="chip"
      :class="{ on: value === c }"
      :style="{ background: c }"
      type="button"
      role="radio"
      :aria-checked="value === c"
      :aria-label="c"
      @click="emit('pick', c)"
    ></button>
    <!-- the colour picker applies on close (change), so dragging through colours isn't one undo step each -->
    <label
      class="chip custom"
      :class="{ on: !colors.includes(value) }"
      :style="colors.includes(value) ? undefined : { background: value }"
      :title="t().customColour"
    >
      <input type="color" :value="value" :aria-label="t().customColour" @change="pickCustom" />
    </label>
    <button
      class="chip tool"
      type="button"
      :title="t().colourRow.edit"
      :aria-label="t().colourRow.edit"
      @click="openEditor"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>

    <dialog ref="dialog" class="editor" :aria-label="t().colourRow.edit" @click="onDialogClick">
      <div class="panel">
        <h3>{{ t().colourRow.edit }}</h3>
        <p>{{ t().colourRow.editHint }}</p>
        <div ref="grid" class="list">
          <TransitionGroup name="chip">
            <!-- the slot is what the list animates between places; the line inside follows the pointer -->
            <div v-for="(c, i) in shown" :key="c" class="slot" :class="{ lifted: lifted === c }">
              <div
                class="line"
                :style="lifted === c ? { transform: `translateY(${follow}px)` } : undefined"
              >
                <!-- the grip is what drags; the rest of the row stays tappable -->
                <span
                  class="grip"
                  :title="t().colourRow.drag"
                  aria-hidden="true"
                  @pointerdown="onGripDown($event, i)"
                >
                  <svg viewBox="0 0 16 16">
                    <circle cx="5.5" cy="3.5" r="1.3" />
                    <circle cx="10.5" cy="3.5" r="1.3" />
                    <circle cx="5.5" cy="8" r="1.3" />
                    <circle cx="10.5" cy="8" r="1.3" />
                    <circle cx="5.5" cy="12.5" r="1.3" />
                    <circle cx="10.5" cy="12.5" r="1.3" />
                  </svg>
                </span>
                <button
                  class="tune"
                  type="button"
                  :aria-label="t().colourRow.tune(c)"
                  :title="t().colourRow.tune(c)"
                  @click="tune(i)"
                >
                  <span class="chip" :style="{ background: c }"></span>
                  <code>{{ c }}</code>
                </button>
                <button
                  class="del"
                  type="button"
                  :disabled="draft.length < 2"
                  :aria-label="t().colourRow.remove(c)"
                  :title="t().colourRow.remove(c)"
                  @click="remove(i)"
                >
                  ×
                </button>
              </div>
            </div>
          </TransitionGroup>
          <label class="line add">
            <span class="chip plus" aria-hidden="true">+</span>
            {{ t().colourRow.add }}
            <input type="color" :aria-label="t().colourRow.add" @change="addColour" />
          </label>
        </div>
        <div class="foot">
          <button class="txt reset" type="button" @click="draft = [...defaults]">
            {{ t().colourRow.reset }}
          </button>
          <button class="txt" type="button" @click="dialog?.close()">
            {{ t().colourRow.cancel }}
          </button>
          <button class="txt done" type="button" @click="confirmEdit">
            {{ t().colourRow.done }}
          </button>
        </div>
        <!-- the picker a tapped chip is retuned with -->
        <input
          ref="tuner"
          class="tuner"
          type="color"
          tabindex="-1"
          aria-hidden="true"
          @change="onTuned"
        />
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.chip {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}
.chip.on {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 4px var(--ink);
}
.chip:focus-visible,
.chip:focus-within {
  outline: 2px solid var(--yel);
  outline-offset: 3px;
}
/* rainbow until a custom colour is chosen */
.custom {
  background: conic-gradient(#f44, #fd4, #4d6, #4bf, #84f, #f4a, #f44);
}
.custom input,
.add input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.tool {
  display: grid;
  place-items: center;
  background: #fff;
  color: var(--muted);
}
.tool:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.tool svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The editing window */
.editor {
  width: min(320px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.editor::backdrop {
  background: rgba(31, 33, 38, 0.25);
}
.panel {
  position: relative;
  padding: 14px 16px 16px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
p {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--faint);
}
.list {
  /* the rows' offsetParent, so their offsetTop is measured from here */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(360px, 60vh);
  overflow-y: auto;
  margin: 0 -6px;
  padding: 0 6px;
}
.line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 4px;
  border-radius: 8px;
  background: #fff;
}
.line:hover {
  background: var(--paper);
}
/* a line eases back into its slot when it is let go */
.slot .line {
  transition: transform 0.18s ease;
}
/* the row in hand: raised above the rest, moved only by the pointer (not by animations) */
.slot.lifted {
  position: relative;
  z-index: 1;
  transition: none;
}
.slot.lifted .line {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  transition: none;
}
.grip {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 30px;
  color: var(--faint);
  cursor: grab;
  /* a drag must not scroll the list on touch */
  touch-action: none;
}
.grip:active {
  cursor: grabbing;
  color: var(--ink);
}
.grip svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
.tune {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.tune:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.tune .chip {
  flex: none;
  cursor: inherit;
}
.tune code {
  font: 500 12px var(--mono);
  color: var(--muted);
}
.del {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--faint);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.del:hover:not(:disabled) {
  background: #fbe9e7;
  color: #a8321f;
}
.del:disabled {
  opacity: 0.3;
  cursor: default;
}
.add {
  position: relative;
  gap: 10px;
  /* line padding + grip + gap + the colour button's padding: its circle sits under theirs */
  padding-left: calc(4px + 20px + 6px + 4px);
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.add:hover {
  color: var(--ink);
}
.plus {
  display: grid;
  place-items: center;
  background: #fff;
  box-shadow: inset 0 0 0 1.5px var(--line);
  font-size: 15px;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.txt {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.txt.reset {
  /* apart from 取消 / 完成, which close the window */
  margin-right: auto;
}
.txt.done {
  border-color: transparent;
  background: var(--yel);
  color: var(--ink);
  font-weight: 600;
}
/* hidden, but able to open its picker near the window */
.tuner {
  position: absolute;
  left: 16px;
  bottom: 16px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.chip-move {
  transition: transform 0.2s ease;
}
@media (prefers-reduced-motion: reduce) {
  .chip-move,
  .slot .line {
    transition: none;
  }
}
</style>
