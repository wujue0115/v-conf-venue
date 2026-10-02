<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { t } from '@/i18n'
import { PROVIDERS, useAuthStore } from '@/stores/auth'
import SignInButtons from './SignInButtons.vue'

/**
 * 登入: which account to sign in with, for the buttons with room for only one (存到雲端,
 * 登入以編輯, signing in again after being signed out). Opened by `auth.chooseSignIn()`.
 *
 * Also opens, on any page, when coming back from Google or GitHub didn't work: saying why, with
 * the other providers to sign in with instead when that would help.
 */

const auth = useAuthStore()
const dialog = useTemplateRef('dialog')
const failure = computed(() => auth.failure)

const title = computed(() => {
  const f = failure.value
  if (!f) return t().auth.chooseTitle
  return f.reason === 'linkedElsewhere' || f.reason === 'linkingOff'
    ? t().auth.linkFailedTitle
    : t().auth.signInFailedTitle
})
const hint = computed(() => {
  const f = failure.value
  if (!f) return t().auth.chooseHint
  if (f.reason === 'sameEmail')
    return t().auth.failures.sameEmail(f.provider ? t().auth.providerNames[f.provider] : '')
  return t().auth.failures[f.reason]
})
/** Where the provider lists the account's emails, to see which of them are clashing */
const EMAILS_PAGE = {
  github: 'https://github.com/settings/emails',
  google: 'https://myaccount.google.com/email',
} as const
const emailsPage = computed(() => {
  const f = failure.value
  return f?.reason === 'sameEmail' && f.provider ? EMAILS_PAGE[f.provider] : ''
})

/** The providers offered: all to choose from; after a failure, the others, if any would help */
const offered = computed(() => {
  const f = failure.value
  if (!f) return PROVIDERS
  if (f.reason === 'linkedElsewhere' || f.reason === 'linkingOff') return []
  return f.provider && f.reason === 'sameEmail'
    ? PROVIDERS.filter((p) => p !== f.provider)
    : PROVIDERS
})

// from mount, as a failure is known before the page is
onMounted(() =>
  watch(
    () => auth.choosing || !!auth.failure,
    (show) => {
      if (show && !dialog.value?.open) dialog.value?.showModal()
      else if (!show && dialog.value?.open) dialog.value.close()
    },
    { immediate: true },
  ),
)

function onClose() {
  auth.cancelSignIn()
  auth.failure = null
}

/** Closed by Esc, a click outside or 取消, but not once on the way to a provider */
function onCancel(e: Event) {
  if (auth.busy) e.preventDefault()
}
function onClick(e: MouseEvent) {
  if (e.target === dialog.value && !auth.busy) dialog.value?.close()
}
</script>

<template>
  <dialog ref="dialog" class="sign-in-dialog" @cancel="onCancel" @click="onClick" @close="onClose">
    <!-- Opening focuses the window itself rather than its first button or link: Tab goes on to them -->
    <div class="panel" tabindex="-1" autofocus>
      <h3>{{ title }}</h3>
      <p class="hint" :class="{ failure }">{{ hint }}</p>
      <a v-if="emailsPage" class="emails" :href="emailsPage" target="_blank" rel="noopener">
        {{ t().auth.seeEmails(t().auth.providerNames[failure!.provider!]) }}
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </a>
      <SignInButtons v-if="offered.length" class="buttons" :only="offered" />
      <div class="foot">
        <button class="txt" type="button" :disabled="auth.busy" @click="dialog?.close()">
          {{ offered.length ? t().cloud.cancel : t().auth.ok }}
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
.panel:focus {
  outline: none;
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
.hint.failure {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.emails {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12.5px;
  color: #6b5214;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.emails svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.emails:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
  border-radius: 3px;
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
