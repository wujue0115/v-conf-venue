<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { t } from '@/i18n'

/*
 * 輸出圖片: a window with a preview of the picture (the whole building from the current viewing
 * direction), the padding round it, and 下載. The preview is drawn smaller and redrawn a moment
 * after the padding changes; the download is drawn at full size.
 */

const props = defineProps<{
  /** File name for the download, without the extension */
  name: () => string
}>()

const editor = useVenueEditor()
const dialog = useTemplateRef('dialog')
const PADDING_MAX = 400
/** The preview's building, in pixels along its longer side */
const PREVIEW_SIZE = 900

/** Space (px) left round the building, kept between openings */
const padding = shallowRef(40)
const preview = shallowRef('')
const size = shallowRef<{ width: number; height: number } | null>(null)

const pad = computed(() => Math.min(PADDING_MAX, Math.max(0, Math.round(padding.value) || 0)))

function draw() {
  const ed = editor.value
  if (!ed) return
  preview.value = ed.exportImage({ padding: pad.value, size: PREVIEW_SIZE })
  size.value = ed.imageSize(pad.value)
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(pad, () => {
  if (!dialog.value?.open) return
  clearTimeout(timer)
  timer = setTimeout(draw, 150)
})
onBeforeUnmount(() => clearTimeout(timer))

function open() {
  dialog.value?.showModal()
  draw()
}

function download() {
  const url = editor.value?.exportImage({ padding: pad.value })
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.name()}.png`
  a.click()
  dialog.value?.close()
}

/** A click on the backdrop (the dialog itself, outside its panel) closes it */
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close()
}

function onClose() {
  clearTimeout(timer)
  padding.value = pad.value
  preview.value = ''
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="export"
    :aria-label="t().imageExport.title"
    @click="onDialogClick"
    @close="onClose"
  >
    <div class="panel">
      <h3>{{ t().imageExport.title }}</h3>
      <p class="hint">{{ t().imageExport.hint }}</p>
      <div class="frame">
        <img v-if="preview" :src="preview" :alt="t().imageExport.preview" />
      </div>
      <div class="row">
        <label class="pad">
          <span>{{ t().imageExport.padding }}</span>
          <input
            v-model.number="padding"
            type="range"
            min="0"
            :max="PADDING_MAX"
            step="10"
            :aria-label="t().imageExport.padding"
          />
          <input
            v-model.number="padding"
            class="num"
            type="number"
            inputmode="numeric"
            min="0"
            :max="PADDING_MAX"
            step="10"
            :aria-label="t().imageExport.padding"
          />
          <span class="unit">px</span>
        </label>
        <span v-if="size" class="size">{{ size.width }} × {{ size.height }} px</span>
      </div>
      <div class="foot">
        <button class="txt" type="button" @click="dialog?.close()">
          {{ t().colourRow.cancel }}
        </button>
        <button class="txt ok" type="button" @click="download">
          {{ t().imageExport.download }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.export {
  width: min(720px, calc(100vw - 28px));
  max-width: none;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.export::backdrop {
  background: var(--backdrop);
}
.panel {
  padding: 14px 16px 16px;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.hint {
  margin: 2px 0 10px;
  font-size: 12px;
  color: var(--faint);
}
/*
 * The picture shown whole, whatever its proportions, on a faint board so its edges read. A flex
 * box (not a grid) so the picture's max-height resolves against the board's fixed height.
 */
.frame {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  height: min(52vh, 420px);
  padding: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--sunken);
}
.frame img {
  display: block;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 12px;
}
.pad {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.pad input[type='range'] {
  width: 140px;
  accent-color: var(--yel);
}
.num {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  font: inherit;
  font-size: 13px;
  text-align: right;
}
.num:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.unit,
.size {
  font-size: 12px;
  color: var(--faint);
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.txt {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.txt.ok {
  border-color: transparent;
  background: var(--yel);
  color: var(--on-yel);
  font-weight: 600;
}
</style>
