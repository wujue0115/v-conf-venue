<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePlannerStore } from '@/stores/planner'

/**
 * Who is signed in, in ☰: 使用 Google 登入 while signed out; once signed in, the person's
 * picture, name and email (☰ lists 登出 with its other items).
 */

const auth = useAuthStore()
const planner = usePlannerStore()
/** Google's picture didn't load: show the initial instead */
const avatarFailed = shallowRef(false)
watch(
  () => auth.avatar,
  () => (avatarFailed.value = false),
)

async function signIn() {
  try {
    await auth.signInWithGoogle()
  } catch {
    planner.notify(t().auth.signInFailed)
  }
}
</script>

<template>
  <!-- Takes its height before the session is known, so the menu doesn't jump -->
  <div class="account">
    <template v-if="auth.ready">
      <button v-if="!auth.user" class="sign-in" type="button" :disabled="auth.busy" @click="signIn">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
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
        {{ auth.busy ? t().auth.signingIn : t().auth.signIn }}
      </button>

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
    </template>
  </div>
</template>

<style scoped>
.account {
  /* the taller of the two layouts, so it doesn't grow once the session is known */
  min-height: 44px;
}
.sign-in {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  margin: 4px 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
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
