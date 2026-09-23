<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { FURNITURE, thumbKey, variantsOf } from '@/venue/furniture'
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
const price = computed(() => (def.value ? formatNT(def.value.price[store.priceMode]) : ''))
const position = computed(() =>
  sel.value ? `x ${sel.value.x.toFixed(2)} · z ${sel.value.z.toFixed(2)} · ${sel.value.deg}°` : '',
)

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
