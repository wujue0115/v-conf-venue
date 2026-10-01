import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { t } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

/** app_settings 'cloud': switches for the cloud as a whole, changed in the Supabase Dashboard */
export interface CloudSettings {
  enabled: boolean
  allowCreate: boolean
  allowUpdate: boolean
  allowRealtime: boolean
}

/** Read again at most this often, when the tab comes back into view */
const RECHECK_EVERY = 60_000

/**
 * The cloud's switches (app_settings), read once on start and again whenever the tab comes back
 * into view (at most once a minute), or a save comes back paused. The planner shows what they
 * allow up front: off, the browser's own layout still works, and nothing waits on the cloud.
 * The database enforces them whatever this says. Also whether the person signed in may create
 * projects at all (public.allowed_creators, which only the database can read).
 */
export const useCloudStore = defineStore('cloud', () => {
  const auth = useAuthStore()
  /** null until read (or with no cloud in this build) */
  const settings = shallowRef<CloudSettings | null>(null)
  /** No connection, as far as the browser knows */
  const offline = shallowRef(globalThis.navigator?.onLine === false)
  let readAt = 0
  let reading: Promise<void> | null = null

  /** The cloud is on (true until read, so nothing flashes "paused" while it's being read) */
  const enabled = computed(() => settings.value?.enabled ?? true)
  /** The person signed in is on allowed_creators (or it's empty); true until asked */
  const mayCreate = shallowRef(true)
  /** Why new projects can't be made now: the cloud's switch, or this person isn't on the list */
  const createBlocked = computed<'paused' | 'not_allowed' | null>(() => {
    if (!enabled.value || settings.value?.allowCreate === false) return 'paused'
    return mayCreate.value ? null : 'not_allowed'
  })
  const canCreate = computed(() => !createBlocked.value)
  /** Why creating is off, to show where it is (undefined while it's on) */
  const createHint = computed(() => {
    if (createBlocked.value === 'not_allowed') return t().cloud.createNotAllowed
    if (createBlocked.value === 'paused') return t().cloud.createPaused
    return undefined
  })
  const canUpdate = computed(() => enabled.value && (settings.value?.allowUpdate ?? true))
  const realtime = computed(() => !!settings.value && enabled.value && settings.value.allowRealtime)

  function read() {
    if (!supabase) return Promise.resolve()
    reading ??= (async () => {
      try {
        const { data, error } = await supabase!
          .from('app_settings')
          .select('value')
          .eq('key', 'cloud')
          .maybeSingle()
        if (error) throw error
        const v = (data as { value?: Partial<CloudSettings> } | null)?.value ?? {}
        settings.value = {
          enabled: v.enabled === true,
          allowCreate: v.allowCreate === true,
          allowUpdate: v.allowUpdate === true,
          allowRealtime: v.allowRealtime === true,
        }
        readAt = Date.now()
      } catch (e) {
        // what was read last stands (or nothing is held back, before the first read)
        console.error('[cloud] reading app_settings failed', e)
      } finally {
        reading = null
      }
    })()
    return reading
  }

  /** Ask whether the person signed in may create projects */
  async function askMayCreate() {
    const user = auth.user?.id
    if (!supabase || !user) {
      mayCreate.value = true
      return
    }
    const { data, error } = await supabase.rpc('may_create_projects')
    // signed out or in as someone else meanwhile
    if (auth.user?.id !== user) return
    if (error) {
      // can't tell (or the database predates the list): leave it to the database to say
      console.error('[cloud] asking whether projects may be created failed', error)
      mayCreate.value = true
      return
    }
    mayCreate.value = data !== false
  }
  watch(
    () => auth.user?.id,
    () => void askMayCreate(),
    { immediate: true },
  )

  /** Read again unless it was just read */
  function recheck() {
    if (Date.now() - readAt >= RECHECK_EVERY) void read()
  }

  if (typeof window !== 'undefined' && supabase) {
    void read()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        recheck()
        // added to the list while away, say
        void askMayCreate()
      }
    })
    window.addEventListener('online', () => {
      offline.value = false
      recheck()
    })
    window.addEventListener('offline', () => (offline.value = true))
  }

  return {
    settings,
    offline,
    enabled,
    canCreate,
    createBlocked,
    createHint,
    canUpdate,
    realtime,
    read,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useCloudStore, import.meta.hot))
