<script setup lang="ts">
import { onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import NameDialog from '@/components/cloud/NameDialog.vue'
import { listSharedWithMe, type SharedSummary } from '@/cloud/access'
import { cloudMessage, timeAgo } from '@/cloud/messages'
import {
  createProject,
  deleteProject,
  duplicateProject,
  listMyProjects,
  loadProject,
  renameProject,
  type ProjectSummary,
} from '@/cloud/projects'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useCloudStore } from '@/stores/cloud'
import { downloadJSON, stamp } from '@/venue/download'
import { exportLayout } from '@/venue/layout'

/**
 * My projects: the signed-in person's cloud projects, the layout kept in this browser, and the
 * projects other people added them to by email (與我共用)
 */

const auth = useAuthStore()
const cloud = useCloudStore()
const router = useRouter()
const projects = shallowRef<ProjectSummary[] | null>(null)
const listError = shallowRef('')
const shared = shallowRef<SharedSummary[] | null>(null)
const sharedError = shallowRef('')
/** The card whose ⋯ menu is open */
const menuFor = shallowRef<string | null>(null)
const nameDialog = useTemplateRef('nameDialog')
const dialogText = shallowRef({ title: '', confirm: '', hint: '' })

const toast = shallowRef('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

async function refresh() {
  if (!auth.user) return
  listError.value = ''
  try {
    projects.value = await listMyProjects(auth.user.id)
  } catch (e) {
    listError.value = cloudMessage(e)
  }
}

async function refreshShared() {
  if (!auth.user) return
  sharedError.value = ''
  try {
    shared.value = await listSharedWithMe(auth.user.id)
  } catch (e) {
    sharedError.value = cloudMessage(e)
  }
}

watch(
  [() => auth.ready, () => auth.user?.id],
  ([ready, user]) => {
    projects.value = null
    shared.value = null
    if (ready && user) {
      void refresh()
      void refreshShared()
    }
  },
  { immediate: true },
)
// back online: read the lists again (they may have failed, or be out of date)
watch(
  () => cloud.offline,
  (off) => {
    if (off || !auth.user) return
    void refresh()
    void refreshShared()
  },
)

const openProject = (id: string) => router.push({ name: 'project', params: { projectId: id } })

function newProject() {
  dialogText.value = {
    title: t().cloud.newTitle,
    confirm: t().cloud.create,
    hint: t().cloud.newHint,
  }
  const today = new Date().toLocaleDateString(t().lang)
  nameDialog.value?.open(t().cloud.defaultName(today), async (name) => {
    try {
      const id = await createProject(auth.user!.id, name, [], {})
      void openProject(id)
    } catch (e) {
      notify(cloudMessage(e))
      throw e
    }
  })
}

function rename(p: ProjectSummary) {
  menuFor.value = null
  dialogText.value = { title: t().cloud.renameTitle, confirm: t().cloud.rename, hint: '' }
  nameDialog.value?.open(p.name, async (name) => {
    try {
      await renameProject(p.id, name)
      notify(t().cloud.renamed)
      await refresh()
    } catch (e) {
      notify(cloudMessage(e))
      throw e
    }
  })
}

/** Which card is busy (copying, exporting or deleting) */
const busy = shallowRef<string | null>(null)
async function run(p: ProjectSummary, job: () => Promise<void>) {
  menuFor.value = null
  busy.value = p.id
  try {
    await job()
  } catch (e) {
    notify(cloudMessage(e))
  } finally {
    busy.value = null
  }
}

const duplicate = (p: ProjectSummary) =>
  run(p, async () => {
    const name = t().cloud.copyName(p.name)
    await duplicateProject(auth.user!.id, p.id, name)
    notify(t().cloud.duplicated(name))
    await refresh()
  })

const exportJson = (p: ProjectSummary) =>
  run(p, async () => {
    const { items, settings } = await loadProject(p.id)
    const pricing = {
      priceMode: settings.pricing?.priceMode ?? 0,
      slots: settings.pricing?.slots ?? 1,
    }
    downloadJSON(
      `${p.name}-${stamp()}.json`,
      exportLayout(items, { pricing, palettes: settings.palettes }),
    )
  })

const remove = (p: ProjectSummary) => {
  menuFor.value = null
  if (!confirm(t().cloud.deleteConfirm(p.name))) return
  return run(p, async () => {
    await deleteProject(p.id)
    notify(t().cloud.deleted(p.name))
    await refresh()
  })
}

// Light-dismiss for the ⋯ menus
function onPointerDown(e: PointerEvent) {
  if (!(e.target as Element).closest?.('.more-wrap')) menuFor.value = null
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuFor.value = null
}
function unlisten() {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
}
watch(menuFor, (id) => {
  if (!id) return unlisten()
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  unlisten()
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="page">
    <header class="bar">
      <RouterLink to="/" class="back">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        {{ t().cloud.back }}
      </RouterLink>
    </header>

    <main class="main">
      <div class="head">
        <h1>{{ t().cloud.myProjects }}</h1>
        <button
          v-if="auth.user"
          class="primary"
          type="button"
          :disabled="!cloud.canCreate"
          :title="cloud.createHint"
          @click="newProject"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ t().cloud.newProject }}
        </button>
      </div>

      <p v-if="auth.available && !cloud.enabled" class="banner" role="status">
        {{ t().cloud.pausedBanner }}
      </p>
      <p v-else-if="auth.available && cloud.offline" class="banner" role="status">
        {{ t().cloud.offlineBanner }}
      </p>
      <p
        v-else-if="auth.user && cloud.createBlocked === 'not_allowed'"
        class="banner"
        role="status"
      >
        {{ t().cloud.createNotAllowed }}
      </p>

      <p v-if="!auth.available" class="note">{{ t().cloud.errors.unavailable }}</p>
      <p v-else-if="!auth.ready" class="note">{{ t().cloud.loading }}</p>

      <div v-else-if="!auth.user" class="card signin">
        <h2>{{ t().cloud.signInTitle }}</h2>
        <p>{{ t().cloud.signInHint }}</p>
        <button
          class="primary"
          type="button"
          :disabled="auth.busy"
          @click="auth.signInWithGoogle()"
        >
          {{ auth.busy ? t().auth.signingIn : t().auth.signIn }}
        </button>
      </div>

      <template v-else>
        <div class="grid">
          <!-- the layout kept in this browser, which isn't a cloud project -->
          <RouterLink to="/" class="card project local">
            <div class="thumb" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 5h16v11H4zM9 20h6M12 16v4" /></svg>
            </div>
            <div class="info">
              <b>{{ t().cloud.local }}</b>
              <span>{{ t().cloud.localHint }}</span>
            </div>
          </RouterLink>

          <div
            v-for="p in projects ?? []"
            :key="p.id"
            class="card project"
            :class="{ busy: busy === p.id }"
          >
            <button class="open" type="button" :title="t().cloud.open" @click="openProject(p.id)">
              <div class="thumb" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5Z" />
                </svg>
              </div>
              <div class="info">
                <b>{{ p.name }}</b>
                <span
                  >{{ t().cloud.count(p.count) }} ·
                  {{ t().cloud.updated(timeAgo(p.updated_at)) }}</span
                >
              </div>
            </button>
            <div class="more-wrap">
              <button
                class="more"
                type="button"
                :title="t().cloud.more"
                :aria-label="t().cloud.more"
                :aria-expanded="menuFor === p.id"
                :disabled="busy === p.id"
                @click="menuFor = menuFor === p.id ? null : p.id"
              >
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 12h.01M12 12h.01M18 12h.01" />
                </svg>
              </button>
              <div v-if="menuFor === p.id" class="pop" role="menu">
                <button
                  class="item"
                  type="button"
                  role="menuitem"
                  :disabled="!cloud.canUpdate"
                  :title="cloud.canUpdate ? undefined : t().cloud.updatePaused"
                  @click="rename(p)"
                >
                  {{ t().cloud.rename }}
                </button>
                <button
                  class="item"
                  type="button"
                  role="menuitem"
                  :disabled="!cloud.canCreate"
                  :title="cloud.createHint"
                  @click="duplicate(p)"
                >
                  {{ t().cloud.duplicate }}
                </button>
                <button class="item" type="button" role="menuitem" @click="exportJson(p)">
                  {{ t().cloud.exportJson }}
                </button>
                <button
                  class="item danger"
                  type="button"
                  role="menuitem"
                  :disabled="!cloud.canUpdate"
                  :title="cloud.canUpdate ? undefined : t().cloud.updatePaused"
                  @click="remove(p)"
                >
                  {{ t().cloud.delete }}
                </button>
              </div>
            </div>
          </div>
          <!-- while the list loads -->
          <template v-if="!projects && !listError">
            <div v-for="i in 2" :key="i" class="card project skeleton" aria-hidden="true">
              <div class="thumb"></div>
              <div class="info"><b></b><span></span></div>
            </div>
          </template>
        </div>
        <p v-if="!projects && !listError" class="sr-only" role="status">{{ t().cloud.loading }}</p>

        <p v-if="listError" class="note error">{{ listError }}</p>
        <p v-else-if="projects && !projects.length" class="note">{{ t().cloud.empty }}</p>

        <h2 class="section">{{ t().cloud.sharedWithMe }}</h2>
        <div v-if="!shared && !sharedError" class="grid" aria-hidden="true">
          <div class="card project skeleton">
            <div class="thumb"></div>
            <div class="info"><b></b><span></span></div>
          </div>
        </div>
        <div v-else-if="shared?.length" class="grid">
          <div v-for="p in shared" :key="p.id" class="card project">
            <button class="open" type="button" :title="t().cloud.open" @click="openProject(p.id)">
              <div class="thumb shared" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M3 19a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6 6 0 0 1 3 5.5" />
                </svg>
              </div>
              <div class="info">
                <b>{{ p.name }}</b>
                <span
                  >{{ t().share.people.roles[p.role] }} · {{ t().cloud.count(p.count) }} ·
                  {{ t().cloud.updated(timeAgo(p.updated_at)) }}</span
                >
              </div>
            </button>
          </div>
        </div>
        <p v-if="sharedError" class="note error">{{ sharedError }}</p>
        <p v-else-if="shared && !shared.length" class="note">{{ t().cloud.sharedEmpty }}</p>
      </template>
    </main>

    <NameDialog
      ref="nameDialog"
      :title="dialogText.title"
      :hint="dialogText.hint"
      :confirm="dialogText.confirm"
    />
    <div class="toast" :class="{ show: toast }" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* The app's body never scrolls (the planner is full-screen), so this page scrolls itself */
.page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  background: var(--bg);
}
.bar {
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 0;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  text-decoration: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.back:hover {
  background: #f4f1ea;
}
.main {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px 16px calc(40px + env(safe-area-inset-bottom, 0px));
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
h1 {
  margin: 0;
  font-size: 22px;
}
.primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: var(--yel);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: progress;
}
.ico {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.note {
  margin: 18px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.note.error {
  color: #b3261e;
}
.card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.signin {
  max-width: 420px;
  padding: 20px;
}
.signin h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.signin p {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted);
}

.section {
  margin: 32px 0 14px;
  font-size: 16px;
}
.thumb.shared {
  background: #eef4fb;
  color: #3a5f8a;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.project {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.project:hover {
  border-color: #d6cfbf;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07);
}
.project.busy {
  opacity: 0.6;
  pointer-events: none;
}
.open,
.local {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 12px;
  border: 0;
  background: none;
  text-align: left;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.local {
  border: 1px dashed #d6cfbf;
  background: var(--paper);
  box-shadow: none;
}
.open:focus-visible,
.local:focus-visible,
.more:focus-visible,
.item:focus-visible,
.back:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.thumb {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #fdf7e6;
  color: #8a6a1c;
}
.local .thumb {
  background: #fff;
  color: var(--muted);
}
.thumb svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.info b,
.info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info b {
  font-size: 14px;
}
.info span {
  font-size: 12px;
  color: var(--faint);
}
.more-wrap {
  position: relative;
  padding-right: 8px;
}
.more {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.more:hover,
.more[aria-expanded='true'] {
  background: #f4f1ea;
  color: var(--ink);
}
.more .ico {
  width: 20px;
  height: 20px;
  stroke-width: 3;
}
.pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 8px;
  z-index: 5;
  min-width: 160px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.item {
  display: block;
  width: 100%;
  padding: 8px 10px;
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
.item:disabled {
  color: var(--faint);
  cursor: default;
}
.banner {
  margin: 0 0 16px;
  padding: 10px 14px;
  border: 1px solid #ecd9a6;
  border-radius: 10px;
  background: #fdf7e6;
  font-size: 13px;
  color: #6b5317;
}
/* a card's shape while the list loads, gently pulsing */
.skeleton {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  pointer-events: none;
  animation: pulse 1.4s ease-in-out infinite;
}
.skeleton .thumb {
  background: #f1ede4;
}
.skeleton b,
.skeleton span {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: #f1ede4;
}
.skeleton b {
  width: 140px;
  margin-bottom: 6px;
}
.skeleton span {
  width: 90px;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.item.danger:hover:not(:disabled) {
  background: #fbe9e7;
  color: #b3261e;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  max-width: calc(100vw - 32px);
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--ink);
  color: #fff;
  font-size: 12.5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.toast.show {
  opacity: 1;
}
</style>
