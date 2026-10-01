import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { clearDraft, loadDraft, saveDraft, type Draft } from '@/cloud/drafts'
import {
  CloudError,
  isTransient,
  loadProject,
  renameProject,
  rowKey,
  saveChanges,
  type CloudErrorCode,
  type ProjectMeta,
  type ProjectSettings,
} from '@/cloud/projects'
import { useAuthStore } from '@/stores/auth'
import { usePalettesStore } from '@/stores/palettes'
import { usePlannerStore } from '@/stores/planner'
import type { LayoutItem } from '@/venue/layout'

/** Saved: nothing waiting. Pending: a change waits for the next save. */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/** How long after the last change it saves, so a burst of changes goes in one save */
const SAVE_DELAY = 800
/** After a failed save, tries again this much later; once these fail too, it says so plainly */
const RETRY_DELAYS = [2000, 5000]
/** …and then keeps trying this often, for as long as the page is open */
const RETRY_EVERY = 60_000

const logError = (what: string, e: unknown) =>
  console.error(`[cloud] ${what}`, e instanceof CloudError ? (e.detail ?? e) : e)

/**
 * The cloud project open in the planner, saving itself: a moment after the layout, its pricing
 * or its colour rows change, it writes just what changed since the last save (the items added
 * or changed, the ids removed, the settings).
 *
 * When a save fails for a passing reason (offline, the server's trouble) it tries again: after 2
 * and 5 seconds, then every minute, and at once when the connection or the tab comes back. Past
 * the 5-second try, or at once for a failure retrying can't fix, `alert` asks for attention. The
 * unsaved layout is meanwhile kept in this browser as a draft (cloud/drafts.ts), offered back
 * the next time the project opens.
 */
export const useProjectStore = defineStore('project', () => {
  const planner = usePlannerStore()
  const palettes = usePalettesStore()
  const auth = useAuthStore()

  const meta = shallowRef<ProjectMeta | null>(null)
  const loading = shallowRef(false)
  /** Why the project couldn't be opened */
  const loadError = shallowRef<CloudErrorCode | null>(null)
  const status = shallowRef<SaveStatus>('saved')
  /** Why the last save failed, until one succeeds */
  const failure = shallowRef<CloudErrorCode | null>(null)
  /** Saving has failed long enough (or for good) to ask for attention */
  const alert = shallowRef(false)
  /** Whether the unsaved layout is kept in this browser (null: nothing to keep) */
  const kept = shallowRef<boolean | null>(null)
  /** Changes left unsaved last time, found on opening */
  const draft = shallowRef<Draft | null>(null)
  /** The cloud version changed after the draft's changes began: restoring would overwrite it */
  const draftConflict = computed(() => !!draft.value && draft.value.base !== meta.value?.updated_at)
  /** Only its owner edits it for now; sharing (editors) comes later */
  const canEdit = computed(() => !!meta.value && meta.value.owner_id === auth.user?.id)

  /** Each item as last saved (rowKey), by id; null until the editor reports the opened layout */
  let saved: Map<string, string> | null = null
  /** The layout as loaded, before the editor has reported it back */
  let opened: LayoutItem[] | null = null
  let savedSettings = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | null = null
  /** A change came in while saving: save again after */
  let again = false
  /** Failed saves in a row */
  let failures = 0
  /** The notice was closed: it stays closed until saving works again */
  let alertDismissed = false

  const settings = (): ProjectSettings => ({
    pricing: { priceMode: planner.priceMode, slots: planner.slots },
    palettes: palettes.palettes,
  })

  function resetFailure() {
    failures = 0
    failure.value = null
    alert.value = false
    alertDismissed = false
    kept.value = null
  }

  function raiseAlert() {
    if (!alertDismissed) alert.value = true
  }
  function dismissAlert() {
    alert.value = false
    alertDismissed = true
  }

  async function open(id: string) {
    if (meta.value?.id === id) return
    await close()
    loading.value = true
    loadError.value = null
    try {
      const p = await loadProject(id)
      meta.value = p.meta
      // its colour rows join the palettes like an imported file's do
      palettes.importPalettes(p.settings)
      opened = p.items
      saved = null
      planner.openProject(id, p.items, p.settings.pricing)
      savedSettings = JSON.stringify(settings())
      status.value = 'saved'
      resetFailure()
      draft.value = canEdit.value ? loadDraft(id) : null
    } catch (e) {
      logError('opening failed', e)
      loadError.value = e instanceof CloudError ? e.code : 'failed'
    } finally {
      loading.value = false
    }
  }

  /** Leave the project, saving what's still waiting first (kept as a draft if that fails) */
  async function close() {
    if (!meta.value) return
    if (status.value === 'pending' || status.value === 'error') await flush()
    else await saving
    if (status.value === 'error') keepDraft()
    clearTimeout(timer)
    meta.value = null
    saved = null
    opened = null
    draft.value = null
    resetFailure()
  }

  function schedule() {
    if (!meta.value || !canEdit.value) return
    status.value = 'pending'
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY)
  }

  /** Save now; resolves once everything up to now is saved (or the save failed) */
  async function flush() {
    clearTimeout(timer)
    if (saving) {
      again = true
      return saving
    }
    saving = (async () => {
      status.value = 'saving'
      try {
        do {
          again = false
          await saveOnce()
        } while (again)
        status.value = 'saved'
        if (meta.value) clearDraft(meta.value.id)
        resetFailure()
      } catch (e) {
        logError('saving failed', e)
        status.value = 'error'
        onFailure(e instanceof CloudError ? e.code : 'failed')
      } finally {
        saving = null
      }
    })()
    return saving
  }

  function onFailure(code: CloudErrorCode) {
    failure.value = code
    keepDraft()
    if (!isTransient(code)) {
      raiseAlert()
      return
    }
    const delay = RETRY_DELAYS[failures]
    failures++
    if (delay === undefined) raiseAlert()
    // offline, it waits for the connection to come back (see below) rather than count tries
    if (globalThis.navigator?.onLine === false) return
    clearTimeout(timer)
    timer = setTimeout(flush, delay ?? RETRY_EVERY)
  }

  async function saveOnce() {
    const id = meta.value?.id
    // the planner's layout must be this project's, never the browser's own or another's
    if (!id || !saved || !canEdit.value || planner.projectId !== id) return
    const now = new Map(planner.items.map((i) => [i.id!, rowKey(i)]))
    const upserts = planner.items.filter((i) => saved!.get(i.id!) !== now.get(i.id!))
    const deletes = [...saved.keys()].filter((k) => !now.has(k))
    const s = settings()
    const sJson = JSON.stringify(s)
    const settingsChanged = sJson !== savedSettings
    if (!upserts.length && !deletes.length && !settingsChanged) return
    const updatedAt = await saveChanges(id, {
      upserts,
      deletes,
      settings: settingsChanged ? s : undefined,
    })
    // only once all of it went through: a failed save is worked out again from the same start
    saved = now
    savedSettings = sJson
    if (meta.value?.id === id) meta.value = { ...meta.value, updated_at: updatedAt }
  }

  /** Keep the unsaved layout in this browser, made on the cloud version last saved or opened */
  function keepDraft() {
    const m = meta.value
    if (!m || !canEdit.value || planner.projectId !== m.id) return
    kept.value = saveDraft(m.id, {
      base: m.updated_at,
      at: new Date().toISOString(),
      items: planner.items,
      settings: settings(),
    })
  }

  /** Done with last time's draft: it's been restored into the layout (and saves from now on) or thrown away */
  function dropDraft() {
    if (meta.value) clearDraft(meta.value.id)
    draft.value = null
  }

  async function rename(name: string) {
    if (!meta.value) return
    await renameProject(meta.value.id, name)
    meta.value = { ...meta.value, name: name.trim() }
  }

  watch(
    () => planner.items,
    (list) => {
      if (!meta.value || planner.projectId !== meta.value.id) return
      // the editor's first report is the layout as opened (as the editor writes it): what the
      // project holds already
      if (list === opened) return
      if (!saved) {
        saved = new Map(list.map((i) => [i.id!, rowKey(i)]))
        return
      }
      schedule()
    },
  )
  watch([() => planner.priceMode, () => planner.slots, () => palettes.palettes], () => {
    if (meta.value && saved && JSON.stringify(settings()) !== savedSettings) schedule()
  })

  if (typeof window !== 'undefined') {
    // Connection or tab back after a failed save: try again at once
    const retryNow = () => {
      if (status.value === 'error' && failure.value && isTransient(failure.value)) void flush()
    }
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') retryNow()
    })
    // Leaving the page with changes not yet saved: kept as a draft, and the browser asks first
    window.addEventListener('beforeunload', (e) => {
      if (status.value === 'saved') return
      keepDraft()
      void flush()
      e.preventDefault()
    })
  }

  return {
    meta,
    loading,
    loadError,
    status,
    failure,
    alert,
    kept,
    draft,
    draftConflict,
    canEdit,
    open,
    close,
    flush,
    rename,
    dismissAlert,
    dropDraft,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProjectStore, import.meta.hot))
