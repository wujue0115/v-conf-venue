<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import NameDialog from '@/components/cloud/NameDialog.vue'
import { usePhone } from '@/composables/usePhone'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { SCENE_MAX, SCENE_NAME_MAX, type Scene } from '@/venue/layout'
import { t } from '@/i18n'

/**
 * The scenes along the bottom of the stage: a tap shows one. More than fit across, they're in a
 * list opened from the one shown. In Edit mode they can be added (a copy of the one shown, or
 * empty), renamed, deleted (after asking) and dragged into another order; with one scene and
 * nothing to change, the bar keeps out of the way.
 */

const store = usePlannerStore()
const editor = useVenueEditor()
const phone = usePhone()
const root = useTemplateRef('root')
const list = useTemplateRef('list')
const measure = useTemplateRef('measure')
const listPop = useTemplateRef('listPop')
const nameDialog = useTemplateRef('nameDialog')
const confirmDialog = useTemplateRef('confirmDialog')

const manage = computed(() => store.editing)
const full = computed(() => store.scenes.length >= SCENE_MAX)
/**
 * Not while walking (its controls take the bottom), nor on phones while what's selected or
 * being placed shows there
 */
const shown = computed(
  () =>
    (store.scenes.length > 1 || manage.value) &&
    !store.walk &&
    !(phone.value && (store.selection || store.armed)),
)

/** The menu open: 'add', or a scene's id for its options; and where it sits along the bar */
const menu = shallowRef<string | null>(null)
const menuLeft = shallowRef(0)
const menuScene = computed(() => store.scenes.find((s) => s.id === menu.value) ?? null)
/** How wide a menu is at most (the list of scenes, wider), to keep it on the screen */
const MENU_W = 190
const LIST_W = 240

function toggleMenu(key: string, el: HTMLElement) {
  if (menu.value === key) {
    menu.value = null
    return
  }
  const bar = root.value!.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const w = key === 'list' ? LIST_W : MENU_W
  menuLeft.value = Math.max(0, Math.min(r.left - bar.left, bar.width - w))
  menu.value = key
}

/**
 * The scenes don't fit across: the one shown, with the rest in a list it opens. Worked out from
 * a hidden copy of the row, against the room the stage leaves the bar.
 */
const compact = shallowRef(false)
function fit() {
  const row = measure.value
  const stage = root.value?.parentElement
  if (!row || !stage) return
  compact.value = row.offsetWidth > stage.clientWidth - (phone.value ? 20 : 240)
}
const resized = new ResizeObserver(fit)
watch(root, (el, was) => {
  if (was?.parentElement) resized.unobserve(was.parentElement)
  if (el?.parentElement) resized.observe(el.parentElement)
})
watch([() => store.scenes.map((s) => s.name).join('\n'), manage, phone], () => void nextTick(fit))
watch(compact, (on) => {
  if (!on && menu.value === 'list') menu.value = null
})

function add(copy: boolean) {
  menu.value = null
  const s = store.addScene({ copy })
  if (s) store.notify(t().scenes.added(s.name))
}

function rename(s: Scene) {
  menu.value = null
  nameDialog.value?.open(s.name, async (name) => store.renameScene(s.id, name))
}

async function remove(s: Scene) {
  menu.value = null
  const ok = await confirmDialog.value?.ask({
    title: t().scenes.deleteTitle(s.name),
    message: t().scenes.deleteMessage(s.items.length),
    actions: [{ label: t().scenes.deleteOk, value: 'delete', danger: true }],
  })
  if (ok !== 'delete') return
  store.deleteScene(s.id)
  // the scene shown, removed, has its steps put by when the next is shown (see VenueStage)
  editor.value?.forgetScene(s.id)
  store.notify(t().scenes.deleted(s.name))
}

// Dragging a scene into another place, along the bar or down the list: with a mouse once it
// moves a few pixels, by touch after a long press (a swipe meanwhile scrolls instead)
const DRAG_FROM = 6
const LONG_PRESS = 350
/** Where the scene picked up would go, as the bar shows it meanwhile */
const drag = shallowRef<{ id: string; from: number; to: number } | null>(null)
let press: {
  pointer: number
  id: string
  from: number
  /** Along the bar (x) or down the list (y), and where along it the press began */
  axis: 'x' | 'y'
  at: number
  /** The middle of each scene's button along it when it was pressed */
  mids: number[]
  touch: boolean
  timer?: ReturnType<typeof setTimeout>
} | null = null
/** A drag just ended: the click that follows doesn't pick the scene */
let dropped = false

const order = computed(() => {
  const d = drag.value
  if (!d) return store.scenes
  const l = [...store.scenes]
  const [s] = l.splice(d.from, 1)
  l.splice(d.to, 0, s!)
  return l
})

const along = (e: PointerEvent, axis: 'x' | 'y') => (axis === 'x' ? e.clientX : e.clientY)

function onDown(e: PointerEvent, s: Scene, axis: 'x' | 'y') {
  if (!manage.value || e.button !== 0 || store.scenes.length < 2) return
  const el = e.currentTarget as HTMLElement
  const mids = [...el.closest('[data-order]')!.querySelectorAll<HTMLElement>('[data-scene]')].map(
    (b) => {
      const r = b.getBoundingClientRect()
      return axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
    },
  )
  const from = store.scenes.findIndex((x) => x.id === s.id)
  const touch = e.pointerType === 'touch'
  press = { pointer: e.pointerId, id: s.id, from, axis, at: along(e, axis), mids, touch }
  if (touch)
    press.timer = setTimeout(() => {
      if (!press) return
      el.setPointerCapture(press.pointer)
      drag.value = { id: press.id, from, to: from }
      if (axis === 'x') menu.value = null
    }, LONG_PRESS)
}
function onMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.pointer) return
  const p = press
  const at = along(e, p.axis)
  if (!drag.value) {
    if (Math.abs(at - p.at) < DRAG_FROM) return
    // by touch, moving before the long press is a swipe
    if (p.touch) return release()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    // a menu along the bar closes; the list being dragged in stays
    if (p.axis === 'x') menu.value = null
  }
  const to = p.mids.filter((m, i) => i !== p.from && m < at).length
  drag.value = { id: p.id, from: p.from, to }
}
function onUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.pointer) return
  const d = drag.value
  if (d) {
    store.moveScene(d.from, d.to)
    // only the click straight after, if the browser gives one where the drag ended
    dropped = true
    setTimeout(() => (dropped = false))
  }
  release()
}
function release() {
  clearTimeout(press?.timer)
  press = null
  drag.value = null
}
// by touch, the bar (or the list) mustn't scroll under a scene being dragged
function onTouchMove(e: TouchEvent) {
  if (drag.value) e.preventDefault()
}

function pick(s: Scene) {
  if (dropped) {
    dropped = false
    return
  }
  menu.value = null
  store.setScene(s.id)
}

// The scene shown is kept in view along the bar
watch(
  () => store.sceneId,
  () =>
    requestAnimationFrame(() =>
      list.value
        ?.querySelector('.chip.on')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    ),
)
// The list opens on the scene shown
watch(menu, (m) => {
  if (m === 'list')
    void nextTick(() => listPop.value?.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }))
})
// Leaving Edit mode closes what it opened
watch(manage, (on) => {
  if (!on) menu.value = null
})

// Light-dismiss: only listen while a menu is showing
function onPointerDown(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) menu.value = null
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') menu.value = null
}
function unlisten() {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
}
watch(menu, (m) => {
  if (!m) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  unlisten()
  release()
  resized.disconnect()
})
</script>

<template>
  <nav
    v-if="shown"
    ref="root"
    class="scenes"
    :class="{ phone, manage: manage && store.scenes.length > 1 }"
    :aria-label="t().scenes.label"
    data-stage-ui
  >
    <!-- too many to fit: the one shown opens the list of them all -->
    <div v-if="compact" class="list grp">
      <div class="chip on">
        <button
          class="btn pick on drop"
          type="button"
          aria-haspopup="listbox"
          :aria-expanded="menu === 'list'"
          :title="t().scenes.label"
          @click="toggleMenu('list', $event.currentTarget as HTMLElement)"
        >
          <span class="nm">{{ store.scene?.name }}</span>
          <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
        </button>
        <button
          v-if="manage && store.scene"
          class="btn more on"
          type="button"
          :title="t().scenes.more(store.scene.name)"
          :aria-label="t().scenes.more(store.scene.name)"
          :aria-expanded="menu === store.sceneId"
          @click="toggleMenu(store.sceneId, $event.currentTarget as HTMLElement)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.5" cy="8" r="1.3" />
          </svg>
        </button>
      </div>
      <button
        v-if="manage"
        class="btn add"
        type="button"
        :disabled="full"
        :title="full ? t().scenes.full(SCENE_MAX) : t().scenes.add"
        :aria-label="t().scenes.add"
        :aria-expanded="menu === 'add'"
        @click="toggleMenu('add', $event.currentTarget as HTMLElement)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </div>

    <div v-else ref="list" class="list grp" data-order @touchmove="onTouchMove">
      <div
        v-for="s in order"
        :key="s.id"
        class="chip"
        :class="{ on: s.id === store.sceneId, dragging: drag?.id === s.id }"
      >
        <button
          class="btn pick"
          :class="{ on: s.id === store.sceneId }"
          type="button"
          :aria-current="s.id === store.sceneId ? 'true' : undefined"
          :title="manage && store.scenes.length > 1 ? t().scenes.dragHint : undefined"
          data-scene
          @pointerdown="onDown($event, s, 'x')"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="release"
          @click="pick(s)"
        >
          {{ s.name }}
        </button>
        <button
          v-if="manage && s.id === store.sceneId"
          class="btn more on"
          type="button"
          :title="t().scenes.more(s.name)"
          :aria-label="t().scenes.more(s.name)"
          :aria-expanded="menu === s.id"
          @click="toggleMenu(s.id, $event.currentTarget as HTMLElement)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.5" cy="8" r="1.3" />
          </svg>
        </button>
      </div>
      <button
        v-if="manage"
        class="btn add"
        type="button"
        :disabled="full"
        :title="full ? t().scenes.full(SCENE_MAX) : t().scenes.add"
        :aria-label="t().scenes.add"
        :aria-expanded="menu === 'add'"
        @click="toggleMenu('add', $event.currentTarget as HTMLElement)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </div>

    <!-- the bar's row as it would be, hidden, to tell whether it fits -->
    <div ref="measure" class="list grp measure" aria-hidden="true" inert>
      <span v-for="s in store.scenes" :key="s.id" class="btn pick">{{ s.name }}</span>
      <template v-if="manage">
        <span class="btn more"></span>
        <span class="btn add"></span>
      </template>
    </div>

    <div
      v-if="menu === 'list'"
      ref="listPop"
      class="pop scene-list"
      role="listbox"
      :aria-label="t().scenes.label"
      :style="{ left: `${menuLeft}px` }"
      data-order
      @touchmove="onTouchMove"
    >
      <button
        v-for="s in order"
        :key="s.id"
        class="item opt"
        :class="{ cur: s.id === store.sceneId, dragging: drag?.id === s.id }"
        type="button"
        role="option"
        :aria-selected="s.id === store.sceneId"
        :title="manage && store.scenes.length > 1 ? t().scenes.dragHint : undefined"
        data-scene
        @pointerdown="onDown($event, s, 'y')"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="release"
        @click="pick(s)"
      >
        {{ s.name }}
      </button>
    </div>
    <div v-else-if="menu" class="pop" role="menu" :style="{ left: `${menuLeft}px` }">
      <template v-if="menu === 'add'">
        <button class="item" type="button" role="menuitem" @click="add(true)">
          {{ t().scenes.addCopy }}
        </button>
        <button class="item" type="button" role="menuitem" @click="add(false)">
          {{ t().scenes.addBlank }}
        </button>
      </template>
      <template v-else-if="menuScene">
        <button class="item" type="button" role="menuitem" @click="rename(menuScene)">
          {{ t().scenes.rename }}
        </button>
        <button
          class="item danger"
          type="button"
          role="menuitem"
          :disabled="store.scenes.length < 2"
          @click="remove(menuScene)"
        >
          {{ t().scenes.delete }}
        </button>
      </template>
    </div>

    <NameDialog
      ref="nameDialog"
      :title="t().scenes.renameTitle"
      :confirm="t().scenes.save"
      :label="t().scenes.name"
      :placeholder="t().scenes.namePlaceholder"
      :maxlength="SCENE_NAME_MAX"
    />
    <ConfirmDialog ref="confirmDialog" />
  </nav>
</template>

<style scoped>
/* Between undo/redo and ? along the bottom; on phones above the bottom bar */
.scenes {
  position: absolute;
  left: 50%;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  max-width: calc(100% - 240px);
  transform: translateX(-50%);
}
.scenes.phone {
  bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  max-width: calc(100% - 20px);
}
.list {
  align-items: center;
  overflow-x: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.chip {
  flex: none;
  display: flex;
  border-radius: 7px;
}
.chip.on {
  background: var(--yel);
}
.chip.dragging {
  outline: 2px dashed var(--yel-ink);
  outline-offset: -2px;
}
.pick {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  /* a swipe along the bar scrolls it; a mouse drag (or a long press) moves the scene */
  touch-action: pan-x;
  user-select: none;
}
.pick.on {
  cursor: default;
}
.manage .pick {
  cursor: grab;
}
.more {
  width: 26px;
  padding: 0;
  justify-content: center;
}
.more:hover {
  background: var(--yel-hover);
}
.add {
  flex: none;
  width: 30px;
  padding: 0;
  justify-content: center;
  color: var(--muted);
}
svg {
  width: 16px;
  height: 16px;
}
.more svg {
  fill: currentColor;
}
.add svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.btn:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: -2px;
}

.measure {
  position: absolute;
  left: 0;
  bottom: 0;
  width: max-content;
  max-width: none;
  overflow: visible;
  visibility: hidden;
  pointer-events: none;
}
.drop {
  max-width: 220px;
}
.drop .nm {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chev {
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.scene-list {
  width: max-content;
  min-width: 180px;
  max-width: 240px;
  max-height: min(360px, 50dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.opt {
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  /* a swipe scrolls the list; a mouse drag (or a long press) moves the scene */
  touch-action: pan-y;
  user-select: none;
}
.manage .opt {
  cursor: grab;
}
.opt.cur {
  background: var(--yel-soft);
  font-weight: 600;
}
.opt.dragging {
  outline: 2px dashed var(--yel-ink);
  outline-offset: -2px;
}
.pop {
  position: absolute;
  bottom: calc(100% + 6px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 150px;
  max-width: 190px;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.item {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.item:hover {
  background: var(--hover);
}
.item.danger {
  color: var(--danger);
}
.item.danger:hover {
  background: var(--danger-soft);
}
.item:disabled {
  opacity: 0.4;
  cursor: default;
}
.item:disabled:hover {
  background: none;
}
</style>
