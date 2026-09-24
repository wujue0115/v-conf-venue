<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { TAG_MAX } from '@/venue/layout'

const props = defineProps<{
  /** The current tag ('' when none) */
  value: string
  /** Tags already used in the layout, most used first */
  options: readonly string[]
}>()
const emit = defineEmits<{ commit: [tag: string] }>()

const input = useTemplateRef('input')
const draft = shallowRef(props.value)
const open = shallowRef(false)
const active = shallowRef(-1)
const listId = useId()

watch(
  () => props.value,
  (v) => (draft.value = v),
)

const typed = computed(() => draft.value.trim())
/** Existing tags matching what was typed (all of them while the field still shows the current tag) */
const matches = computed(() => {
  const q = typed.value.toLowerCase()
  if (!q || typed.value === props.value) return props.options
  return props.options.filter((o) => o.toLowerCase().includes(q))
})
const isNew = computed(() => !!typed.value && !props.options.includes(typed.value))
/** Rows in the dropdown: an optional "add new" row first, then the matches */
const rows = computed(() => [
  ...(isNew.value ? [{ tag: typed.value, add: true }] : []),
  ...matches.value.map((tag) => ({ tag, add: false })),
])

function commit(tag: string) {
  const t = tag.trim()
  draft.value = t
  open.value = false
  active.value = -1
  if (t !== props.value) emit('commit', t)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    open.value = true
    const n = rows.value.length
    if (!n) return
    const i = active.value
    if (e.key === 'ArrowDown') active.value = i < n - 1 ? i + 1 : 0
    else active.value = i > 0 ? i - 1 : n - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commit(rows.value[active.value]?.tag ?? draft.value)
    input.value?.blur()
  } else if (e.key === 'Escape') {
    draft.value = props.value
    open.value = false
    input.value?.blur()
  }
}
function onBlur() {
  if (open.value || draft.value.trim() !== props.value) commit(draft.value)
}
function clear() {
  commit('')
}
</script>

<template>
  <div class="combo">
    <input
      ref="input"
      v-model="draft"
      type="text"
      role="combobox"
      :maxlength="TAG_MAX"
      placeholder="選擇或輸入標籤"
      aria-label="標籤"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
      @focus="open = true"
      @input="((open = true), (active = -1))"
      @keydown="onKey"
      @blur="onBlur"
    />
    <button
      v-if="value"
      class="clear"
      type="button"
      title="移除標籤"
      aria-label="移除標籤"
      @pointerdown.prevent
      @click="clear"
    >
      ×
    </button>
    <ul v-if="open && rows.length" :id="listId" class="list" role="listbox">
      <li
        v-for="(r, i) in rows"
        :id="`${listId}-${i}`"
        :key="(r.add ? '+' : '') + r.tag"
        role="option"
        :aria-selected="r.tag === value"
        :class="{ active: i === active, cur: r.tag === value, add: r.add }"
        @pointerdown.prevent
        @click="commit(r.tag)"
      >
        <template v-if="r.add">新增「{{ r.tag }}」</template>
        <template v-else>{{ r.tag }}</template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combo {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 260px;
}
input {
  width: 100%;
  height: 30px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
}
input:focus {
  outline: 2px solid var(--yel);
  border-color: transparent;
}
.clear {
  position: absolute;
  top: 50%;
  right: 4px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--faint);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%);
}
.clear:hover {
  color: var(--ink);
  background: #f4f1ea;
}
/* The selection panel sits at the bottom of the screen, so the list opens upward */
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 5;
  max-height: 188px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
li {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
li:hover,
li.active {
  background: #f4f1ea;
}
li.cur {
  font-weight: 700;
}
/* "新增" uses the page's accent (the dark gold of its accent text: plain yellow is unreadable on white) */
li.add {
  color: #8a6a1c;
  font-weight: 600;
}
</style>
