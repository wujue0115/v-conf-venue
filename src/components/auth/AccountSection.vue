<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { t } from '@/i18n'
import { PROVIDERS, useAuthStore, type Provider } from '@/stores/auth'
import { usePlannerStore } from '@/stores/planner'
import ProviderIcon from './ProviderIcon.vue'
import SignInButtons from './SignInButtons.vue'

/**
 * Who is signed in, in ☰: 使用 Google 登入 and 使用 GitHub 登入 while signed out; once signed
 * in, the person's picture, name and email, the providers they sign in with, and 連結 for the
 * others (☰ lists 登出 with its other items).
 */

const auth = useAuthStore()
const planner = usePlannerStore()
const unlinked = computed(() => PROVIDERS.filter((p) => !auth.linked.has(p)))

async function link(provider: Provider) {
  try {
    await auth.link(provider)
  } catch {
    planner.notify(t().auth.failures.failed)
  }
}
/** Their picture didn't load: show the initial instead */
const avatarFailed = shallowRef(false)
watch(
  () => auth.avatar,
  () => (avatarFailed.value = false),
)
</script>

<template>
  <!-- Takes its height before the session is known, so the menu doesn't jump -->
  <div class="account">
    <template v-if="auth.ready">
      <SignInButtons v-if="!auth.user" class="providers" />

      <div v-else class="me">
        <span class="avatar" aria-hidden="true">
          <img
            v-if="auth.avatar && !avatarFailed"
            :src="auth.avatar"
            alt=""
            referrerpolicy="no-referrer"
            @error="avatarFailed = true"
          />
          <template v-else>{{ auth.name.charAt(0).toUpperCase() }}</template>
        </span>
        <span class="who">
          <b>{{ auth.name }}</b>
          <i v-if="auth.email !== auth.name">{{ auth.email }}</i>
        </span>
      </div>
      <div v-if="auth.user" class="providers-row">
        <span class="label">{{ t().auth.signsInWith }}</span>
        <span
          v-for="p in PROVIDERS.filter((p) => auth.linked.has(p))"
          :key="p"
          class="linked"
          :title="t().auth.providerNames[p]"
        >
          <ProviderIcon :provider="p" />
        </span>
        <button
          v-for="p in unlinked"
          :key="p"
          class="link"
          type="button"
          :disabled="auth.busy"
          :title="t().auth.linkHint(t().auth.providerNames[p])"
          @click="link(p)"
        >
          <ProviderIcon :provider="p" />
          {{ auth.going === p ? t().auth.going[p] : t().auth.link[p] }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.account {
  /* the signed-in layout's height, so it doesn't grow once a signed-in session is known */
  min-height: 44px;
}
.providers {
  margin: 4px 0;
}
.providers-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 8px 6px 50px;
}
.label {
  font-size: 11.5px;
  color: var(--muted);
}
.linked {
  display: inline-flex;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
}
.link :deep(svg) {
  width: 13px;
  height: 13px;
}
.link:hover:not(:disabled) {
  background: #f4f1ea;
}
.link:disabled {
  cursor: progress;
  opacity: 0.7;
}
.link:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 6px;
}
.avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f4f1ea;
  border: 1px solid var(--line);
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  color: #6b5214;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.who b,
.who i {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who b {
  font-size: 13px;
  line-height: 1.35;
}
.who i {
  font-style: normal;
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--muted);
}
</style>
