<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRouter } from 'vue-router'
import SignInButtons from '@/components/auth/SignInButtons.vue'
import PlannerSidebar from '@/components/planner/PlannerSidebar.vue'
import VenueStage from '@/components/planner/VenueStage.vue'
import { provideVenueEditor } from '@/composables/useVenueEditor'
import { cloudMessage } from '@/cloud/messages'
import type { Grant } from '@/cloud/projects'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePlannerStore } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'

/**
 * The layout kept in this browser, or a cloud project: by its id (`projectId`, My projects) or
 * through its share link (`shareToken`)
 */
const props = defineProps<{ projectId?: string; shareToken?: string }>()
const cloud = computed(() => !!(props.projectId || props.shareToken))

provideVenueEditor()
const store = usePlannerStore()
const project = useProjectStore()
const auth = useAuthStore()
const router = useRouter()
const { sidebarCollapsed } = storeToRefs(store)

if (!cloud.value) store.openLocal()

// A project opens once the session is known, and again whenever who is signed in changes
watch(
  // each compared on its own (the user object is replaced whenever the session is refreshed)
  [() => auth.ready, () => auth.user?.id],
  ([ready, user]) => {
    if (!ready) return
    if (props.shareToken) void project.openShared(props.shareToken)
    else if (props.projectId) {
      if (user) void project.open(props.projectId)
      // signed out while it was open: it isn't theirs to see any more
      else if (project.meta) void router.push('/')
    }
  },
  { immediate: true },
)

const ready = computed(
  () =>
    !cloud.value ||
    (!!project.meta && !project.loading && !project.loadError && !project.shareDenied),
)
// Back from Google or GitHub without signing in or linking: say why, once the stage (and its
// toast) is showing; 'post' so it has mounted by then
watch(
  [() => auth.failure, ready],
  ([failure, shown]) => {
    if (!failure || !shown) return
    store.notify(t().auth.failures[failure])
    auth.failure = null
  },
  { immediate: true, flush: 'post' },
)

const needsSignIn = computed(
  () =>
    auth.ready &&
    !auth.user &&
    (!!props.projectId || project.shareDenied?.status === 'sign_in_required'),
)
const denied = computed(() => {
  const d = project.shareDenied
  if (!d || d.status === 'sign_in_required') return ''
  if (d.status === 'no_access') return d.requested ? t().share.requested : t().share.noAccess
  return t().share.notFound
})

/** Signed in through a link that doesn't let them in, and not asked yet: they may ask */
const canAsk = computed(
  () => project.shareDenied?.status === 'no_access' && !project.shareDenied.requested,
)
const asking = shallowRef(false)
const askError = shallowRef('')
async function ask(role: Grant) {
  asking.value = true
  askError.value = ''
  try {
    await project.requestAccess(role)
  } catch (e) {
    askError.value = cloudMessage(e)
  } finally {
    asking.value = false
  }
}

// The tab says which cloud project it is
watchEffect(() => {
  document.title = project.meta ? `${project.meta.name} · ${t().docTitle}` : t().docTitle
})
onBeforeUnmount(() => (document.title = t().docTitle))

// Whatever is still waiting is saved before the planner leaves the project
async function leave() {
  if (cloud.value) await project.close()
}
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
</script>

<template>
  <!--
    Everything floats over a full-size stage: ☰ and the tools along the top,
    the selected item's panel on the left, the furniture on the right. Opening
    or closing a panel never resizes the scene.
  -->
  <div v-if="ready" class="planner">
    <VenueStage class="planner-stage" />
    <PlannerSidebar
      id="planner-sidebar"
      class="library"
      :class="{ collapsed: sidebarCollapsed }"
      :inert="sidebarCollapsed"
      data-stage-ui
    />
  </div>

  <div v-else class="notice">
    <div class="card">
      <template v-if="needsSignIn">
        <h2>{{ shareToken ? t().share.signInTitle : t().cloud.signInTitle }}</h2>
        <p>{{ shareToken ? t().share.signInHint : t().cloud.signInHint }}</p>
        <SignInButtons class="providers" />
      </template>
      <template v-else-if="project.loadError || denied">
        <p>{{ denied || t().cloud.errors[project.loadError!] }}</p>
        <div v-if="canAsk" class="asks">
          <button class="primary" type="button" :disabled="asking" @click="ask('editor')">
            {{ t().share.request.editor }}
          </button>
          <button class="secondary" type="button" :disabled="asking" @click="ask('viewer')">
            {{ t().share.request.viewer }}
          </button>
        </div>
        <p v-if="askError" class="error">{{ askError }}</p>
        <div class="links">
          <RouterLink to="/projects">{{ t().cloud.myProjects }}</RouterLink>
          <RouterLink to="/">{{ t().cloud.local }}</RouterLink>
        </div>
      </template>
      <p v-else class="loading">{{ t().cloud.loading }}</p>
    </div>
  </div>
</template>

<style scoped>
.planner {
  /* how far down the panels start, clear of the top bar (one row; two on phones) */
  --top-clear: calc(66px + env(safe-area-inset-top, 0px));
  position: relative;
  height: 100vh;
  /* dvh = visible area on mobile (100vh includes the space under the browser toolbars) */
  height: 100dvh;
  overflow: hidden;
}
.planner > .planner-stage {
  position: absolute;
  inset: 0;
}
.library {
  position: absolute;
  top: var(--top-clear);
  right: 14px;
  /* leaves the ? button below it showing */
  bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  z-index: 2;
  width: 288px;
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
.library.collapsed {
  transform: translateX(calc(100% + 14px));
  opacity: 0;
}
/* Narrow screens: the top bar takes two rows */
@media (max-width: 871px) {
  .planner {
    --top-clear: calc(106px + env(safe-area-inset-top, 0px));
  }
}
/* Phones: one row on top again (the tools moved to the bottom bar, MobileDock) */
@media (max-width: 560px) {
  .planner {
    --top-clear: calc(66px + env(safe-area-inset-top, 0px));
  }
}
/* Phones: the furniture panel spans the width */
@media (max-width: 720px) {
  .library {
    left: 10px;
    right: 10px;
    bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    width: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .library {
    transition: none;
  }
}

.notice {
  display: grid;
  place-items: center;
  height: 100vh;
  height: 100dvh;
  padding: 16px;
}
.card {
  width: min(380px, 100%);
  padding: 20px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  text-align: center;
}
.card h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.card p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.providers {
  margin-top: 16px;
}
.loading {
  color: var(--faint);
}
.primary {
  margin-top: 16px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--yel);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: progress;
}
.asks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.asks .primary {
  margin-top: 16px;
}
.secondary {
  margin-top: 16px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.secondary:disabled {
  opacity: 0.6;
  cursor: progress;
}
.card p.error {
  margin-top: 10px;
  color: #b3261e;
}
.links {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 14px;
  font-size: 13px;
}
</style>
