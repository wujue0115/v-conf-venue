<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { FURNITURE } from '@/venue/furniture'
import { formatNT } from '@/venue/layout'

const store = usePlannerStore()
const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const cols = shallowRef(5)
const rows = shallowRef(4)
const dx = shallowRef(1)
const dz = shallowRef(1)

const sel = computed(() => store.selection)
const def = computed(() => (sel.value ? FURNITURE[sel.value.type] : null))
const title = computed(() =>
  def.value ? `${def.value.name} · ${formatNT(def.value.price[store.priceMode])}` : '',
)
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
  <div v-if="sel" class="sel" data-stage-ui>
    <div class="who">
      <img :src="thumbs[sel.type]" alt="" />
      <div>
        <b>{{ title }}</b
        ><i>{{ position }}</i>
      </div>
    </div>
    <div class="sep"></div>
    <button class="btn" @click="rotate(15)">⟲ 15° <kbd>Q</kbd></button>
    <button class="btn" @click="rotate(-15)">⟳ 15° <kbd>E</kbd></button>
    <button class="btn" @click="rotate(-90)">90° <kbd>R</kbd></button>
    <div class="sep"></div>
    <button class="btn" @click="editor?.duplicate()">複製 <kbd>⌘D</kbd></button>
    <div class="sep"></div>
    <div class="arr">
      陣列 <input v-model.number="cols" type="number" min="1" title="每排數量" />×<input
        v-model.number="rows"
        type="number"
        min="1"
        title="排數"
      />
      間距 <input v-model.number="dx" type="number" step="0.05" title="左右間距 m" />/<input
        v-model.number="dz"
        type="number"
        step="0.05"
        title="前後間距 m"
      />
      m <button class="btn gen" @click="generate">產生</button>
    </div>
    <div class="sep"></div>
    <button class="btn danger" @click="editor?.remove()">刪除 <kbd>Del</kbd></button>
  </div>
</template>

<style scoped>
.sel {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100% - 28px);
}
.who {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 2px;
}
.who img {
  width: 40px;
  height: 30px;
  object-fit: contain;
  background: var(--paper);
  border-radius: 6px;
}
.who b {
  font-size: 14px;
}
.who i {
  display: block;
  font: 500 10.5px var(--mono);
  font-style: normal;
  color: var(--faint);
}
.sep {
  width: 1px;
  align-self: stretch;
  background: #eee9de;
}
.arr {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.arr input {
  width: 44px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: 500 12px var(--mono);
  padding: 0 4px;
  text-align: center;
  background: var(--paper);
}
.arr input:focus {
  outline: 2px solid var(--yel);
  border-color: transparent;
}
.gen {
  background: var(--paper);
}
</style>
