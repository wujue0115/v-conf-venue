import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { hasAsked, requestAccess as askOwner } from '@/cloud/access'
import { clearDraft, loadDraft, saveDraft, type Draft } from '@/cloud/drafts'
import {
  checkAccess,
  CloudError,
  isTransient,
  loadMeta,
  loadProject,
  loadShared,
  renameProject,
  rowKey,
  saveChanges,
  updateSharing,
  type CloudErrorCode,
  type Grant,
  type LoadedProject,
  type ProjectMeta,
  type ProjectSettings,
  type SharedResult,
  type Sharing,
} from '@/cloud/projects'
import type { ObjectsChange } from '@/cloud/realtime'
import { useAuthStore } from '@/stores/auth'
import { useCloudStore } from '@/stores/cloud'
import { usePalettesStore } from '@/stores/palettes'
import { usePlannerStore } from '@/stores/planner'
import type { LayoutItem } from '@/venue/layout'
import { t } from '@/i18n'

type SavedHook = (projectId: string, change: ObjectsChange, updatedAt: string) => void

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
  const cloud = useCloudStore()

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
  /** Its owner, or an editor (by name, or through the share link) */
  const mayEdit = computed(() => meta.value?.role === 'owner' || meta.value?.role === 'editor')
  /** …and the cloud takes changes now (app_settings) */
  const canEdit = computed(() => mayEdit.value && cloud.canUpdate)
  /** This person may edit, but the cloud has changes paused: read-only until it's back */
  const paused = computed(() => mayEdit.value && !cloud.canUpdate)
  /**
   * Opened through a share link that didn't let them in: why (null when it did). `byId`: by its
   * link without the share token, which their own access doesn't open (or no such project).
   */
  const shareDenied = shallowRef<
    (Exclude<SharedResult, { status: 'ok' }> & { byId?: boolean }) | null
  >(null)
  /** The share link it was opened through, if any */
  let token: string | null = null
  /** The share link last tried, even one that didn't let them in (to ask for access through) */
  let openedToken: string | null = null
  /** The project last tried by id that didn't let them in (to ask for access to) */
  let deniedId: string | null = null

  /** Each item as last saved (rowKey), by id; null until the editor reports the opened layout */
  let saved: Map<string, string> | null = null
  /** The layout as loaded, before the editor has reported it back */
  let opened: LayoutItem[] | null = null
  /** The layout right after taking in other people's changes: nothing of this person's to save */
  let remote: LayoutItem[] | null = null
  let savedSettings = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | null = null
  /** A change came in while saving: save again after */
  let again = false
  /** Failed saves in a row */
  let failures = 0
  /** The notice was closed: it stays closed until saving works again */
  let alertDismissed = false
  /**
   * Told the items each save wrote, once it all went through, and the project's updated_at
   * after it (collab tells the others)
   */
  const savedHooks = new Set<SavedHook>()
  function onSaved(fn: SavedHook) {
    savedHooks.add(fn)
    return () => void savedHooks.delete(fn)
  }

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

  /** Take on a loaded project: into the planner, read-only unless this person may edit */
  function apply(p: LoadedProject) {
    meta.value = p.meta
    // its colour rows join the palettes like an imported file's do
    palettes.importPalettes(p.settings)
    opened = p.items
    saved = null
    planner.openProject(p.meta.id, p.items, p.settings.pricing, { readOnly: !canEdit.value })
    savedSettings = JSON.stringify(settings())
    status.value = 'saved'
    resetFailure()
    draft.value = mayEdit.value ? loadDraft(p.meta.id) : null
  }

  /** Open a project by its id (My projects) */
  async function open(id: string, { again = false } = {}) {
    if (meta.value?.id === id && !token && !again) return
    await close()
    openedToken = null
    deniedId = null
    shareDenied.value = null
    loading.value = true
    loadError.value = null
    try {
      apply(await loadProject(id, auth.user?.id))
    } catch (e) {
      logError('opening failed', e)
      loadError.value = e instanceof CloudError ? e.code : 'failed'
    } finally {
      loading.value = false
    }
  }

  /**
   * Open a project through its share link, signed in or not. Opened again after signing in
   * or out, since that can change what the link allows.
   */
  async function openShared(shareToken: string) {
    await close()
    loading.value = true
    loadError.value = null
    shareDenied.value = null
    deniedId = null
    openedToken = shareToken
    try {
      const r = await loadShared(shareToken)
      if (r.status === 'ok') {
        token = shareToken
        apply(r.project)
      } else shareDenied.value = r
    } catch (e) {
      logError('opening the share link failed', e)
      loadError.value = e instanceof CloudError ? e.code : 'failed'
    } finally {
      loading.value = false
    }
  }

  /**
   * Open a project by its link (/project/:id, with ?share=<token> while sharing is on): by id
   * for someone signed in who may open it so, else through the share token (a guest always). By
   * id alone and not let in, they may ask the owner for access.
   */
  async function openLink(id: string, shareToken: string | null) {
    if (auth.user) {
      await open(id)
      if (loadError.value !== 'not_found') return
      if (!shareToken) return denyById(id)
    }
    if (shareToken) await openShared(shareToken)
  }

  /** Not let in by id: no access (or no such project, which looks the same from here) */
  async function denyById(id: string) {
    let requested = false
    try {
      requested = await hasAsked(id)
    } catch {
      // not known: they may ask (again)
    }
    loadError.value = null
    deniedId = id
    shareDenied.value = { status: 'no_access', requested, byId: true }
  }

  /** Leave the project, saving what's still waiting first (kept as a draft if that fails) */
  async function close() {
    if (!meta.value) return
    if (status.value === 'pending' || status.value === 'error') await flush()
    else await saving
    // not saved (failed, or the cloud paused): kept in this browser for next time
    if (status.value !== 'saved') keepDraft()
    clearTimeout(timer)
    meta.value = null
    token = null
    saved = null
    opened = null
    remote = null
    draft.value = null
    shareDenied.value = null
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
    // the cloud paused changes: what's waiting stays waiting (and kept as a draft), not "saved"
    if (meta.value && paused.value) return
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
    // anything but a lost connection: look again at what this person may do now, to say why
    if (code !== 'network' && code !== 'server') void diagnose()
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

  /**
   * After a failed save, check afresh whether this person may still save to the project, and
   * when not, say why instead: signed out, the cloud paused, the project gone, the share link
   * off, or only viewing now (then the planner turns read-only so nothing more is lost).
   */
  async function diagnose() {
    const m = meta.value
    if (!m) return
    let found: Awaited<ReturnType<typeof checkAccess>>
    try {
      found = await checkAccess(m.id, { signedIn: !!auth.user, shareToken: token })
    } catch (e) {
      // checking failed too: the first reason stands
      logError('checking access failed', e)
      return
    }
    if (meta.value?.id !== m.id || found === 'ok' || status.value !== 'error') return
    // the switches changed: read them, so the planner shows it (and goes on once they're back)
    if (found === 'paused') void cloud.read()
    failure.value = found
    raiseAlert()
    // trying again on a timer won't help any of these (the notice offers what will)
    clearTimeout(timer)
    // these won't sort themselves out: stop editing, so nothing more goes unsaved
    if (found === 'viewer' || found === 'gone' || found === 'link_off') {
      if (found === 'viewer') meta.value = { ...m, role: 'viewer' }
      planner.readOnly = true
    }
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
    if (upserts.length || deletes.length) {
      const change: ObjectsChange = {}
      if (upserts.length) change.changed = upserts.map((i) => i.id!)
      if (deletes.length) change.deleted = deletes
      for (const fn of savedHooks) fn(id, change, updatedAt)
    }
  }

  /** Keep the unsaved layout in this browser, made on the cloud version last saved or opened */
  function keepDraft() {
    const m = meta.value
    if (!m || !mayEdit.value || planner.projectId !== m.id) return
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

  /**
   * Ask the owner for a role: from a share link that didn't let them in, or (viewing) to edit.
   * When it turns out they have it already, the project opens again to take it up.
   */
  /** Where an ask goes: through the share link it was opened by, else to the project by id */
  function askWhere(): { token: string } | { projectId: string } | null {
    if (openedToken) return { token: openedToken }
    if (meta.value) return { projectId: meta.value.id }
    if (deniedId) return { projectId: deniedId }
    return null
  }

  async function requestAccess(role: Grant) {
    const denied = shareDenied.value
    const where = askWhere()
    if (!where) return
    const r = await askOwner(role, where)
    if (r === 'already') {
      if ('token' in where) await openShared(where.token)
      else await open(where.projectId, { again: true })
      return
    }
    if (denied?.status === 'no_access') shareDenied.value = { ...denied, requested: true }
    else if (meta.value) meta.value = { ...meta.value, requested: role }
  }

  /** The share link it was opened through, if any (a guest reads changed items through it) */
  const via = () => openedToken

  /**
   * Take in other people's saved changes: `rows` as they're saved now, `deleted` ids gone (with
   * `full`, `rows` is every item, and any other saved item counts as gone). Items with changes
   * of this person's still to save are left as they are: theirs is saved over it. `apply` puts
   * the rest into the editor, which reports the layout back at once.
   */
  function takeRemote(
    rows: readonly LayoutItem[],
    deleted: readonly string[],
    apply: (upserts: LayoutItem[], deletes: string[]) => void,
    { full = false } = {},
  ) {
    const id = meta.value?.id
    if (!id || !saved || planner.projectId !== id) return
    const was = saved
    const now = new Map(planner.items.map((i) => [i.id!, rowKey(i)]))
    // changed here and not saved yet (added, changed or removed)
    const mine = (k: string) => now.get(k) !== was.get(k)
    const upserts = rows.filter((r) => !mine(r.id!) && now.get(r.id!) !== rowKey(r))
    const gone = new Set(deleted)
    if (full) {
      const there = new Set(rows.map((r) => r.id!))
      for (const k of was.keys()) if (!there.has(k)) gone.add(k)
    }
    // removed on both sides: nothing left to save
    for (const k of gone) if (!now.has(k)) was.delete(k)
    const deletes = [...gone].filter((k) => now.has(k) && !mine(k))
    if (!upserts.length && !deletes.length) return
    apply(upserts, deletes)
    remote = planner.items
    const after = new Map(planner.items.map((i) => [i.id!, rowKey(i)]))
    // what the editor took in is saved already (an item it was busy dragging, it kept)
    for (const r of upserts) {
      const k = after.get(r.id!)
      if (k !== undefined && k !== now.get(r.id!)) was.set(r.id!, k)
    }
    for (const k of deletes) if (!after.has(k)) was.delete(k)
  }

  /** Open it again from scratch (it was deleted, or this person's access to it ended) */
  async function reload() {
    const m = meta.value
    if (!m) return
    if (openedToken) await openShared(openedToken)
    else await open(m.id, { again: true })
  }

  /**
   * Read the project again after word that its name, settings, sharing or someone's access
   * changed: this person's role (Edit turns on or off to match), the name, and the settings
   * unless they have changes of their own to them still to save.
   */
  async function refreshMeta() {
    const m = meta.value
    if (!m) return
    let fresh: Omit<LoadedProject, 'items'>
    try {
      if (auth.user) fresh = await loadMeta(m.id, auth.user.id)
      else {
        // a guest can't read the project itself: the link says what it allows now
        const r = openedToken ? await loadShared(openedToken) : null
        if (r?.status !== 'ok') return reload()
        fresh = r.project
      }
    } catch (e) {
      // no longer theirs to open: the page says so (anything else, what's shown stands)
      if (e instanceof CloudError && e.code === 'not_found') return reload()
      logError('reading the project again failed', e)
      return
    }
    if (meta.value?.id !== m.id) return
    const couldEdit = mayEdit.value
    meta.value = { ...meta.value, ...fresh.meta, updated_at: meta.value.updated_at }
    planner.readOnly = !canEdit.value
    if (couldEdit !== mayEdit.value)
      planner.notify(mayEdit.value ? t().collab.nowEditor : t().collab.nowViewer)
    if (saved && JSON.stringify(settings()) === savedSettings) {
      palettes.importPalettes(fresh.settings)
      const pricing = fresh.settings.pricing
      if (pricing?.priceMode !== undefined) planner.priceMode = pricing.priceMode
      if (pricing?.slots !== undefined) planner.setSlots(pricing.slots)
      savedSettings = JSON.stringify(settings())
    }
  }

  /** Change the share link's settings (its owner only) */
  async function setSharing(patch: Partial<Sharing>) {
    if (!meta.value || meta.value.role !== 'owner') return
    const id = meta.value.id
    const sharing = await updateSharing(id, patch)
    if (meta.value?.id === id) meta.value = { ...meta.value, sharing }
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
      if (list === remote) return
      schedule()
    },
  )
  watch([() => planner.priceMode, () => planner.slots, () => palettes.palettes], () => {
    if (meta.value && saved && JSON.stringify(settings()) !== savedSettings) schedule()
  })

  // The cloud paused changes, or took them again (app_settings): read-only meanwhile, keeping
  // what wasn't saved yet in this browser, then saving it once changes are back
  watch(
    () => cloud.canUpdate,
    (on) => {
      if (!meta.value || !mayEdit.value || planner.projectId !== meta.value.id) return
      planner.readOnly = !canEdit.value
      if (!on) {
        clearTimeout(timer)
        if (status.value !== 'saved') keepDraft()
        planner.notify(t().cloud.pausedNow)
        return
      }
      planner.notify(t().cloud.resumed)
      if (status.value !== 'saved') void flush()
    },
  )

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
    shareDenied,
    status,
    failure,
    alert,
    kept,
    draft,
    draftConflict,
    canEdit,
    mayEdit,
    paused,
    open,
    openShared,
    openLink,
    close,
    flush,
    rename,
    setSharing,
    requestAccess,
    via,
    takeRemote,
    onSaved,
    reload,
    refreshMeta,
    dismissAlert,
    dropDraft,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProjectStore, import.meta.hot))
