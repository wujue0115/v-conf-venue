<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { t } from '@/i18n'

/**
 * Asks before something that can't be undone, offering one or more ways on besides 取消.
 * `ask(...)` shows it and resolves with the chosen action's `value`, or null when cancelled
 * (取消, Esc or a click outside).
 */

export interface ConfirmAction {
  label: string
  value: string
  /** Deletes or replaces something: shown in red */
  danger?: boolean
}

const dialog = useTemplateRef('dialog')
const title = shallowRef('')
const message = shallowRef('')
const actions = shallowRef<readonly ConfirmAction[]>([])
let answer: ((value: string | null) => void) | null = null

function ask(o: { title: string; message?: string; actions: readonly ConfirmAction[] }) {
  answer?.(null)
  title.value = o.title
  message.value = o.message ?? ''
  actions.value = o.actions
  dialog.value?.showModal()
  return new Promise<string | null>((resolve) => (answer = resolve))
}

function done(value: string | null) {
  const a = answer
  answer = null
  dialog.value?.close()
  a?.(value)
}

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) done(null)
}

defineExpose({ ask })
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    @cancel.prevent="done(null)"
    @close="answer && done(null)"
    @click="onClick"
  >
    <div class="panel">
      <h3>{{ title }}</h3>
      <p v-if="message" class="msg">{{ message }}</p>
      <div class="foot">
        <button class="txt" type="button" @click="done(null)">{{ t().scenes.cancel }}</button>
        <button
          v-for="(a, i) in actions"
          :key="a.value"
          class="txt"
          :class="a.danger ? 'danger' : i === actions.length - 1 ? 'ok' : ''"
          type="button"
          @click="done(a.value)"
        >
          {{ a.label }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(400px, calc(100vw - 28px));
  max-width: none;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.confirm-dialog::backdrop {
  background: var(--backdrop);
}
.panel {
  padding: 14px 16px 16px;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.msg {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.txt {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.txt.ok {
  border-color: transparent;
  background: var(--yel);
  color: var(--on-yel);
  font-weight: 600;
}
.txt.danger {
  border-color: transparent;
  background: var(--danger-strong);
  color: #fff;
  font-weight: 600;
}
.txt:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
}
</style>
