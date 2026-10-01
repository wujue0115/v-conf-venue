<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import ExportImageDialog from './ExportImageDialog.vue'
import AccountSection from '@/components/auth/AccountSection.vue'
import NameDialog from '@/components/cloud/NameDialog.vue'
import { cloudMessage } from '@/cloud/messages'
import { createProject } from '@/cloud/projects'
import { LOCALES, LOCALE_NAMES, locale, t } from '@/i18n'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { useAuthStore } from '@/stores/auth'
import { usePalettesStore } from '@/stores/palettes'
import { usePlannerStore } from '@/stores/planner'
import { downloadJSON, stamp } from '@/venue/download'
import { exportLayout, parseLayout, readPricing } from '@/venue/layout'

/**
 * ☰ at the top left: the layout file (open, save, export an image, clear),
 * the cloud (save to it, My projects), the account and the language. ⚙ keeps what the stage
 * shows.
 */

const store = usePlannerStore()
const palettes = usePalettesStore()
const auth = useAuthStore()
const editor = useVenueEditor()
const open = shallowRef(false)
const root = useTemplateRef('root')
const fileInput = useTemplateRef('file')
const router = useRouter()

function openFile() {
  open.value = false
  fileInput.value?.click()
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
    store.notify(t().menu.imported)
  } catch {
    store.notify(t().menu.badFile)
  }
  input.value = ''
}

function save() {
  open.value = false
  const pricing = { priceMode: store.priceMode, slots: store.slots }
  downloadJSON(
    `v-conf-taiwan-venue-${stamp()}.json`,
    exportLayout(store.items, { pricing, palettes: palettes.palettes }),
  )
}

/** Set before going to Google from 存到雲端, so it carries on once signed in */
const AFTER_SIGN_IN = 'v-conf-venue:after-sign-in'
const saveDialog = useTemplateRef('saveDialog')

/** 存到雲端: the layout in this browser becomes a new cloud project, which then opens */
async function saveToCloud() {
  open.value = false
  if (!auth.user) {
    try {
      sessionStorage.setItem(AFTER_SIGN_IN, 'save-to-cloud')
    } catch {
      // without storage it just doesn't carry on after signing in
    }
    try {
      await auth.signInWithGoogle()
    } catch {
      store.notify(t().auth.signInFailed)
    }
    return
  }
  const today = new Date().toLocaleDateString(t().lang)
  saveDialog.value?.open(t().cloud.defaultName(today), async (name) => {
    try {
      const id = await createProject(auth.user!.id, name, store.items, {
        pricing: { priceMode: store.priceMode, slots: store.slots },
        palettes: palettes.palettes,
      })
      store.notify(t().cloud.savedAs(name))
      void router.push({ name: 'project', params: { projectId: id } })
    } catch (e) {
      store.notify(cloudMessage(e))
      throw e
    }
  })
}

// Back from Google after choosing 存到雲端 signed out: ask for the name now (once mounted, so
// the window is there to open)
onMounted(() =>
  watch(
    () => [auth.ready, auth.user] as const,
    ([ready, user]) => {
      if (!ready) return
      let pending: string | null = null
      try {
        pending = sessionStorage.getItem(AFTER_SIGN_IN)
        if (pending) sessionStorage.removeItem(AFTER_SIGN_IN)
      } catch {
        return
      }
      if (pending && user && !store.projectId) void saveToCloud()
    },
    { immediate: true },
  ),
)

function go(to: string) {
  open.value = false
  void router.push(to)
}

/** 輸出圖片 opens its own window (preview, padding, download); the menu closes behind it */
const imageDialog = useTemplateRef('imageDialog')
function openImageDialog() {
  open.value = false
  imageDialog.value?.open()
}

function clearAll() {
  open.value = false
  if (!store.items.length || !confirm(t().menu.clearConfirm)) return
  editor.value?.clear()
}

async function signOut() {
  open.value = false
  try {
    await auth.signOut()
    store.notify(t().auth.signedOut)
  } catch {
    store.notify(t().auth.signOutFailed)
  }
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
// Light-dismiss: only listen while the menu is showing
watch(open, (on) => {
  if (!on) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(unlisten)
</script>

<template>
  <div ref="root" class="main-menu">
    <button
      class="burger"
      :class="{ on: open }"
      type="button"
      :title="t().menu.title"
      :aria-label="t().menu.title"
      aria-controls="main-menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M4 7h16M4 12h16M4 17h16"
        />
      </svg>
    </button>

    <div v-if="open" id="main-menu" class="pop" role="menu" :aria-label="t().menu.title">
      <button
        class="item"
        type="button"
        role="menuitem"
        :title="store.editing ? t().menu.openHint : t().menu.editOnly"
        :disabled="!store.editing"
        @click="openFile"
      >
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        {{ t().menu.open }}
      </button>
      <button class="item" type="button" role="menuitem" :title="t().menu.saveHint" @click="save">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v11m-4-4 4 4 4-4M5 19h14" />
        </svg>
        {{ t().menu.save }}
      </button>
      <template v-if="auth.available">
        <button
          v-if="!store.projectId"
          class="item"
          type="button"
          role="menuitem"
          :title="auth.user ? t().cloud.saveToCloudHint : t().cloud.signInToSave"
          @click="saveToCloud"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5Z" />
            <path d="M12 15v-5m-2.5 2.5L12 10l2.5 2.5" />
          </svg>
          {{ t().cloud.saveToCloud }}
        </button>
        <button
          v-if="auth.user"
          class="item"
          type="button"
          role="menuitem"
          @click="go('/projects')"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />
          </svg>
          {{ t().cloud.myProjects }}
        </button>
        <button
          v-if="store.projectId"
          class="item"
          type="button"
          role="menuitem"
          :title="t().cloud.localHint"
          @click="go('/')"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v11H4zM9 20h6M12 16v4" />
          </svg>
          {{ t().cloud.local }}
        </button>
      </template>
      <button
        class="item"
        type="button"
        role="menuitem"
        :title="t().menu.imageHint"
        @click="openImageDialog"
      >
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          <path d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18" />
          <circle cx="15.5" cy="8.5" r="1.5" />
        </svg>
        {{ t().menu.image }}
      </button>
      <button
        class="item danger"
        type="button"
        role="menuitem"
        :title="store.editing ? undefined : t().menu.editOnly"
        :disabled="!store.editing"
        @click="clearAll"
      >
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        {{ t().menu.clear }}
      </button>

      <template v-if="auth.available">
        <hr />
        <AccountSection />
        <button
          v-if="auth.user"
          class="item"
          type="button"
          role="menuitem"
          :disabled="auth.busy"
          @click="signOut"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
          </svg>
          {{ t().auth.signOut }}
        </button>
      </template>

      <hr />
      <div class="lang-row">
        <span>{{ t().language }}</span>
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
      </div>
    </div>

    <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
    <NameDialog
      ref="saveDialog"
      :title="t().cloud.saveTitle"
      :hint="t().cloud.saveHint"
      :confirm="t().cloud.save"
    />
    <ExportImageDialog ref="imageDialog" :name="() => `v-conf-taiwan-venue-${stamp()}`" />
  </div>
</template>

<style scoped>
.main-menu {
  position: relative;
  flex-shrink: 0;
}
/* an island of its own, the size of ⚙ */
.burger {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}
.burger:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.burger.on {
  color: var(--ink);
  background: var(--yel);
  border-color: transparent;
}
.burger:focus-visible,
.item:focus-visible,
.lang:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}

.pop {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 10;
  width: 240px;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}
.item:hover:not(:disabled) {
  background: #f4f1ea;
}
.item.danger:hover:not(:disabled) {
  background: #fbe9e7;
  color: #b3261e;
}
.item:disabled {
  opacity: 0.45;
  cursor: default;
}
.ico {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--muted);
}
hr {
  margin: 6px 2px;
  border: 0;
  border-top: 1px solid #eee9de;
}

.lang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 2px 8px;
  font-size: 13px;
}
.langs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--paper);
}
.lang {
  height: 26px;
  padding: 0 10px;
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
</style>
