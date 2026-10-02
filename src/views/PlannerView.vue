<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRouter } from 'vue-router'
import SignInButtons from '@/components/auth/SignInButtons.vue'
import PlannerSidebar from '@/components/planner/PlannerSidebar.vue'
import StageToast from '@/components/planner/StageToast.vue'
import VenueStage from '@/components/planner/VenueStage.vue'
import { provideVenueEditor } from '@/composables/useVenueEditor'
import { cloudMessage } from '@/cloud/messages'
import type { Grant } from '@/cloud/projects'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePlannerStore } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'

/**
 * The layout kept in this browser, or a cloud project by its link: its id (`projectId`), with
 * the share token (`shareToken`, ?share=) while sharing is on. An old /share/:token link that
 * didn't let them in has just the token.
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
    if (props.projectId) {
      if (user || props.shareToken) void project.openLink(props.projectId, props.shareToken ?? null)
      // signed out while it was open by id alone: it isn't theirs to see any more, but its page
      // stays, asking them to sign in again
      else void project.close()
    } else if (props.shareToken) void project.openShared(props.shareToken)
  },
  { immediate: true },
)

// The address is the project's link: its id, with the share token while sharing is on (as its
// owner sets it; anyone else keeps the token they came with), so copying it passes it on
watch(
  () => project.meta,
  (m) => {
    if (!m || !cloud.value) return
    const s = m.sharing
    const token = s ? (s.share_enabled ? s.share_token : undefined) : props.shareToken
    if (props.projectId === m.id && props.shareToken === token) return
    void router.replace({
      name: 'project',
      params: { projectId: m.id },
      query: token ? { share: token } : {},
    })
  },
)

const ready = computed(
  () =>
    !cloud.value ||
    (!!project.meta && !project.loading && !project.loadError && !project.shareDenied),
)
const needsSignIn = computed(
  () =>
    auth.ready &&
    !auth.user &&
    ((!!props.projectId && !props.shareToken) ||
      project.shareDenied?.status === 'sign_in_required'),
)
const denied = computed(() => {
  const d = project.shareDenied
  if (!d || d.status === 'sign_in_required') return ''
  if (d.status === 'no_access') {
    if (d.requested) return t().share.requested
    // by id alone, a project they can't open looks the same as one that isn't there
    return d.byId ? t().cloud.errors.not_found : t().share.noAccess
  }
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
// not when only the share token in the address changes (the owner turned sharing on or off)
onBeforeRouteUpdate((to, from) => {
  if (to.params.projectId !== from.params.projectId) return leave()
})
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
        <h2>{{ t().share.signInTitle }}</h2>
        <p>{{ t().share.signInHint }}</p>
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
    <!-- 已登出 and the like, given as the project closed for this card -->
    <StageToast />
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
  /* no top bar here: the toast sits near the top */
  --top-clear: calc(24px + env(safe-area-inset-top, 0px));
  position: relative;
  display: grid;
  place-items: center;
  height: 100vh;
  height: 100dvh;
  padding: 16px;
}
.card {
  width: min(380px, 100%);
  padding: 20px;
  background: var(--surface);
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
  color: var(--on-yel);
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
  background: var(--surface);
  font-size: 13px;
  cursor: pointer;
}
.secondary:disabled {
  opacity: 0.6;
  cursor: progress;
}
.card p.error {
  margin-top: 10px;
  color: var(--danger);
}
.links {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 14px;
  font-size: 13px;
}
</style>
