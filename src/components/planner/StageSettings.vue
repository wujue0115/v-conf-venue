<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import ExportImageDialog from './ExportImageDialog.vue'
import VisibilityTree from './VisibilityTree.vue'
import { LOCALES, LOCALE_NAMES, locale, t } from '@/i18n'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { exportLayout, parseLayout, readPricing } from '@/venue/layout'
import { usePalettesStore } from '@/stores/palettes'

const store = usePlannerStore()
const palettes = usePalettesStore()
const editor = useVenueEditor()
const open = shallowRef(false)
const root = useTemplateRef('root')
const fileInput = useTemplateRef('file')

type Toggle = 'wallsCut' | 'shadows' | 'snap'
const SWITCHES = computed(() => {
  const m = t().settings
  return [
    {
      title: m.display,
      rows: [
        { key: 'wallsCut' as Toggle, label: m.wallsCut, hint: m.wallsCutHint },
        { key: 'shadows' as Toggle, label: m.shadows, hint: m.shadowsHint },
      ],
    },
    {
      title: m.edit,
      rows: [
        {
          key: 'snap' as Toggle,
          label: m.snap,
          hint: store.editing ? m.snapHint : m.snapOff,
          disabled: !store.editing,
        },
      ],
    },
  ]
})

function clearAll() {
  if (!store.items.length || !confirm(t().settings.clearConfirm)) return
  editor.value?.clear()
}

/** Local time as YYYYMMDD-HHmmss, so exports sort by when they were made */
function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

function download() {
  const pricing = { priceMode: store.priceMode, slots: store.slots }
  const blob = new Blob([exportLayout(store.items, { pricing, palettes: palettes.palettes })], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `v-conf-taiwan-venue-${stamp()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** 輸出圖片 opens its own window (preview, padding, download); the settings close behind it */
const imageDialog = useTemplateRef('imageDialog')
function openImageDialog() {
  open.value = false
  imageDialog.value?.open()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  try {
    const file: unknown = JSON.parse(await f.text())
    editor.value?.load(parseLayout(file), { record: true })
    // the pricing its total was worked out with, and its colour rows, come along too
    const pricing = readPricing(file)
    if (pricing.priceMode !== undefined) store.priceMode = pricing.priceMode
    if (pricing.slots !== undefined) store.setSlots(pricing.slots)
    palettes.importPalettes(file)
    store.notify(t().settings.imported)
  } catch {
    store.notify(t().settings.badFile)
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
      :title="t().settings.title"
      :aria-label="t().settings.title"
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

    <div v-if="open" id="stage-settings" class="pop" role="dialog" :aria-label="t().settings.title">
      <section>
        <h4>{{ t().language }}</h4>
        <div class="langs" role="radiogroup" :aria-label="t().language">
          <button
            v-for="l in LOCALES"
            :key="l"
            class="lang"
            :class="{ on: locale === l }"
            type="button"
            role="radio"
            :aria-checked="locale === l"
            :lang="l === 'zh' ? 'zh-Hant' : 'en'"
            @click="locale = l"
          >
            {{ LOCALE_NAMES[l] }}
          </button>
        </div>
      </section>

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
        <h4>{{ t().settings.items }}</h4>
        <VisibilityTree
          :root="t().settings.allItems"
          :hidden="store.hiddenTypes"
          :count="() => true"
          @set="store.setTypesVisible"
        />
      </section>

      <section>
        <h4>{{ t().settings.tags }}</h4>
        <VisibilityTree
          :root="t().settings.allTags"
          :hidden="store.hiddenTagTypes"
          :count="(i) => !!i.tag"
          :extras="[
            { key: 'rooms', label: t().settings.roomLabels, on: store.showLabels },
            { key: 'groups', label: t().grouping.label, on: store.showGroupTags },
          ]"
          @set="store.setTagTypesVisible"
          @extra="
            (key, on) => (key === 'rooms' ? (store.showLabels = on) : (store.showGroupTags = on))
          "
        />
      </section>

      <section>
        <h4>{{ t().settings.notes }}</h4>
        <VisibilityTree
          :root="t().settings.allNotes"
          :hidden="store.hiddenInfoTypes"
          :count="(i) => !!i.info"
          :extras="[{ key: 'groups', label: t().grouping.label, on: store.showGroupInfo }]"
          @set="store.setInfoTypesVisible"
          @extra="(_, on) => (store.showGroupInfo = on)"
        />
      </section>

      <section>
        <h4>{{ t().settings.layout }}</h4>
        <div class="acts">
          <button class="btn" :title="t().settings.imageTitle" @click="openImageDialog">
            {{ t().settings.image }}
          </button>
          <button class="btn" @click="download">{{ t().settings.export }}</button>
          <button class="btn" :disabled="!store.editing" @click="fileInput?.click()">
            {{ t().settings.import }}
          </button>
          <button class="btn danger" :disabled="!store.editing" @click="clearAll">
            {{ t().settings.clear }}
          </button>
        </div>
      </section>
    </div>
    <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
    <ExportImageDialog ref="imageDialog" :name="() => `v-conf-taiwan-venue-${stamp()}`" />
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
  /* the object list can run long: scroll inside the panel rather than off the screen */
  max-height: calc(100dvh - 90px);
  overflow-y: auto;
  overscroll-behavior: contain;
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

.langs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  margin-top: 4px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--paper);
}
.lang {
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.lang.on {
  background: var(--yel);
  color: var(--ink);
  font-weight: 600;
}
.lang:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
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
