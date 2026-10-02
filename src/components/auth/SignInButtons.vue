<script setup lang="ts">
import { shallowRef } from 'vue'
import { t } from '@/i18n'
import { PROVIDERS, useAuthStore, type Provider } from '@/stores/auth'

/**
 * One button per account people sign in with (使用 Google 登入, 使用 GitHub 登入), stacked,
 * saying below them when leaving for one didn't work.
 */

const auth = useAuthStore()
const failed = shallowRef(false)

async function signIn(provider: Provider) {
  failed.value = false
  try {
    await auth.signIn(provider)
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <div class="sign-in-buttons">
    <button
      v-for="p in PROVIDERS"
      :key="p"
      class="sign-in"
      type="button"
      :disabled="auth.busy"
      @click="signIn(p)"
    >
      <svg v-if="p === 'google'" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="#4285f4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
        />
        <path
          fill="#34a853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06c-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        />
        <path
          fill="#fbbc05"
          d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z"
        />
        <path
          fill="#ea4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
        />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="#1f2328"
          d="M12 1a11 11 0 0 0-3.48 21.44c.55.1.75-.24.75-.53v-1.86c-3.06.66-3.7-1.48-3.7-1.48c-.5-1.27-1.22-1.61-1.22-1.61c-1-.68.08-.67.08-.67c1.1.08 1.68 1.13 1.68 1.13c.98 1.68 2.58 1.2 3.2.91c.1-.71.39-1.2.7-1.47c-2.44-.28-5-1.22-5-5.43c0-1.2.43-2.18 1.13-2.95c-.11-.28-.49-1.4.11-2.91c0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.42 3.02-1.13 3.02-1.13c.6 1.51.22 2.63.11 2.91c.7.77 1.13 1.75 1.13 2.95c0 4.22-2.57 5.15-5.02 5.42c.4.34.75 1.01.75 2.04v3.02c0 .29.2.64.76.53A11 11 0 0 0 12 1Z"
        />
      </svg>
      {{ auth.going === p ? t().auth.going[p] : t().auth.signInWith[p] }}
    </button>
    <p v-if="failed" class="failed" role="alert">{{ t().auth.signInFailed }}</p>
  </div>
</template>

<style scoped>
.sign-in-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sign-in {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.sign-in:hover:not(:disabled) {
  background: #f4f1ea;
  border-color: #d6cfbf;
}
.sign-in:disabled {
  cursor: progress;
  opacity: 0.7;
}
.sign-in:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.failed {
  margin: 0;
  font-size: 12px;
  color: #b3261e;
}
</style>
