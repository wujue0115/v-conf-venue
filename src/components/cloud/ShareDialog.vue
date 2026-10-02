<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import SharePeople from './SharePeople.vue'
import { cloudMessage } from '@/cloud/messages'
import { projectPath, type EditAccess, type Sharing, type ViewAccess } from '@/cloud/projects'
import { t } from '@/i18n'
import { useCloudStore } from '@/stores/cloud'
import { useProjectStore } from '@/stores/project'

/**
 * 分享, for the project's owner: sharing on or off (off, only the owner can open the project), the
 * share link (copy, replace), who may view through it and who may edit, and the people added by
 * email or asking for access (SharePeople). Each change is saved at once. Editing never reaches further than viewing:
 * letting signed-in people edit lets them view too, and keeping viewing to named people keeps
 * editing to them as well.
 */

const project = useProjectStore()
const cloud = useCloudStore()
const dialog = useTemplateRef('dialog')
const people = useTemplateRef('people')
const busy = shallowRef(false)
/** Why the last change failed, shown in the window (a toast would sit behind it) */
const error = shallowRef('')
/** The cloud has changes paused: everything here is just shown */
const locked = computed(() => busy.value || !cloud.canUpdate)
const copied = shallowRef(false)

const sharing = computed(() => project.meta?.sharing ?? null)
const link = computed(() =>
  sharing.value && project.meta
    ? location.origin + projectPath(project.meta.id, sharing.value.share_token)
    : '',
)

const VIEW: ViewAccess[] = ['anyone', 'authenticated', 'allowed']
const EDIT: EditAccess[] = ['authenticated', 'allowed']

function open() {
  copied.value = false
  error.value = ''
  dialog.value?.showModal()
  void people.value?.refresh()
}

async function change(patch: Partial<Sharing>) {
  if (locked.value) return
  busy.value = true
  error.value = ''
  try {
    await project.setSharing(patch)
  } catch (e) {
    error.value = cloudMessage(e)
  } finally {
    busy.value = false
  }
}

function setView(v: ViewAccess) {
  // named people only can't sit alongside anyone signed in editing
  change(v === 'allowed' ? { view_access: v, edit_access: 'allowed' } : { view_access: v })
}
function setEdit(e: EditAccess) {
  change(
    e === 'authenticated' && sharing.value?.view_access === 'allowed'
      ? { edit_access: e, view_access: 'authenticated' }
      : { edit_access: e },
  )
}

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = t().share.copyFailed
  }
}

function replaceLink() {
  if (!confirm(t().share.replaceConfirm)) return
  change({ share_token: crypto.randomUUID() })
}

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close()
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="share-dialog" @click="onClick">
    <div v-if="sharing && project.meta" class="panel">
      <div class="title">
        <h3>{{ t().share.title(project.meta.name) }}</h3>
        <button
          class="x"
          type="button"
          :aria-label="t().share.close"
          :title="t().share.close"
          @click="dialog?.close()"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <p v-if="!cloud.canUpdate" class="paused" role="status">{{ t().cloud.updatePaused }}</p>

      <label class="row switch-row">
        <span class="txt">
          <b>{{ t().share.enabled }}</b>
          <i>{{ sharing.share_enabled ? t().share.enabledHint : t().share.disabledHint }}</i>
        </span>
        <button
          class="switch"
          :class="{ on: sharing.share_enabled }"
          type="button"
          role="switch"
          :aria-checked="sharing.share_enabled"
          :disabled="locked"
          @click="change({ share_enabled: !sharing.share_enabled })"
        >
          <span class="knob"></span>
        </button>
      </label>

      <div class="link" :class="{ off: !sharing.share_enabled }">
        <input
          :value="link"
          readonly
          :aria-label="t().share.link"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="copy" type="button" :disabled="!sharing.share_enabled" @click="copy">
          {{ copied ? t().share.copied : t().share.copy }}
        </button>
      </div>

      <fieldset :disabled="locked || !sharing.share_enabled">
        <legend>{{ t().share.view }}</legend>
        <label v-for="v in VIEW" :key="v" class="opt">
          <input
            type="radio"
            name="view"
            :checked="sharing.view_access === v"
            @change="setView(v)"
          />
          <span>{{ t().share.viewOptions[v] }}</span>
        </label>
      </fieldset>

      <fieldset :disabled="locked || !sharing.share_enabled">
        <legend>{{ t().share.edit }}</legend>
        <label v-for="e in EDIT" :key="e" class="opt">
          <input
            type="radio"
            name="edit"
            :checked="sharing.edit_access === e"
            @change="setEdit(e)"
          />
          <span>{{ t().share.editOptions[e] }}</span>
        </label>
      </fieldset>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <SharePeople ref="people" />

      <div class="foot">
        <button class="replace" type="button" :disabled="locked" @click="replaceLink">
          {{ t().share.replace }}
        </button>
        <button class="txt-btn ok" type="button" @click="dialog?.close()">
          {{ t().share.done }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.share-dialog {
  width: min(460px, calc(100vw - 28px));
  max-width: none;
  max-height: calc(100dvh - 28px);
  /* the panel scrolls inside, so the scrollbar stays within the rounded corners */
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.share-dialog::backdrop {
  background: rgba(31, 33, 38, 0.25);
}
.panel {
  /* the window's height, less its border */
  max-height: calc(100dvh - 30px);
  overflow-y: auto;
  padding: 14px 16px 16px;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
}
h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.x:hover {
  background: #f4f1ea;
  color: var(--ink);
}
.x svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
.txt b {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.txt i {
  display: block;
  font-style: normal;
  font-size: 12px;
  color: var(--faint);
}

/* the same switch as ⚙'s */
.switch {
  flex: none;
  position: relative;
  width: 36px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #dcd7cb;
  cursor: pointer;
  transition: background 0.2s;
}
.switch.on {
  background: var(--yel);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.switch.on .knob {
  transform: translateX(16px);
}
.switch:disabled {
  opacity: 0.6;
  cursor: progress;
}

.link {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.link input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  font: 12px var(--mono);
  color: var(--ink);
}
.link.off input {
  color: var(--faint);
  text-decoration: line-through;
}
.copy {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: var(--yel);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.copy:disabled {
  opacity: 0.45;
  cursor: default;
}
fieldset {
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}
fieldset:disabled .opt {
  opacity: 0.5;
}
legend {
  margin-bottom: 4px;
  padding: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--faint);
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.opt:hover {
  background: #f8f6f0;
}
.opt input {
  margin: 0;
  accent-color: #b07d0c;
}
.error {
  margin: 12px 0 0;
  font-size: 12px;
  color: #b3261e;
}
.paused {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid #ecd9a6;
  border-radius: 8px;
  background: #fdf7e6;
  font-size: 12px;
  color: #6b5317;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
}
.replace {
  padding: 0;
  border: 0;
  background: none;
  font-size: 12px;
  color: var(--muted);
  text-decoration: underline;
  cursor: pointer;
}
.replace:hover:not(:disabled) {
  color: #b3261e;
}
.txt-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.txt-btn.ok {
  border-color: transparent;
  background: var(--yel);
  font-weight: 600;
}
.x:focus-visible,
.switch:focus-visible,
.copy:focus-visible,
.replace:focus-visible,
.txt-btn:focus-visible,
.link input:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .knob {
    transition: none;
  }
}
</style>
