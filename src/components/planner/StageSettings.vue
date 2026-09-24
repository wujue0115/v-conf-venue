<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { exportLayout, parseLayout } from '@/venue/layout'

const store = usePlannerStore()
const editor = useVenueEditor()
const open = shallowRef(false)
const root = useTemplateRef('root')
const fileInput = useTemplateRef('file')

type Toggle = 'wallsCut' | 'showLabels' | 'showPersonTags' | 'shadows' | 'snap'
const SWITCHES = computed(() => [
  {
    title: '顯示',
    rows: [
      { key: 'wallsCut' as Toggle, label: '剖切牆面', hint: '把牆面切低，看得到房間內部' },
      { key: 'showLabels' as Toggle, label: '標籤', hint: '顯示教室與設施名稱' },
      { key: 'showPersonTags' as Toggle, label: '人員標籤', hint: '顯示人員頭上的綠色標籤' },
      { key: 'shadows' as Toggle, label: '陰影', hint: '關閉可讓較慢的裝置更順' },
    ],
  },
  {
    title: '編輯',
    rows: [
      {
        key: 'snap' as Toggle,
        label: '對齊格線',
        hint: store.editing ? '移動時對齊 25 公分格線' : '切換到編輯模式才能調整',
        disabled: !store.editing,
      },
    ],
  },
])

function clearAll() {
  if (!store.items.length || !confirm('確定要清空所有擺放的物件嗎？（可用復原找回）')) return
  editor.value?.clear()
}

function download() {
  const blob = new Blob([exportLayout(store.items)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'vueconf2026-layout.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  try {
    editor.value?.load(parseLayout(JSON.parse(await f.text())), { record: true })
    store.notify('已匯入配置')
  } catch {
    store.notify('檔案格式錯誤')
  }
  input.value = ''
}

function onPointerDown(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
function unlisten() {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
}
// Light-dismiss: only listen while the panel is showing
watch(open, (on) => {
  if (!on) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(unlisten)
</script>

<template>
  <div ref="root" class="settings">
    <button
      class="gear grp"
      :class="{ on: open }"
      type="button"
      title="設定"
      aria-label="設定"
      aria-controls="stage-settings"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        />
      </svg>
    </button>

    <div v-if="open" id="stage-settings" class="pop" role="dialog" aria-label="設定">
      <section v-for="sec in SWITCHES" :key="sec.title">
        <h4>{{ sec.title }}</h4>
        <label
          v-for="r in sec.rows"
          :key="r.key"
          class="row"
          :class="{ off: 'disabled' in r && r.disabled }"
        >
          <span class="txt">
            <b>{{ r.label }}</b>
            <i>{{ r.hint }}</i>
          </span>
          <button
            class="switch"
            :class="{ on: store[r.key] }"
            type="button"
            role="switch"
            :aria-checked="store[r.key]"
            :disabled="'disabled' in r && r.disabled"
            @click="store[r.key] = !store[r.key]"
          >
            <span class="knob"></span>
          </button>
        </label>
      </section>

      <section>
        <h4>配置</h4>
        <div class="acts">
          <button class="btn" title="復原 (⌘Z)" :disabled="!store.editing" @click="editor?.undo()">
            復原
          </button>
          <button class="btn" @click="download">匯出</button>
          <button class="btn" :disabled="!store.editing" @click="fileInput?.click()">匯入</button>
          <button class="btn danger" :disabled="!store.editing" @click="clearAll">清空</button>
        </div>
      </section>
    </div>
    <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.settings {
  position: relative;
}
.gear {
  width: 38px;
  height: 38px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.gear:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.gear.on {
  color: var(--ink);
  background: var(--yel);
  border-color: transparent;
}
.gear svg {
  transition: transform 0.3s ease;
}
.gear.on svg {
  transform: rotate(60deg);
}
.gear:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
}

.pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 10;
  width: min(280px, calc(100vw - 28px));
  padding: 10px 14px 14px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
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
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  cursor: pointer;
}
.row.off {
  cursor: default;
}
.row.off .txt {
  opacity: 0.45;
}
.txt {
  min-width: 0;
}
.txt b {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.txt i {
  display: block;
  font-style: normal;
  font-size: 11px;
  color: var(--faint);
}

/* iOS-style switch; the knob slides with the same easing as the mode switch */
.switch {
  flex: none;
  position: relative;
  width: 36px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #dcd7cb;
  cursor: pointer;
  transition: background 0.2s;
}
.switch.on {
  background: var(--yel);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.switch.on .knob {
  transform: translateX(16px);
}
.switch:disabled {
  opacity: 0.45;
  cursor: default;
}
.switch:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
}

.acts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 4px;
}
.acts .btn {
  border: 1px solid var(--line);
  background: var(--paper);
}
.acts .btn:not(:disabled):hover {
  background: #f0ece2;
}
.acts .btn.danger:not(:disabled):hover {
  background: #fbe9e7;
}

@media (prefers-reduced-motion: reduce) {
  .knob,
  .gear svg {
    transition: none;
  }
}
</style>
