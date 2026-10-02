import { computed, shallowRef } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** The accounts people sign in with */
export type Provider = 'google' | 'github'
export const PROVIDERS: readonly Provider[] = ['google', 'github']

/**
 * Who is signed in. `ready` turns true once the saved session (or one coming back from Google
 * or GitHub in the URL) has been checked, so the UI doesn't flash "Sign in" for someone already
 * signed in.
 */
export const useAuthStore = defineStore('auth', () => {
  /** Whether sign-in exists at all in this build */
  const available = !!supabase
  const user = shallowRef<User | null>(null)
  const ready = shallowRef(!supabase)
  /** Waiting on Google, GitHub or on signing out */
  const busy = shallowRef(false)
  /** The provider being gone to, for its button to say so */
  const going = shallowRef<Provider | null>(null)
  /** The window asking which account to sign in with is open */
  const choosing = shallowRef(false)
  /** Runs just before leaving for the provider chosen in that window */
  let beforeLeave: (() => void) | null = null

  const email = computed(() => user.value?.email ?? '')
  const name = computed(() => {
    const meta = user.value?.user_metadata
    return (
      (meta?.full_name as string | undefined) ||
      (meta?.name as string | undefined) ||
      (meta?.user_name as string | undefined) ||
      email.value
    )
  })
  const avatar = computed(() => (user.value?.user_metadata?.avatar_url as string | undefined) ?? '')

  // Fires INITIAL_SESSION once the client has read the saved session and any `?code=` in the
  // URL, then again on every sign-in, sign-out and token refresh, in this tab or another one
  supabase?.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
    ready.value = true
  })

  /** Off to Google or GitHub; it comes back to the page this started from */
  async function signIn(provider: Provider) {
    if (!supabase) return
    busy.value = true
    going.value = provider
    beforeLeave?.()
    beforeLeave = null
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin + location.pathname },
    })
    // on success the browser is already leaving the page
    if (error) {
      busy.value = false
      going.value = null
      throw error
    }
  }

  /**
   * Ask which account to sign in with, for a button with no room for one per provider.
   * `onLeave` runs only once one is picked, not if the window is closed.
   */
  function chooseSignIn(onLeave?: () => void) {
    if (!supabase) return
    beforeLeave = onLeave ?? null
    choosing.value = true
  }
  function cancelSignIn() {
    beforeLeave = null
    choosing.value = false
  }

  async function signOut() {
    if (!supabase) return
    busy.value = true
    try {
      // 'local': this browser only, leaving the person signed in on their other devices
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } finally {
      busy.value = false
    }
  }

  return {
    available,
    user,
    ready,
    busy,
    going,
    choosing,
    email,
    name,
    avatar,
    signIn,
    chooseSignIn,
    cancelSignIn,
    signOut,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
