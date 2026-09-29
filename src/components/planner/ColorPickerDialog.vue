<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { ChromePicker, tinycolor } from 'vue-color'
import 'vue-color/style.css'
import { t } from '@/i18n'

/*
 * Picking a colour: a small window with vue-color's ChromePicker (instead of the browser's
 * own picker, which is awkward on phones) and 取消 / 確定. `open()` resolves with the chosen
 * #rrggbb, or null when it was cancelled (取消, Esc or a click outside).
 */

const dialog = useTemplateRef('dialog')
const color = shallowRef('#000000')
let settle: ((c: string | null) => void) | null = null

function open(initial: string): Promise<string | null> {
  settle?.(null)
  color.value = initial
  dialog.value?.showModal()
  return new Promise((resolve) => (settle = resolve))
}

function finish(c: string | null) {
  const s = settle
  settle = null
  dialog.value?.close()
  s?.(c)
}
/** 確定: the colour as lower-case #rrggbb, whatever form the picker last gave it in */
const confirm = () => finish(tinycolor(color.value).toHexString().toLowerCase())

/** A click on the backdrop (the dialog itself, outside its panel) cancels */
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) finish(null)
}

defineExpose({ open })
</script>

<template>
  <!-- closing any other way (Esc) cancels too -->
  <dialog
    ref="dialog"
    class="picker"
    :aria-label="t().customColour"
    @click="onDialogClick"
    @close="finish(null)"
  >
    <div class="panel">
      <ChromePicker v-model="color" disable-alpha :formats="['hex', 'rgb', 'hsl']" />
      <div class="foot">
        <button class="txt" type="button" @click="finish(null)">
          {{ t().colourRow.cancel }}
        </button>
        <button class="txt ok" type="button" @click="confirm">{{ t().colourRow.ok }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.picker {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.picker::backdrop {
  background: rgba(31, 33, 38, 0.25);
}
.panel {
  padding: 12px;
}
/* the picker fills the window, wide enough for a thumb on its fields and sliders */
.panel :deep(.vc-chrome-picker) {
  width: min(260px, calc(100vw - 56px));
  box-shadow: none;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.txt {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.txt.ok {
  border-color: transparent;
  background: var(--yel);
  color: var(--ink);
  font-weight: 600;
}
</style>
