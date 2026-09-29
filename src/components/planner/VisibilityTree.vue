<script setup lang="ts">
import { computed, reactive } from 'vue'
import TriCheckbox from './TriCheckbox.vue'
import { usePlannerStore } from '@/stores/planner'
import { FURNITURE_GROUPS, FURNITURE_TYPES, type FurnitureType } from '@/venue/furniture'
import { nameOf, t } from '@/i18n'
import type { LayoutItem } from '@/venue/layout'

/*
 * Show or hide something (items, their tags or notes) by kind. The root opens into 場地物件
 * and 其他物件, which open into each kind, plus an optional extra switch of its own (the
 * venue's room names under 標籤顯示); a parent's box is ticked, empty, or partial for its
 * children.
 */

const props = defineProps<{
  /** The root row's name */
  root: string
  /** Kinds currently hidden */
  hidden: readonly FurnitureType[]
  /** Which placed items the counts include */
  count: (i: LayoutItem) => boolean
  /** A further on/off row under the root, not tied to a kind of item */
  extra?: { label: string; on: boolean }
}>()
const emit = defineEmits<{
  set: [types: readonly FurnitureType[], on: boolean]
  extra: [on: boolean]
}>()

const store = usePlannerStore()
/** Which branches are open; all start closed */
const open = reactive<Record<string, boolean>>({})

const counts = computed(() => {
  const n = new Map<FurnitureType, number>()
  for (const i of store.items) if (props.count(i)) n.set(i.t, (n.get(i.t) ?? 0) + 1)
  return n
})
const countOf = (types: readonly FurnitureType[]) =>
  types.reduce((s, t) => s + (counts.value.get(t) ?? 0), 0)

function stateOf(types: readonly FurnitureType[]) {
  const hidden = types.filter((t) => props.hidden.includes(t)).length
  return hidden === 0 ? 'on' : hidden === types.length ? 'off' : 'some'
}
/** A ticked box hides all of its kinds; an empty or partial one shows them all */
const toggle = (types: readonly FurnitureType[]) => emit('set', types, stateOf(types) !== 'on')

/** The root counts the extra row as one more child */
const rootState = computed(() => {
  const x = props.extra
  if (!x) return stateOf(FURNITURE_TYPES)
  const hidden = FURNITURE_TYPES.filter((t) => props.hidden.includes(t)).length + (x.on ? 0 : 1)
  return hidden === 0 ? 'on' : hidden === FURNITURE_TYPES.length + 1 ? 'off' : 'some'
})
function toggleRoot() {
  const on = rootState.value !== 'on'
  emit('set', FURNITURE_TYPES, on)
  if (props.extra) emit('extra', on)
}

const groups = computed(() =>
  FURNITURE_GROUPS.map((g) => ({
    ...g,
    title: t().groups[g.id],
    items: g.types.map((type) => ({ type, name: nameOf(type) })),
  })),
)
</script>

<template>
  <div class="tree">
    <div class="node">
      <TriCheckbox :state="rootState" :label="root" @toggle="toggleRoot" />
      <button class="head" type="button" :aria-expanded="!!open.all" @click="open.all = !open.all">
        <b>{{ root }}</b>
        <span class="n">{{ countOf(FURNITURE_TYPES) }}</span>
        <svg class="chev" :class="{ closed: !open.all }" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
    </div>

    <div v-if="open.all" class="kids">
      <label v-if="extra" class="node leaf">
        <TriCheckbox
          :state="extra.on ? 'on' : 'off'"
          :label="extra.label"
          @toggle="emit('extra', !extra.on)"
        />
        <span class="name">{{ extra.label }}</span>
      </label>
      <template v-for="g in groups" :key="g.id">
        <div class="node">
          <TriCheckbox :state="stateOf(g.types)" :label="g.title" @toggle="toggle(g.types)" />
          <button
            class="head"
            type="button"
            :aria-expanded="!!open[g.id]"
            @click="open[g.id] = !open[g.id]"
          >
            <b>{{ g.title }}</b>
            <span class="n">{{ countOf(g.types) }}</span>
            <svg
              class="chev"
              :class="{ closed: !open[g.id] }"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>

        <div v-if="open[g.id]" class="kids">
          <label
            v-for="i in g.items"
            :key="i.type"
            class="node leaf"
            :class="{ none: !counts.get(i.type) }"
          >
            <TriCheckbox :state="stateOf([i.type])" :label="i.name" @toggle="toggle([i.type])" />
            <span class="name">{{ i.name }}</span>
            <span class="n">{{ counts.get(i.type) ?? 0 }}</span>
          </label>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.node {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}
.head {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.head b,
.name {
  font-size: 13px;
  font-weight: 500;
}
.name {
  flex: 1;
  min-width: 0;
}
.head:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
  border-radius: 4px;
}
.n {
  margin-left: auto;
  font-size: 11px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
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
  transition: transform 0.2s;
}
.chev.closed {
  transform: rotate(-90deg);
}
.kids {
  margin-left: 7px;
  padding-left: 14px;
  border-left: 1px solid #eee9de;
}
.leaf {
  cursor: pointer;
}
/* 項目 not placed yet: still settable, but quieter */
.leaf.none .name,
.leaf.none .n {
  opacity: 0.5;
}
/* keep counts aligned under the chevrons above */
.leaf .n {
  margin-right: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .chev {
    transition: none;
  }
}
</style>
