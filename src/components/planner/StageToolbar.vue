<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import MainMenu from './MainMenu.vue'
import ProjectBadge from '@/components/cloud/ProjectBadge.vue'
import ShareDialog from '@/components/cloud/ShareDialog.vue'
import StageSettings from './StageSettings.vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore, type PlannerMode } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'
import { useAccessStore } from '@/stores/access'
import { VIEWS, type CameraView } from '@/venue/places'
import { t } from '@/i18n'

const store = usePlannerStore()
const project = useProjectStore()
const access = useAccessStore()
const shareDialog = useTemplateRef('shareDialog')
const editor = useVenueEditor()
const activeView = shallowRef(0)

const MODES = computed(() =>
  (['view', 'edit'] as PlannerMode[]).map((mode) => ({ mode, ...t().modes[mode] })),
)

function flyTo(view: CameraView, i: number) {
  activeView.value = i
  editor.value?.flyTo(view)
}
</script>

<template>
  <div class="topbars">
    <div class="bar menu" data-stage-ui>
      <MainMenu />
      <ProjectBadge />
    </div>
    <div class="bar tools" data-stage-ui>
      <div
        class="grp mode"
        :class="{ edit: store.editing }"
        role="radiogroup"
        :aria-label="t().modes.label"
      >
        <span class="thumb" aria-hidden="true"></span>
        <button
          v-for="m in MODES"
          :key="m.mode"
          class="btn"
          :class="{ cur: (store.editing ? 'edit' : 'view') === m.mode }"
          role="radio"
          :aria-checked="(store.editing ? 'edit' : 'view') === m.mode"
          :aria-label="m.label"
          :title="store.readOnly ? t().palette.readOnly : `${m.label} · ${m.title}`"
          :disabled="store.readOnly"
          @click="store.mode = m.mode"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="m.mode === 'view'">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </template>
            <template v-else>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </template>
          </svg>
        </button>
      </div>
      <!-- 多選: always shown (greyed in View mode) so the bar doesn't shift when the mode changes -->
      <div class="grp">
        <button
          class="btn"
          :class="{ on: store.multiSelect && store.editing }"
          type="button"
          :aria-pressed="store.multiSelect && store.editing"
          :aria-label="t().multi.label"
          :disabled="!store.editing"
          :title="`${t().multi.label} · ${store.editing ? t().multi.title : t().multi.editOnly}`"
          @click="store.multiSelect = !store.multiSelect"
        >
          <!-- a dashed selection box around two items -->
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="3" stroke-dasharray="3 2.4" />
            <rect x="6.5" y="6.5" width="5" height="5" rx="1" />
            <rect x="12.5" y="12.5" width="5" height="5" rx="1" />
          </svg>
        </button>
      </div>
    </div>
    <div class="bar views" data-stage-ui>
      <div class="grp">
        <button
          v-for="(v, i) in VIEWS"
          :key="v.key"
          class="btn"
          :class="{ on: activeView === i }"
          @click="flyTo(v, i)"
        >
          {{ t().views[v.key] }}
        </button>
      </div>
    </div>
    <div class="bar side" data-stage-ui>
      <!-- the owner's only -->
      <button
        v-if="project.meta?.role === 'owner'"
        class="share grp"
        type="button"
        :title="
          access.requestCount
            ? `${t().share.buttonTitle} · ${t().share.requestCount(access.requestCount)}`
            : t().share.buttonTitle
        "
        @click="shareDialog?.open()"
      >
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        <span class="share-label">{{ t().share.button }}</span>
        <!-- people waiting on the owner's answer -->
        <span v-if="access.requestCount" class="count">
          <span aria-hidden="true">{{ access.requestCount > 9 ? '9+' : access.requestCount }}</span>
          <span class="sr-only">{{ t().share.requestCount(access.requestCount) }}</span>
        </span>
      </button>
      <ShareDialog ref="shareDialog" />
      <StageSettings />
      <div class="grp">
        <button
          class="btn lib"
          :class="{ on: !store.sidebarCollapsed }"
          type="button"
          :title="store.sidebarCollapsed ? t().sidebar.open : t().sidebar.close"
          :aria-expanded="!store.sidebarCollapsed"
          aria-controls="planner-sidebar"
          @click="store.sidebarCollapsed = !store.sidebarCollapsed"
        >
          <!-- an armchair -->
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
            <path
              d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 4 0v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM5 19v2M19 19v2"
            />
          </svg>
          <span class="lib-label">{{ t().sidebar.title }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topbars {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 14px;
  right: 14px;
  /*
   * ☰ at the left, the tools and views in the middle of the screen, the
   * settings and the furniture panel's button at the right
   */
  display: grid;
  grid-template-columns: 1fr auto auto 1fr;
  grid-template-areas: 'menu tools views side';
  align-items: start;
  gap: 6px;
  pointer-events: none;
}
.bar {
  display: flex;
  gap: 6px;
  pointer-events: auto;
}
.menu {
  grid-area: menu;
  justify-self: start;
  /* a long project name gives way rather than push the tools aside */
  min-width: 0;
  max-width: 100%;
}
.tools {
  grid-area: tools;
}
.views {
  grid-area: views;
}
.side {
  grid-area: side;
  justify-self: end;
}
/* Narrow screens: the views get a row of their own, under the rest */
@media (max-width: 871px) {
  .topbars {
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'menu tools side'
      'views views views';
  }
  .tools,
  .views {
    justify-self: center;
    min-width: 0;
    max-width: 100%;
  }
  /* on the narrowest phones the views scroll sideways rather than overflow */
  .views .grp {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
}
/* Phones: the furniture button is just its icon */
@media (max-width: 480px) {
  .lib-label,
  .share-label {
    display: none;
  }
  .share {
    padding: 0 10px;
  }
}

.lib {
  padding: 0 10px;
}
.share {
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px 0 12px;
  border-color: transparent;
  background: var(--yel);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.share:hover {
  background: #e0a71f;
}
.share {
  position: relative;
}
.count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #d93025;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.share:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.mode .btn:disabled {
  cursor: not-allowed;
}
/* Mode switch: one yellow thumb slides between two equal halves */
.mode {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  /* one column: (inner width − the 2px gap) / 2 */
  width: calc((100% - 8px) / 2);
  border-radius: 7px;
  background: var(--yel);
  transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.mode.edit .thumb {
  transform: translateX(calc(100% + 2px));
}
.mode .btn {
  position: relative;
  background: transparent;
  transition: color 0.2s;
}
.mode .btn:not(.cur) {
  color: var(--muted);
}
.mode .btn:not(.cur):hover {
  color: var(--ink);
}
/* icon-only buttons: square, their name in the tooltip and aria-label */
.tools .btn {
  width: 34px;
  padding: 0;
  display: grid;
  place-items: center;
}
.ico {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
