import { computed, shallowRef } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** The accounts people sign in with */
export type Provider = 'google' | 'github'
export const PROVIDERS: readonly Provider[] = ['google', 'github']

/** Why coming back from a provider didn't sign in or link, read off the address it returned to */
export type AuthFailure = {
  reason: 'linkedElsewhere' | 'linkingOff' | 'sameEmail' | 'failed'
  /** The provider it came back from, when this tab remembers going to it */
  provider: Provider | null
}

const URL_ERRORS = ['error', 'error_code', 'error_description']
/** The provider last gone to from this tab, to say which one came back with an error */
const GONE_TO = 'v-conf-venue:auth-provider'

function rememberGoneTo(provider: Provider) {
  try {
    sessionStorage.setItem(GONE_TO, provider)
  } catch {
    // without storage the error just doesn't name the provider
  }
}
function takeGoneTo(): Provider | null {
  try {
    const p = sessionStorage.getItem(GONE_TO)
    sessionStorage.removeItem(GONE_TO)
    return PROVIDERS.includes(p as Provider) ? (p as Provider) : null
  } catch {
    return null
  }
}

/**
 * Take a provider's error off the address bar, saying which: the client doesn't (and only
 * throws it into the console), so it would otherwise sit there unexplained
 */
function takeUrlFailure(): AuthFailure | null {
  const provider = takeGoneTo()
  const url = new URL(location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const from = URL_ERRORS.some((k) => url.searchParams.has(k)) ? url.searchParams : hash
  if (!URL_ERRORS.some((k) => from.has(k))) return null
  const code = from.get('error_code') ?? ''
  const description = from.get('error_description') ?? ''
  for (const k of URL_ERRORS) {
    url.searchParams.delete(k)
    hash.delete(k)
  }
  hash.delete('sb')
  url.hash = hash.size ? hash.toString() : ''
  history.replaceState(history.state, '', url)

  let reason: AuthFailure['reason'] = 'failed'
  if (code === 'identity_already_exists') reason = 'linkedElsewhere'
  else if (code === 'manual_linking_disabled') reason = 'linkingOff'
  // the provider's emails belong to more than one account here, so it can't tell which
  else if (description.includes('Multiple accounts with the same email')) reason = 'sameEmail'
  return { reason, provider }
}

// Taken as this module loads, which is before the router is made: the router keeps the address
// it was made with and writes it back on its first navigation, error and all
const urlFailure = supabase ? takeUrlFailure() : null

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
  /** Coming back from a provider didn't work: for the window saying so, cleared once closed */
  const failure = shallowRef<AuthFailure | null>(urlFailure)

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
  /** The providers this account can sign in with */
  const linked = computed(
    () => new Set((user.value?.identities ?? []).map((i) => i.provider as Provider)),
  )

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
    rememberGoneTo(provider)
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
   * Add another provider to the signed-in account, to sign in to it with that one too. Off to
   * the provider; it comes back to this page, signed in to the same account.
   */
  async function link(provider: Provider) {
    if (!supabase) return
    busy.value = true
    going.value = provider
    rememberGoneTo(provider)
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: location.origin + location.pathname },
    })
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
    failure,
    email,
    name,
    avatar,
    linked,
    signIn,
    link,
    chooseSignIn,
    cancelSignIn,
    signOut,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
