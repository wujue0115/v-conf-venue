<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import SectionTitle from './SectionTitle.vue'
import { usePlannerStore } from '@/stores/planner'
import { MAX_SLOTS, formatNT, type PriceMode } from '@/venue/layout'

const store = usePlannerStore()
const { items, cost, priceMode, slots, fixedSeats } = storeToRefs(store)

const PRICE_MODES: { mode: PriceMode; label: string }[] = [
  { mode: 0, label: '自助搬運' },
  { mode: 1, label: '含搬運' },
]

const note = computed(
  () =>
    `${priceMode.value ? '含搬運' : '自助搬運'} · ${slots.value} 個時段 · A2 固定座椅 ${fixedSeats.value} 席不計費`,
)

function onSlotsInput(e: Event) {
  store.setSlots(+(e.target as HTMLInputElement).value)
}
</script>

<template>
  <SectionTitle title="目前配置" :note="`${items.length} 件`" />
  <div class="opts">
    <div class="grp">
      <button
        v-for="p in PRICE_MODES"
        :key="p.mode"
        class="btn"
        :class="{ on: priceMode === p.mode }"
        @click="priceMode = p.mode"
      >
        {{ p.label }}
      </button>
    </div>
    <label class="arr"
      >時段 <input type="number" min="1" :max="MAX_SLOTS" :value="slots" @input="onSlotsInput"
    /></label>
  </div>

  <div class="counts">
    <div v-for="l in cost.lines" :key="l.type" class="crow">
      <span
        >{{ l.name }} <em>× {{ l.count }}</em></span
      >
      <em>{{ formatNT(l.subtotal) }}</em>
    </div>
    <div v-if="!cost.lines.length" class="empty">尚未擺放物件，從上方拖曳到場地。</div>
  </div>

  <div class="sumbox">
    <div>
      <span>租借總金額</span><b>{{ formatNT(cost.total) }}</b>
    </div>
    <i>{{ note }}</i>
  </div>
</template>

<style scoped>
.opts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 2px 10px;
  flex-wrap: wrap;
}
.opts .grp {
  box-shadow: none;
}
.opts .btn {
  height: 26px;
  font-size: 12px;
  padding: 0 9px;
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
.counts {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.crow {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px;
  border-radius: 6px;
}
.crow:nth-child(odd) {
  background: var(--paper);
}
.crow em {
  font: 500 12px var(--mono);
  font-style: normal;
}
.crow span em {
  color: var(--faint);
  margin-left: 4px;
}
.empty {
  font-size: 12.5px;
  color: var(--faint);
  padding: 4px 6px;
}
.sumbox {
  margin-top: 12px;
  background: #fdf7e6;
  border: 1px solid rgba(237, 179, 42, 0.45);
  border-radius: 10px;
  padding: 12px 12px 10px;
}
.sumbox div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.sumbox span {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--muted);
}
.sumbox b {
  font: 600 19px var(--mono);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.sumbox i {
  display: block;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(237, 179, 42, 0.45);
  font-style: normal;
  font-size: 11px;
  color: #8a6a1c;
}
</style>
