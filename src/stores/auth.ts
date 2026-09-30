import { computed, shallowRef } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Who is signed in. `ready` turns true once the saved session (or one coming back from Google
 * in the URL) has been checked, so the UI doesn't flash "Sign in" for someone already signed in.
 */
export const useAuthStore = defineStore('auth', () => {
  /** Whether sign-in exists at all in this build */
  const available = !!supabase
  const user = shallowRef<User | null>(null)
  const ready = shallowRef(!supabase)
  /** Waiting on Google or on signing out */
  const busy = shallowRef(false)

  const email = computed(() => user.value?.email ?? '')
  const name = computed(() => {
    const meta = user.value?.user_metadata
    return (
      (meta?.full_name as string | undefined) || (meta?.name as string | undefined) || email.value
    )
  })
  const avatar = computed(() => (user.value?.user_metadata?.avatar_url as string | undefined) ?? '')

  // Fires INITIAL_SESSION once the client has read the saved session and any `?code=` in the
  // URL, then again on every sign-in, sign-out and token refresh, in this tab or another one
  supabase?.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
    ready.value = true
  })

  /** Off to Google; it comes back to the page this started from */
  async function signInWithGoogle() {
    if (!supabase) return
    busy.value = true
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    })
    // on success the browser is already leaving the page
    if (error) {
      busy.value = false
      throw error
    }
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

  return { available, user, ready, busy, email, name, avatar, signInWithGoogle, signOut }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
