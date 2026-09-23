<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { FURNITURE, priceOf, thumbKey, variantsOf } from '@/venue/furniture'
import { POSTER_PRESETS, readPosterImage, type PosterFit } from '@/venue/poster'
import { formatNT } from '@/venue/layout'
import { BELT_MAX } from '@/venue/stanchions'

const store = usePlannerStore()
const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const cols = shallowRef(5)
const rows = shallowRef(4)
const dx = shallowRef(1)
const dz = shallowRef(1)

const sel = computed(() => store.selection)
const def = computed(() => (sel.value ? FURNITURE[sel.value.type] : null))
const variants = computed(() => (sel.value ? variantsOf(sel.value.type) : []))
const thumb = computed(() =>
  sel.value ? thumbs.value[thumbKey(sel.value.type, sel.value.variant)] : '',
)
const price = computed(() => {
  if (!sel.value) return ''
  const p = priceOf(sel.value.type)
  return p ? formatNT(p[store.priceMode]) : '自備 · 不計費'
})
const position = computed(() => {
  const s = sel.value
  if (!s) return ''
  const xz = `x ${s.x.toFixed(2)} · z ${s.z.toFixed(2)}`
  return s.poster ? `${xz} · 中心離地 ${s.y.toFixed(2)} m` : `${xz} · ${s.deg}°`
})

// Poster size, edited in centimetres
const cm = (m: number) => Math.round(m * 1000) / 10
const pw = shallowRef(0)
const ph = shallowRef(0)
watch(
  () => sel.value?.poster,
  (p) => {
    if (!p) return
    pw.value = cm(p.w)
    ph.value = cm(p.h)
  },
  { immediate: true },
)
const applySize = () => editor.value?.setPosterSize(pw.value / 100, ph.value / 100)
function applyPreset(w: number, h: number) {
  const p = sel.value?.poster
  // keep the poster's current orientation
  if (p && p.w > p.h) editor.value?.setPosterSize(h, w, true)
  else editor.value?.setPosterSize(w, h, true)
}

const fileInput = useTemplateRef('file')
// After picking an image whose proportions differ from the poster, ask how to fit it
const pending = shallowRef<{ url: string; aspect: number } | null>(null)
const fitDialog = useTemplateRef('fitDialog')
const posterAspect = computed(() => {
  const p = sel.value?.poster
  return p ? p.w / p.h : 1
})
/** CSS size of a preview box with the given aspect, fitting inside 120 × 120 */
const box = (aspect: number) =>
  aspect >= 1
    ? { width: '120px', height: `${120 / aspect}px` }
    : { width: `${120 * aspect}px`, height: '120px' }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try {
    const img = await readPosterImage(f)
    if (Math.abs(img.aspect / posterAspect.value - 1) < 0.01) {
      editor.value?.setPosterImage(img.url, img.aspect)
      return
    }
    pending.value = img
    fitDialog.value?.showModal()
  } catch {
    store.notify('無法讀取這張圖片')
  }
}
function chooseFit(fit: PosterFit) {
  const p = pending.value
  if (p) editor.value?.setPosterImage(p.url, p.aspect, fit)
  fitDialog.value?.close()
}

// Reset the array spacing to the furniture's default whenever a different type gets selected
watch(def, (d) => {
  if (!d) return
  dx.value = d.arr[0]
  dz.value = d.arr[1]
})

const rotate = (deg: number) => editor.value?.rotate(deg)
const generate = () =>
  editor.value?.arrayFromSelected({
    cols: cols.value,
    rows: rows.value,
    dx: dx.value,
    dz: dz.value,
  })
</script>

<template>
  <div v-if="sel && def" class="sel" data-stage-ui>
    <div class="head">
      <img :src="thumb" alt="" />
      <div class="meta">
        <div class="title">
          <b>{{ def.name }}</b
          ><span class="price">{{ price }}</span>
        </div>
        <div class="pos">{{ position }}</div>
      </div>
      <button class="btn danger" title="刪除 (Del)" @click="editor?.remove()">刪除</button>
    </div>

    <div class="rows">
      <template v-if="variants.length">
        <span class="lbl">顏色</span>
        <div class="ctl swatches" role="radiogroup" aria-label="顏色">
          <button
            v-for="v in variants"
            :key="v.id"
            class="swatch"
            :class="{ on: sel.variant === v.id }"
            type="button"
            role="radio"
            :aria-checked="sel.variant === v.id"
            @click="editor?.setVariant(v.id)"
          >
            <span class="dot" :style="{ background: v.swatch }"></span>{{ v.name }}
          </button>
        </div>
      </template>

      <template v-if="sel.poster">
        <span class="lbl">尺寸</span>
        <div class="ctl arr">
          <div class="pair" role="group" aria-label="寬 × 高（公分）">
            <input
              v-model.number="pw"
              type="number"
              inputmode="decimal"
              step="1"
              aria-label="寬 cm"
              @change="applySize"
            />
            <button
              class="lock"
              :class="{ on: sel.poster.lock }"
              type="button"
              :title="sel.poster.lock ? '比例已鎖定，點擊解鎖' : '鎖定比例'"
              :aria-label="sel.poster.lock ? '解鎖比例' : '鎖定比例'"
              :aria-pressed="sel.poster.lock"
              @click="editor?.setPosterLock(!sel.poster.lock)"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                <path
                  :d="
                    sel.poster.lock ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0'
                  "
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <input
              v-model.number="ph"
              type="number"
              inputmode="decimal"
              step="1"
              aria-label="高 cm"
              @change="applySize"
            />
            <span class="op">cm</span>
          </div>
          <span class="presets">
            <button
              v-for="p in POSTER_PRESETS"
              :key="p.name"
              class="btn"
              :title="`${cm(p.w)} × ${cm(p.h)} cm`"
              @click="applyPreset(p.w, p.h)"
            >
              {{ p.name }}
            </button>
          </span>
        </div>

        <span class="lbl">圖片</span>
        <div class="ctl">
          <button class="btn" @click="fileInput?.click()">
            {{ sel.poster.hasImage ? '更換圖片' : '上傳圖片' }}
          </button>
          <button v-if="sel.poster.hasImage" class="btn" @click="editor?.setPosterImage(null)">
            移除
          </button>
          <button class="btn dup" title="複製 (⌘D)" @click="editor?.duplicate()">複製</button>
          <input ref="file" type="file" accept="image/*" hidden @change="onFile" />
          <dialog ref="fitDialog" class="fit-dialog" @close="pending = null">
            <template v-if="pending">
              <h3>圖片比例和海報不同</h3>
              <p>要怎麼放這張圖片？</p>
              <div class="choices">
                <button class="choice" type="button" @click="chooseFit('image')">
                  <span class="frame">
                    <img :src="pending.url" alt="" :style="box(pending.aspect)" />
                  </span>
                  <b>照圖片比例</b>
                  <i>海報改成圖片的比例，完整顯示</i>
                </button>
                <button class="choice" type="button" @click="chooseFit('poster')">
                  <span class="frame">
                    <img :src="pending.url" alt="" class="crop" :style="box(posterAspect)" />
                  </span>
                  <b>維持海報比例</b>
                  <i>海報尺寸不變，圖片裁切填滿</i>
                </button>
              </div>
              <button class="btn cancel" type="button" @click="fitDialog?.close()">取消</button>
            </template>
          </dialog>
        </div>
      </template>

      <template v-else>
        <span class="lbl">旋轉</span>
        <div class="ctl">
          <button class="btn" title="逆時針 15° (Q)" @click="rotate(15)">⟲ 15°</button>
          <button class="btn" title="順時針 15° (E)" @click="rotate(-15)">⟳ 15°</button>
          <button class="btn" title="順時針 90° (R)" @click="rotate(-90)">⟳ 90°</button>
          <button class="btn dup" title="複製 (⌘D)" @click="editor?.duplicate()">複製</button>
        </div>

        <span class="lbl">陣列</span>
        <div class="ctl arr">
          <label class="pair" title="每排數量 × 排數">
            <input
              v-model.number="cols"
              type="number"
              inputmode="numeric"
              min="1"
              aria-label="每排數量"
            />
            <span class="op">×</span>
            <input
              v-model.number="rows"
              type="number"
              inputmode="numeric"
              min="1"
              aria-label="排數"
            />
          </label>
          <label class="pair" title="左右 / 前後間距（公尺）">
            <span class="op">間距</span>
            <input
              v-model.number="dx"
              type="number"
              inputmode="decimal"
              step="0.05"
              aria-label="左右間距 m"
            />
            <span class="op">/</span>
            <input
              v-model.number="dz"
              type="number"
              inputmode="decimal"
              step="0.05"
              aria-label="前後間距 m"
            />
            <span class="op">m</span>
          </label>
          <button class="btn gen" @click="generate">產生</button>
        </div>
      </template>

      <template v-if="sel.type === 'stanchion'">
        <span class="lbl">紅帶</span>
        <div class="ctl belt">
          <span class="hint">{{ BELT_MAX }}m 內自動連接，點紅帶可拆除</span>
          <button v-if="sel.cutBelts" class="btn restore" @click="editor?.restoreBelts()">
            恢復 {{ sel.cutBelts }} 條
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sel {
  position: absolute;
  /* centered in the stage, clear of the sidebar on the left and the ? button on the right */
  left: calc(var(--stage-inset, 0px) + 14px);
  right: 62px;
  width: fit-content;
  max-width: calc(100% - var(--stage-inset, 0px) - 76px);
  margin-inline: auto;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
  padding: 10px 12px 12px;
}

/* Header: thumbnail, name + price, position, delete */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eee9de;
}
.head img {
  flex: none;
  width: 44px;
  height: 33px;
  object-fit: contain;
  background: var(--paper);
  border-radius: 6px;
}
.meta {
  flex: 1;
  min-width: 0;
}
.title,
.pos {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title b {
  font-size: 14px;
}
.price {
  margin-left: 8px;
  font: 500 12px var(--mono);
  color: #8a6a1c;
}
.pos {
  font: 500 10.5px var(--mono);
  color: var(--faint);
}

/* Labelled control rows share one label column so everything lines up */
.rows {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px 12px;
}
.lbl {
  /* matches the 30px controls so the label sits on the first line when a row wraps */
  line-height: 30px;
  font-size: 12px;
  color: var(--faint);
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.ctl .btn {
  background: var(--paper);
}
.ctl .btn:hover {
  background: #f0ece2;
}
.dup {
  margin-left: auto;
}
.arr {
  gap: 6px 10px;
  font-size: 12px;
  color: var(--muted);
}
.pair {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.op {
  color: var(--faint);
}
.arr input {
  width: 46px;
  height: 30px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: 500 12px var(--mono);
  font-variant-numeric: tabular-nums;
  text-align: center;
  /* no spinner arrows: they ate the space and clipped values like 1.85 */
  appearance: textfield;
  -moz-appearance: textfield;
}
.arr input::-webkit-inner-spin-button,
.arr input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.arr input:focus {
  outline: 2px solid var(--yel);
  border-color: transparent;
}
.ctl .gen {
  margin-left: auto;
  background: var(--yel);
  color: #fff;
  font-weight: 600;
}
.ctl .gen:hover {
  background: #e3a817;
}
.fit-dialog {
  width: min(380px, calc(100vw - 32px));
  padding: 18px 18px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.18);
}
.fit-dialog::backdrop {
  background: rgba(31, 33, 38, 0.35);
}
.fit-dialog h3 {
  margin: 0;
  font-size: 15px;
}
.fit-dialog p {
  margin: 4px 0 14px;
  font-size: 12.5px;
  color: var(--muted);
}
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.choice:hover,
.choice:focus-visible {
  outline: none;
  border-color: var(--yel);
  box-shadow: 0 0 0 3px rgba(237, 179, 42, 0.18);
}
.frame {
  display: grid;
  place-items: center;
  width: 120px;
  height: 120px;
  margin-bottom: 4px;
}
.frame img {
  display: block;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}
.frame img.crop {
  object-fit: cover;
}
.choice b {
  font-size: 13px;
}
.choice i {
  font-style: normal;
  font-size: 11px;
  color: var(--faint);
}
.cancel {
  display: block;
  margin: 12px 0 0 auto;
}
.lock {
  width: 26px;
  height: 26px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.lock:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.lock.on {
  color: #8a6a1c;
  background: #fdf7e6;
  border-color: rgba(237, 179, 42, 0.45);
}
.lock:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.presets {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.swatches {
  gap: 6px;
}
.swatch {
  height: 30px;
  padding: 0 10px 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
.swatch:hover {
  background: var(--paper);
}
.swatch.on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.swatch:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.hint {
  font-size: 12px;
  line-height: 30px;
  color: var(--muted);
}
.restore {
  margin-left: auto;
}

/* Phones: a full-width sheet pinned above the bottom edge */
@media (max-width: 720px) {
  .sel {
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-width: none;
    padding: 8px 10px 10px;
  }
  .head {
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .rows {
    gap: 6px 8px;
  }
  .ctl .btn {
    padding: 0 8px;
  }
  .arr {
    gap: 6px;
  }
  .arr input {
    width: 40px;
  }
}
</style>
