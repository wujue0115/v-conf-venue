<script setup lang="ts">
import { computed, reactive } from 'vue'
import CollapseBody from './CollapseBody.vue'
import { storeToRefs } from 'pinia'
import SectionTitle from './SectionTitle.vue'
import TriCheckbox from './TriCheckbox.vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { priceOf, type FurnitureType } from '@/venue/furniture'
import { MAX_SLOTS, formatNT, type CostLine, type PriceMode } from '@/venue/layout'
import { nameOf, t } from '@/i18n'

const store = usePlannerStore()
const editor = useVenueEditor()
const { items, cost, priceMode, slots, fixedSeats } = storeToRefs(store)

/** Kinds whose list of items is open */
const open = reactive<Partial<Record<FurnitureType, boolean>>>({})

/** One item's rent for the chosen pricing and slots */
const each = (type: FurnitureType) => (priceOf(type)?.[priceMode.value] ?? 0) * slots.value
const lineState = (l: CostLine) =>
  l.billed === l.count ? 'on' : l.billed === 0 ? 'off' : ('some' as const)
/** A ticked box leaves them all out of the total; an empty or partial one counts them all */
const toggleLine = (l: CostLine) => editor.value?.setBilled(lineState(l) !== 'on', l.indices)
const isBilled = (k: number) => !items.value[k]?.unbilled
const toggleItem = (k: number) => editor.value?.setBilled(!isBilled(k), [k])
/** An item in a kind's list: its number, and its tag when it has one */
const itemLabel = (k: number, n: number) => {
  const tag = items.value[k]?.tag
  return tag ? `#${n} · ${tag}` : `#${n}`
}
const goTo = (k: number) => editor.value?.focusItem(k)

const modeName = (m: PriceMode) => (m ? t().summary.carried : t().summary.selfCarry)
const PRICE_MODES = computed(() =>
  ([0, 1] as PriceMode[]).map((mode) => ({ mode, label: modeName(mode) })),
)

const note = computed(() =>
  t().summary.note(modeName(priceMode.value), slots.value, fixedSeats.value),
)

function onSlotsInput(e: Event) {
  store.setSlots(+(e.target as HTMLInputElement).value)
}
</script>

<template>
  <SectionTitle :title="t().summary.title" :note="t().summary.count(items.length)" />
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
      >{{ t().summary.slots }}
      <input type="number" min="1" :max="MAX_SLOTS" :value="slots" @input="onSlotsInput"
    /></label>
  </div>

  <div class="counts">
    <template v-for="l in cost.lines" :key="l.type">
      <!--
        A row is one control: a single item's row goes to it, a kind's row opens its list.
        The checkbox is its own control, so its click stays out of the row's.
      -->
      <div
        v-if="l.count === 1"
        class="crow"
        role="button"
        tabindex="0"
        :title="t().summary.goTo(nameOf(l.type))"
        @click="goTo(l.indices[0]!)"
        @keydown.enter.space.self.prevent="goTo(l.indices[0]!)"
      >
        <TriCheckbox
          :state="lineState(l)"
          :label="t().summary.billed(nameOf(l.type))"
          @click.stop
          @toggle="toggleLine(l)"
        />
        <span class="name">{{ nameOf(l.type) }}</span>
        <em :class="{ off: !l.billed }">{{
          l.billed ? formatNT(l.subtotal) : t().summary.unbilled
        }}</em>
      </div>

      <template v-else>
        <div
          class="crow"
          role="button"
          tabindex="0"
          :aria-expanded="!!open[l.type]"
          @click="open[l.type] = !open[l.type]"
          @keydown.enter.space.self.prevent="open[l.type] = !open[l.type]"
        >
          <TriCheckbox
            :state="lineState(l)"
            :label="t().summary.billed(nameOf(l.type))"
            @click.stop
            @toggle="toggleLine(l)"
          />
          <span class="name">
            {{ nameOf(l.type) }}
            <em>× {{ l.billed === l.count ? l.count : `${l.billed}/${l.count}` }}</em>
            <svg
              class="chev"
              :class="{ closed: !open[l.type] }"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
          <em :class="{ off: !l.billed }">{{
            l.billed ? formatNT(l.subtotal) : t().summary.unbilled
          }}</em>
        </div>
        <CollapseBody :open="!!open[l.type]">
          <div class="kids">
            <div
              v-for="(k, n) in l.indices"
              :key="k"
              class="crow kid"
              role="button"
              tabindex="0"
              :title="t().summary.goTo(itemLabel(k, n + 1))"
              @click="goTo(k)"
              @keydown.enter.space.self.prevent="goTo(k)"
            >
              <TriCheckbox
                :state="isBilled(k) ? 'on' : 'off'"
                :label="t().summary.billed(itemLabel(k, n + 1))"
                @click.stop
                @toggle="toggleItem(k)"
              />
              <span class="name">{{ itemLabel(k, n + 1) }}</span>
              <em :class="{ off: !isBilled(k) }">{{
                isBilled(k) ? formatNT(each(l.type)) : t().summary.unbilled
              }}</em>
            </div>
          </div>
        </CollapseBody>
      </template>
    </template>
    <div v-if="!cost.lines.length" class="empty">{{ t().summary.empty }}</div>
  </div>

  <div class="sumbox">
    <div>
      <span>{{ t().summary.total }}</span
      ><b>{{ formatNT(cost.total) }}</b>
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
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 6px;
}
.crow:hover {
  background: var(--paper);
}
.crow > em {
  margin-left: auto;
  font: 500 12px var(--mono);
  font-style: normal;
  white-space: nowrap;
}
.crow > em.off {
  color: var(--faint);
  font-family: inherit;
}
.crow[role='button'] {
  cursor: pointer;
  user-select: none;
}
.crow[role='button']:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: -2px;
}
.name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}
.name em {
  color: var(--faint);
  font: 500 12px var(--mono);
  font-style: normal;
}
.chev {
  flex: none;
  width: 12px;
  height: 12px;
  fill: none;
  stroke: var(--faint);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.25s ease;
}
.chev.closed {
  transform: rotate(-90deg);
}
.kids {
  margin: 0 0 4px 13px;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.kid {
  font-size: 12.5px;
}
@media (prefers-reduced-motion: reduce) {
  .chev {
    transition: none;
  }
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
