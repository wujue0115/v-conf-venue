<script setup lang="ts">
import { shallowRef } from 'vue'
import { t } from '@/i18n'
import { PROVIDERS, useAuthStore, type Provider } from '@/stores/auth'
import ProviderIcon from './ProviderIcon.vue'

/**
 * One button per account people sign in with (使用 Google 登入, 使用 GitHub 登入), stacked,
 * saying below them when leaving for one didn't work. `only` keeps to some of them.
 */

const props = defineProps<{ only?: readonly Provider[] }>()
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
      v-for="p in props.only ?? PROVIDERS"
      :key="p"
      class="sign-in"
      type="button"
      :disabled="auth.busy"
      @click="signIn(p)"
    >
      <ProviderIcon :provider="p" />
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
  background: var(--surface);
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
  background: var(--hover);
  border-color: var(--line-strong);
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
  color: var(--danger);
}
</style>
