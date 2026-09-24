<script setup lang="ts">
import { onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
const open = shallowRef(false)
const root = useTemplateRef('root')

const SECTIONS = [
  {
    title: '視角',
    rows: [
      ['左鍵拖曳', '前後左右移動'],
      ['右鍵拖曳', '旋轉'],
      ['滾輪', '縮放'],
      ['WASD／方向鍵', '移動（Shift 加速）'],
      ['觸控', '單指移動 · 雙指旋轉縮放'],
    ],
  },
  {
    title: '物件（編輯模式）',
    rows: [
      ['拖曳', '移動物件'],
      ['方向鍵', '微調 0.25m（Shift 1m）'],
      ['Q／E', '旋轉 15°'],
      ['R', '旋轉 90°'],
      ['⌘D', '複製'],
      ['Del', '刪除'],
      ['點紅帶', '拆除紅龍間的紅帶'],
      ['海報', '拖曳到任何牆面'],
      ['拖曳海報角落', '調整大小（Shift 等比例）'],
      ['人員', '在資訊面板設定標籤'],
      ['Esc', '取消選取'],
      ['⌘Z', '復原'],
    ],
  },
] as const

function onPointerDown(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

// Light-dismiss: only listen while the popover is showing
function unlisten() {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
}
watch(open, (on) => {
  if (!on) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(unlisten)
</script>

<template>
  <div ref="root" class="help" :class="{ busy: store.selection }" data-stage-ui>
    <div v-if="open" id="stage-help" class="pop" role="dialog" aria-label="操作說明">
      <section v-for="s in SECTIONS" :key="s.title">
        <h4>{{ s.title }}</h4>
        <dl>
          <template v-for="[k, v] in s.rows" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </section>
    </div>
    <button
      class="q"
      :class="{ on: open }"
      type="button"
      title="操作說明"
      aria-label="操作說明"
      aria-controls="stage-help"
      :aria-expanded="open"
      @click="open = !open"
    >
      ?
    </button>
  </div>
</template>

<style scoped>
.help {
  position: absolute;
  right: 14px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
}
.q {
  width: 34px;
  height: 34px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--muted);
  font: 600 15px var(--mono);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transition:
    color 0.15s,
    background 0.15s;
}
.q:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.q.on {
  color: var(--ink);
  background: var(--yel);
  border-color: transparent;
}
.q:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
}

.pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: max-content;
  max-width: min(300px, calc(100vw - 28px));
  padding: 10px 14px 12px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}
/* Little arrow pointing at the ? button */
.pop::after {
  content: '';
  position: absolute;
  right: 12px;
  bottom: -5px;
  width: 9px;
  height: 9px;
  background: #fff;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  transform: rotate(45deg);
}
section + section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee9de;
}
h4 {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--faint);
  letter-spacing: 0.05em;
}
dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  align-items: baseline;
}
dt {
  font: 500 11px var(--mono);
  color: var(--ink);
  white-space: nowrap;
}
dd {
  margin: 0;
  color: var(--muted);
}

/* Phones: the selection sheet spans the full width, so step aside while it is open */
@media (max-width: 720px) {
  .help {
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
  .help.busy {
    display: none;
  }
}
</style>
