<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { cloudMessage, timeAgo } from '@/cloud/messages'
import { createProject, isTransient } from '@/cloud/projects'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePalettesStore } from '@/stores/palettes'
import { usePlannerStore } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'
import { downloadJSON, stamp } from '@/venue/download'
import { clampSlots, exportLayout, type LayoutItem } from '@/venue/layout'
import type { ProjectSettings } from '@/cloud/projects'

/**
 * Over the stage, under the top bar, while a cloud project is open:
 * - saving keeps failing: why, whether it will try again, whether the changes are kept in this
 *   browser, and 匯出 JSON;
 * - changes from last time weren't saved: 復原 them (an undoable step) or 捨棄 them; when the
 *   cloud version has moved on since, 另存成新專案 instead of restoring over it.
 */

const project = useProjectStore()
const planner = usePlannerStore()
const palettes = usePalettesStore()
const auth = useAuthStore()
const editor = useVenueEditor()
const router = useRouter()
const busy = shallowRef(false)

const failMessage = computed(() =>
  project.failure ? t().cloud.errors[project.failure] : t().cloud.errors.failed,
)
const willRetry = computed(() => !!project.failure && isTransient(project.failure))
/** What happens next, after the reason (nothing to add when the buttons say it) */
const next = computed(() => {
  if (willRetry.value) return t().cloud.notice.willRetry
  if (project.failure === 'paused' || project.failure === 'signed_out') return ''
  return t().cloud.notice.wontRetry
})
/** Worth a 重試 by hand: what retries by itself, and a pause that may since have lifted */
const canRetry = computed(() => willRetry.value || project.failure === 'paused')
/** Saving here is over for them (no longer an editor, or the project out of reach): keep the work as their own project */
const canKeepAsNew = computed(
  () =>
    !!auth.user &&
    (project.failure === 'viewer' ||
      project.failure === 'gone' ||
      project.failure === 'link_off' ||
      project.failure === 'denied'),
)

function exportFile(items: readonly LayoutItem[], settings: ProjectSettings) {
  const pricing = {
    priceMode: settings.pricing?.priceMode ?? 0,
    slots: clampSlots(settings.pricing?.slots ?? 1),
  }
  downloadJSON(
    `${project.meta?.name ?? 'v-conf-taiwan-venue'}-${stamp()}.json`,
    exportLayout(items, { pricing, palettes: settings.palettes }),
  )
}

const exportCurrent = () =>
  exportFile(planner.items, {
    pricing: { priceMode: planner.priceMode, slots: planner.slots },
    palettes: palettes.palettes,
  })

function restore() {
  const d = project.draft
  if (!d) return
  // one undoable step; it then saves like any other change
  editor.value?.load(d.items, { record: true })
  if (d.settings.pricing?.priceMode !== undefined) planner.priceMode = d.settings.pricing.priceMode
  if (d.settings.pricing?.slots !== undefined) planner.setSlots(d.settings.pricing.slots)
  palettes.importPalettes(d.settings)
  project.dropDraft()
  planner.notify(t().cloud.notice.restored)
}

/** A new project of the person's own, from last time's draft or (no draft) the layout as it is now */
async function saveAsNew() {
  const d = project.draft
  if (!project.meta || !auth.user) return
  busy.value = true
  try {
    const name = t().cloud.copyName(project.meta.name)
    const id = await createProject(
      auth.user.id,
      name,
      d?.items ?? planner.items,
      d?.settings ?? {
        pricing: { priceMode: planner.priceMode, slots: planner.slots },
        palettes: palettes.palettes,
      },
    )
    project.dropDraft()
    planner.notify(t().cloud.duplicated(name))
    void router.push({ name: 'project', params: { projectId: id } })
  } catch (e) {
    planner.notify(cloudMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="project.meta && project.alert" class="notice error" role="alert" data-stage-ui>
    <div class="body">
      <b>{{ t().cloud.notice.failTitle }}</b>
      <p>{{ next ? failMessage + t().cloud.notice.sep + next : failMessage }}</p>
      <p v-if="project.kept !== null" class="small">
        {{ project.kept ? t().cloud.notice.kept : t().cloud.notice.notKept }}
      </p>
    </div>
    <div class="acts">
      <button
        v-if="project.failure === 'signed_out' && auth.available"
        class="btn primary"
        type="button"
        :disabled="auth.busy"
        @click="auth.chooseSignIn()"
      >
        {{ auth.busy ? t().auth.signingIn : t().auth.signIn }}
      </button>
      <button
        v-if="canKeepAsNew"
        class="btn primary"
        type="button"
        :disabled="busy"
        @click="saveAsNew"
      >
        {{ busy ? t().cloud.working : t().cloud.notice.saveAsNew }}
      </button>
      <button
        class="btn"
        :class="{ primary: project.failure !== 'signed_out' && !canKeepAsNew }"
        type="button"
        @click="exportCurrent"
      >
        {{ t().cloud.notice.exportJson }}
      </button>
      <button
        v-if="canRetry"
        class="btn"
        type="button"
        :disabled="project.status === 'saving'"
        @click="project.flush()"
      >
        {{ project.status === 'saving' ? t().cloud.status.saving : t().cloud.notice.retry }}
      </button>
      <button class="btn" type="button" @click="project.dismissAlert()">
        {{ t().cloud.notice.close }}
      </button>
    </div>
  </div>

  <div v-else-if="project.meta && project.draft" class="notice" role="dialog" data-stage-ui>
    <div class="body">
      <b>{{ t().cloud.notice.draftTitle }}</b>
      <p>{{ t().cloud.notice.draftHint(timeAgo(project.draft.at)) }}</p>
      <p v-if="project.draftConflict" class="small warn">{{ t().cloud.notice.draftConflict }}</p>
    </div>
    <div class="acts">
      <template v-if="project.draftConflict">
        <button class="btn primary" type="button" :disabled="busy" @click="saveAsNew">
          {{ busy ? t().cloud.working : t().cloud.notice.saveAsNew }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy"
          @click="exportFile(project.draft.items, project.draft.settings)"
        >
          {{ t().cloud.notice.exportJson }}
        </button>
      </template>
      <button v-else class="btn primary" type="button" @click="restore">
        {{ t().cloud.notice.restore }}
      </button>
      <button class="btn" type="button" :disabled="busy" @click="project.dropDraft()">
        {{ t().cloud.notice.discard }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.notice {
  position: absolute;
  top: var(--top-clear, 66px);
  left: 14px;
  right: 14px;
  z-index: 3;
  width: fit-content;
  max-width: min(520px, calc(100% - 28px));
  margin-inline: auto;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.14);
}
.notice.error {
  border-color: var(--danger-line);
}
.body b {
  font-size: 14px;
}
.error .body b {
  color: var(--danger);
}
.body p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.body .small {
  font-size: 12px;
  color: var(--faint);
}
.body .warn {
  color: var(--danger);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.btn {
  border: 1px solid var(--line);
  background: var(--surface);
}
.btn.primary {
  border-color: transparent;
  background: var(--yel);
  color: var(--on-yel);
  font-weight: 600;
}
.btn.primary:hover:not(:disabled) {
  background: var(--yel-hover);
}
@media (max-width: 720px) {
  .notice {
    left: 10px;
    right: 10px;
    max-width: none;
    width: auto;
  }
}
</style>
