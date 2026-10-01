<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { NAME_MAX } from '@/cloud/projects'
import { t } from '@/i18n'

/**
 * Asks for a project's name: to save the layout to the cloud, start a new project, or rename
 * one. `open(initial, done)` shows it; on confirm it waits on `done(name)`, closing once that
 * succeeds and staying open (to try again) when it throws.
 */

defineProps<{
  title: string
  hint?: string
  confirm: string
}>()

const dialog = useTemplateRef('dialog')
const input = useTemplateRef('input')
const name = shallowRef('')
const busy = shallowRef(false)
let done: ((name: string) => Promise<void>) | null = null

function open(initial: string, onConfirm: (name: string) => Promise<void>) {
  name.value = initial
  done = onConfirm
  busy.value = false
  dialog.value?.showModal()
  requestAnimationFrame(() => input.value?.select())
}

async function onSubmit() {
  const n = name.value.trim()
  if (!n || !done || busy.value) return
  busy.value = true
  try {
    await done(n)
    dialog.value?.close()
  } catch {
    // the caller has said what went wrong; the name stays for another try
  } finally {
    busy.value = false
  }
}

/** Esc or a click outside cancels, but not while saving */
function onCancel(e: Event) {
  if (busy.value) e.preventDefault()
}
function onClick(e: MouseEvent) {
  if (e.target === dialog.value && !busy.value) dialog.value?.close()
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="name-dialog" @cancel="onCancel" @click="onClick">
    <form class="panel" @submit.prevent="onSubmit">
      <h3>{{ title }}</h3>
      <p v-if="hint" class="hint">{{ hint }}</p>
      <label class="field">
        <span>{{ t().cloud.name }}</span>
        <input
          ref="input"
          v-model="name"
          :maxlength="NAME_MAX"
          :placeholder="t().cloud.namePlaceholder"
          :disabled="busy"
          required
        />
      </label>
      <div class="foot">
        <button class="txt" type="button" :disabled="busy" @click="dialog?.close()">
          {{ t().cloud.cancel }}
        </button>
        <button class="txt ok" type="submit" :disabled="busy || !name.trim()">
          {{ busy ? t().cloud.working : confirm }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.name-dialog {
  width: min(400px, calc(100vw - 28px));
  max-width: none;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.name-dialog::backdrop {
  background: rgba(31, 33, 38, 0.25);
}
.panel {
  padding: 14px 16px 16px;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--faint);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
}
.field input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  font: inherit;
  font-size: 14px;
  color: var(--ink);
}
.field input:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.txt {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.txt.ok {
  border-color: transparent;
  background: var(--yel);
  color: var(--ink);
  font-weight: 600;
}
.txt:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
