import { computed, shallowRef } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'

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
 * The database enforces them whatever this says.
 */
export const useCloudStore = defineStore('cloud', () => {
  /** null until read (or with no cloud in this build) */
  const settings = shallowRef<CloudSettings | null>(null)
  /** No connection, as far as the browser knows */
  const offline = shallowRef(globalThis.navigator?.onLine === false)
  let readAt = 0
  let reading: Promise<void> | null = null

  /** The cloud is on (true until read, so nothing flashes "paused" while it's being read) */
  const enabled = computed(() => settings.value?.enabled ?? true)
  const canCreate = computed(() => enabled.value && (settings.value?.allowCreate ?? true))
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

  /** Read again unless it was just read */
  function recheck() {
    if (Date.now() - readAt >= RECHECK_EVERY) void read()
  }

  if (typeof window !== 'undefined' && supabase) {
    void read()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') recheck()
    })
    window.addEventListener('online', () => {
      offline.value = false
      recheck()
    })
    window.addEventListener('offline', () => (offline.value = true))
  }

  return { settings, offline, enabled, canCreate, canUpdate, realtime, read }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useCloudStore, import.meta.hot))
