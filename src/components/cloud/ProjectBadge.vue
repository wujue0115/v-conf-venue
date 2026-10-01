<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import NameDialog from './NameDialog.vue'
import { cloudMessage } from '@/cloud/messages'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useCloudStore } from '@/stores/cloud'
import { usePlannerStore } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'

/**
 * Next to ☰ while a cloud project is open: its name (its owner clicks it to rename) and whether
 * the latest changes are saved, with 重試 when saving failed; 離線 with no connection, and
 * 暫停編輯 while app_settings has the cloud's changes paused. Someone only viewing sees 唯讀,
 * with 要求編輯 to ask the owner (已要求編輯 once asked); a guest sees 登入以編輯, since signing
 * in may let them edit.
 */

const project = useProjectStore()
const planner = usePlannerStore()
const auth = useAuthStore()
const cloud = useCloudStore()
const canRename = computed(() => project.meta?.role === 'owner' && project.canEdit)
const renameDialog = useTemplateRef('renameDialog')

const state = computed(() => {
  if (project.paused) return 'paused'
  if (!project.canEdit) return 'readOnly'
  // saving waits for the connection (a failure says so itself)
  if (cloud.offline && project.status !== 'error') return 'offline'
  return project.status
})
const hint = computed(() =>
  state.value === 'paused' || state.value === 'offline'
    ? t().cloud.statusHint[state.value]
    : undefined,
)
/** Signed in and only viewing: they may ask the owner to edit */
const canAsk = computed(
  () => state.value === 'readOnly' && !!auth.user && project.meta?.role === 'viewer',
)
const asking = shallowRef(false)

async function askToEdit() {
  asking.value = true
  try {
    await project.requestAccess('editor')
    planner.notify(project.canEdit ? t().share.request.already : t().share.request.editSentTitle)
  } catch (e) {
    planner.notify(cloudMessage(e))
  } finally {
    asking.value = false
  }
}
const label = computed(() => t().cloud.status[state.value])

function rename() {
  if (!project.meta || !canRename.value) return
  renameDialog.value?.open(project.meta.name, async (name) => {
    try {
      await project.rename(name)
      planner.notify(t().cloud.renamed)
    } catch (e) {
      planner.notify(cloudMessage(e))
      throw e
    }
  })
}
</script>

<template>
  <div v-if="project.meta" class="badge grp">
    <button
      class="name"
      type="button"
      :title="canRename ? t().cloud.rename : project.meta.name"
      :disabled="!canRename"
      @click="rename"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5Z" />
      </svg>
      <span class="text">{{ project.meta.name }}</span>
    </button>
    <span class="status" :class="state" role="status" :title="hint">
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ label }}</span>
    </span>
    <button v-if="state === 'error'" class="retry" type="button" @click="project.flush()">
      {{ t().cloud.status.retry }}
    </button>
    <button
      v-else-if="state === 'readOnly' && auth.available && auth.ready && !auth.user"
      class="retry"
      type="button"
      :disabled="auth.busy"
      @click="auth.signInWithGoogle()"
    >
      {{ t().share.signInToEdit }}
    </button>
    <span
      v-else-if="canAsk && project.meta.requested === 'editor'"
      class="asked"
      :title="t().share.request.editSentTitle"
    >
      {{ t().share.request.editSent }}
    </span>
    <button
      v-else-if="canAsk"
      class="retry"
      type="button"
      :title="t().share.request.editTitle"
      :disabled="asking"
      @click="askToEdit"
    >
      {{ t().share.request.edit }}
    </button>
    <NameDialog ref="renameDialog" :title="t().cloud.renameTitle" :confirm="t().cloud.rename" />
  </div>
</template>

<style scoped>
.badge {
  align-items: center;
  min-width: 0;
  height: 38px;
  padding: 3px 10px 3px 3px;
  gap: 8px;
}
.name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.name:hover:not(:disabled) {
  background: #f4f1ea;
}
.name:disabled {
  cursor: default;
  color: inherit;
}
.name:focus-visible,
.retry:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ico {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.8;
  stroke-linejoin: round;
}
.status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--faint);
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #42b883;
}
.pending .dot,
.saving .dot {
  background: var(--yel);
}
.error {
  color: #b3261e;
}
.error .dot {
  background: #d93025;
}
.readOnly .dot,
.paused .dot {
  background: var(--faint);
}
.offline .dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--faint);
}
.asked {
  font-size: 12px;
  color: var(--faint);
  white-space: nowrap;
}
.retry {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
/* Narrow screens: the name gives way first, then the status is just its dot */
@media (max-width: 871px) {
  .text {
    max-width: 120px;
  }
}
@media (max-width: 560px) {
  .label {
    display: none;
  }
  .text {
    max-width: 80px;
  }
}
</style>
