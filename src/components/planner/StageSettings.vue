<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import VisibilityTree from './VisibilityTree.vue'
import { t } from '@/i18n'
import { LOOK_MAX, LOOK_MIN, usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
/** Showing (on phones it's opened from ☰, see MainMenu) */
const open = computed({
  get: () => store.panel === 'settings',
  set(on) {
    if (on) store.panel = 'settings'
    // closing it leaves the other panel alone
    else if (store.panel === 'settings') store.panel = null
  },
})
const root = useTemplateRef('root')

type Toggle = 'wallsCut' | 'shadows' | 'snap' | 'walkThroughWalls' | 'walkThroughItems' | 'walkBob'
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
    {
      title: m.walk,
      rows: [
        { key: 'walkThroughWalls' as Toggle, label: m.throughWalls, hint: m.throughWallsHint },
        { key: 'walkThroughItems' as Toggle, label: m.throughItems, hint: m.throughItemsHint },
        { key: 'walkBob' as Toggle, label: m.bob, hint: m.bobHint },
      ],
      // and the look sensitivity slider under them
      look: true,
    },
  ]
})

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
        <label v-if="'look' in sec" class="row slider">
          <span class="txt">
            <b>{{ t().settings.look }}</b>
            <i>{{ t().settings.lookHint }}</i>
          </span>
          <span class="range">
            <input
              v-model.number="store.lookSensitivity"
              type="range"
              :min="LOOK_MIN"
              :max="LOOK_MAX"
              step="1"
            />
            <output>{{ store.lookSensitivity }}</output>
          </span>
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
    </div>
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
  background: var(--hover);
}
.gear.on {
  color: var(--on-yel);
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
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
section + section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line-soft);
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
/* a slider takes its own line under the label */
.row.slider {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  cursor: default;
}
.range {
  display: flex;
  align-items: center;
  gap: 10px;
}
.range input {
  flex: 1;
  min-width: 0;
  accent-color: var(--yel);
  cursor: pointer;
}
.range output {
  width: 2ch;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--muted);
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
  background: var(--switch-off);
  cursor: pointer;
  transition: background 0.2s;
}
.switch.on {
  background: var(--yel);
  color: var(--on-yel);
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

/*
 * Phones: its button is in ☰ instead, and the panel rises from just above the bottom bar,
 * across the screen
 */
@media (max-width: 560px) {
  .gear {
    display: none;
  }
  .pop {
    position: fixed;
    top: auto;
    left: 10px;
    right: 10px;
    bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-width: none;
    max-height: calc(100dvh - 140px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .pop::after {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .knob,
  .gear svg {
    transition: none;
  }
}
</style>
