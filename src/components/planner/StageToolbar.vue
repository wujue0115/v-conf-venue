<script setup lang="ts">
import { useTemplateRef } from 'vue'
import LibraryButton from './LibraryButton.vue'
import MainMenu from './MainMenu.vue'
import ModeSwitch from './ModeSwitch.vue'
import OnlineUsers from '@/components/cloud/OnlineUsers.vue'
import ProjectBadge from '@/components/cloud/ProjectBadge.vue'
import ShareDialog from '@/components/cloud/ShareDialog.vue'
import StageSettings from './StageSettings.vue'
import { useCameraViews } from '@/composables/useCameraViews'
import { usePhone } from '@/composables/usePhone'
import { useProjectStore } from '@/stores/project'
import { useAccessStore } from '@/stores/access'
import { t } from '@/i18n'

const project = useProjectStore()
const access = useAccessStore()
const shareDialog = useTemplateRef('shareDialog')
const phone = usePhone()
const { views, active, flyTo } = useCameraViews()
</script>

<template>
  <div class="topbars" :class="{ cloud: !!project.meta }">
    <div class="bar menu" data-stage-ui>
      <MainMenu />
      <ProjectBadge />
    </div>
    <!-- phones have these in the bottom bar (MobileDock) -->
    <div v-if="!phone" class="bar tools" data-stage-ui>
      <ModeSwitch />
    </div>
    <div v-if="!phone" class="bar views" data-stage-ui>
      <div class="grp">
        <button
          v-for="(v, i) in views"
          :key="v.key"
          class="btn"
          :class="{ on: active === i }"
          @click="flyTo(v, i)"
        >
          {{ t().views[v.key] }}
        </button>
      </div>
    </div>
    <div class="bar side" data-stage-ui>
      <OnlineUsers />
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
      <!-- on phones its button is in ☰, but its panel still opens from here -->
      <StageSettings />
      <LibraryButton v-if="!phone" />
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
/*
 * Narrower screens with a cloud project open: its name, the faces and 分享 don't fit beside the
 * tools and views, so the top row is ☰ and the name (taking the room there is, and giving way
 * first) with the side buttons, and the tools start the row of views below (the views
 * scrolling sideways when they run out of room)
 */
@media (max-width: 1080px) {
  .topbars.cloud {
    display: flex;
    flex-wrap: wrap;
    row-gap: 0;
  }
  .cloud .menu {
    order: 1;
    flex: 1 1 0;
  }
  .cloud .side {
    order: 2;
    flex: none;
  }
  /* the break between the two rows */
  .topbars.cloud::after {
    content: '';
    order: 3;
    flex-basis: 100%;
    height: 0;
  }
  .cloud .tools {
    order: 4;
    flex: none;
    margin-top: 6px;
  }
  .cloud .views {
    order: 5;
    flex: 1 1 0;
    margin-top: 6px;
  }
}
/* Phones: 分享 is just its icon */
@media (max-width: 480px) {
  .share-label {
    display: none;
  }
  .share {
    padding: 0 10px;
  }
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
.ico {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
