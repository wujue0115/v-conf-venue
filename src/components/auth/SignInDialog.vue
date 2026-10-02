<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import SignInButtons from './SignInButtons.vue'

/**
 * 登入: which account to sign in with, for the buttons with room for only one (存到雲端,
 * 登入以編輯, signing in again after being signed out). Opened by `auth.chooseSignIn()`.
 */

const auth = useAuthStore()
const dialog = useTemplateRef('dialog')

watch(
  () => auth.choosing,
  (choosing) => {
    if (choosing && !dialog.value?.open) dialog.value?.showModal()
    else if (!choosing && dialog.value?.open) dialog.value.close()
  },
)

/** Closed by Esc, a click outside or 取消, but not once on the way to a provider */
function onCancel(e: Event) {
  if (auth.busy) e.preventDefault()
}
function onClick(e: MouseEvent) {
  if (e.target === dialog.value && !auth.busy) dialog.value?.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sign-in-dialog"
    @cancel="onCancel"
    @click="onClick"
    @close="auth.cancelSignIn()"
  >
    <div class="panel">
      <h3>{{ t().auth.chooseTitle }}</h3>
      <p class="hint">{{ t().auth.chooseHint }}</p>
      <SignInButtons class="buttons" />
      <div class="foot">
        <button class="txt" type="button" :disabled="auth.busy" @click="dialog?.close()">
          {{ t().cloud.cancel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.sign-in-dialog {
  width: min(340px, calc(100vw - 28px));
  max-width: none;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.sign-in-dialog::backdrop {
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
.buttons {
  margin-top: 14px;
}
.foot {
  display: flex;
  justify-content: flex-end;
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
.txt:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
