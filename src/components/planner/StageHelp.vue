<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { t } from '@/i18n'
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()

/** Showing (on phones it's opened from ☰, see MainMenu) */
const open = computed({
  get: () => store.panel === 'help',
  set(on) {
    if (on) store.panel = 'help'
    // closing it leaves the other panel alone
    else if (store.panel === 'help') store.panel = null
  },
})
const root = useTemplateRef('root')

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
  <div ref="root" class="help" data-stage-ui>
    <div v-if="open" id="stage-help" class="pop" role="dialog" :aria-label="t().help.title">
      <section v-for="s in t().help.sections" :key="s.title">
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
      :title="t().help.title"
      :aria-label="t().help.title"
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
  background: var(--surface);
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
  background: var(--hover);
}
.q.on {
  color: var(--on-yel);
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
  background: var(--surface);
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
  background: var(--surface);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  transform: rotate(45deg);
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

@media (max-width: 720px) {
  .help {
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
}
/*
 * Phones: its button is in ☰ instead, and the panel rises from just above the bottom bar,
 * across the screen
 */
@media (max-width: 560px) {
  .q {
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
</style>
