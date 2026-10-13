import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { SelectionInfo, WalkState } from '@/venue/VenueEditor'
import type { FurnitureType } from '@/venue/furniture'
import {
  SCENE_MAX,
  clampSlots,
  cleanSceneName,
  demoLayout,
  loadPricing,
  loadSavedScenes,
  rentAcrossScenes,
  saveScenes,
  savePricing,
  sceneId as newSceneId,
  summarizeCost,
  type LayoutItem,
  type PriceMode,
  type Pricing,
  type Scene,
} from '@/venue/layout'
import { readJSON, writeJSON } from '@/venue/storage'
import { t } from '@/i18n'

const SIDEBAR_KEY = 'vueconf26-sidebar-collapsed'
const MODE_KEY = 'vueconf26-mode'
const LOOK_KEY = 'vueconf26-look-sensitivity'
const WALK_KEY = 'vueconf26-walk'
/** How fast the view turns while walking: 1 to 10, 5 as it comes */
export const LOOK_MIN = 1
export const LOOK_MAX = 10
export const LOOK_DEFAULT = 5

/** 'view' only looks around; 'edit' can place and change objects */
export type PlannerMode = 'view' | 'edit'

/**
 * UI-facing planner state. The three.js scene (VenueEditor) is the source of
 * truth for object transforms and reports snapshots here via `items`.
 */
/** How long a toast shows: 2.2s, more for a long one, up to 6s */
export const toastDuration = (message: string) =>
  Math.min(6000, Math.max(2200, message.length * 70))

export const usePlannerStore = defineStore('planner', () => {
  /**
   * The cloud project being edited, or null for the layout kept in this browser. Only the
   * browser's own layout is written to its storage; a project saves itself (stores/project.ts).
   */
  const projectId = shallowRef<string | null>(null)
  /** A shared project this person may only look at: Edit mode is off and can't be chosen */
  const readOnly = shallowRef(false)
  /** The layout's scenes, each a layout of its own, in the order they're shown */
  const scenes = shallowRef<Scene[]>([])
  /** The scene being shown and edited */
  const sceneId = shallowRef('')
  const scene = computed(() => scenes.value.find((s) => s.id === sceneId.value) ?? null)
  /**
   * The scene's layout: what the editor starts from when it mounts or the scene changes, then
   * its latest snapshot
   */
  const items = shallowRef<LayoutItem[]>([])
  const selection = shallowRef<SelectionInfo | null>(null)
  /** The kind the next tap on the stage places (phones pick it in the palette), if any */
  const armed = shallowRef<FurnitureType | null>(null)
  /** Drawing a 動線, one 動線點 after another (reported by the editor) */
  const pathDrawing = shallowRef(false)
  const fixedSeats = shallowRef(0)
  /** Walking through the venue (reported by the editor), or null */
  const walk = shallowRef<WalkState | null>(null)
  /** Whether the editor has a step to undo / redo (reported by it) */
  const canUndo = shallowRef(false)
  const canRedo = shallowRef(false)

  const priceMode = shallowRef<PriceMode>(0)
  const slots = shallowRef(1)

  /** Show these scenes, from the one with id `pick` (else the first) */
  function showScenes(list: Scene[], pick?: string | null) {
    const s = list.find((x) => x.id === pick) ?? list[0]!
    scenes.value = list
    sceneId.value = s.id
    items.value = s.items
  }

  /** Work on the layout kept in this browser (as saved, or the demo the first time) */
  function openLocal() {
    projectId.value = null
    readOnly.value = false
    const first = t().scenes.defaultName(1)
    showScenes(loadSavedScenes(first) ?? [{ id: newSceneId(), name: first, items: demoLayout() }])
    const pricing = loadPricing()
    priceMode.value = pricing.priceMode
    slots.value = pricing.slots
  }
  /** Scenes as kept elsewhere: a scene without a name is called by its place (`Scene n`) */
  const named = (list: readonly Scene[]) =>
    list.map((s, k) => (s.name ? s : { ...s, name: t().scenes.defaultName(k + 1) }))

  /**
   * Work on a cloud project's scenes (only looking, `readOnly`); the browser's own stay as they
   * are. None (a project from before scenes, not yet moved on) is one empty scene.
   */
  function openProject(
    id: string,
    list: readonly Scene[],
    pricing: Partial<Pricing> = {},
    { readOnly: ro = false } = {},
  ) {
    projectId.value = id
    readOnly.value = ro
    showScenes(
      list.length
        ? named(list)
        : [{ id: newSceneId(), name: t().scenes.defaultName(1), items: [] }],
    )
    priceMode.value = pricing.priceMode ?? 0
    slots.value = clampSlots(pricing.slots ?? 1)
  }
  openLocal()

  /** Show and edit another scene */
  function setScene(id: string) {
    const s = scenes.value.find((x) => x.id === id)
    if (!s || id === sceneId.value) return
    sceneId.value = id
    items.value = s.items
  }

  /** `Scene n`, the first n no scene is called yet */
  function freshName() {
    const taken = new Set(scenes.value.map((s) => s.name))
    let n = scenes.value.length + 1
    while (taken.has(t().scenes.defaultName(n))) n++
    return t().scenes.defaultName(n)
  }

  /**
   * Add a scene after the one shown, a copy of it or empty, and show it; null at SCENE_MAX.
   * A copy's items keep their ids, so the same item can be put alike in every scene.
   */
  function addScene({ copy }: { copy: boolean }) {
    if (scenes.value.length >= SCENE_MAX) return null
    const s: Scene = { id: newSceneId(), name: freshName(), items: copy ? items.value : [] }
    const at = scenes.value.findIndex((x) => x.id === sceneId.value) + 1
    scenes.value = [...scenes.value.slice(0, at), s, ...scenes.value.slice(at)]
    setScene(s.id)
    return s
  }

  function renameScene(id: string, name: string) {
    const n = cleanSceneName(name)
    if (!n) return
    scenes.value = scenes.value.map((s) => (s.id === id ? { ...s, name: n } : s))
  }

  /** Remove a scene (never the last one); the one shown goes over to its neighbour */
  function deleteScene(id: string) {
    const at = scenes.value.findIndex((s) => s.id === id)
    if (at < 0 || scenes.value.length <= 1) return
    const rest = scenes.value.filter((s) => s.id !== id)
    if (id === sceneId.value) {
      scenes.value = rest
      setScene(rest[Math.min(at, rest.length - 1)]!.id)
    } else scenes.value = rest
  }

  /** Move the scene at `from` to `to`, in the order they're shown */
  function moveScene(from: number, to: number) {
    const list = [...scenes.value]
    const [s] = list.splice(from, 1)
    if (!s || from === to) return
    list.splice(Math.max(0, Math.min(to, list.length)), 0, s)
    scenes.value = list
  }

  /**
   * Put these items (from the scene shown) alike in every other scene: each takes the place of
   * the item with its id there, or is added where it has none. The scenes changed, by id.
   */
  function applyToScenes(list: readonly LayoutItem[]) {
    const byId = new Map(list.map((i) => [i.id!, i]))
    const changed: string[] = []
    scenes.value = scenes.value.map((s) => {
      if (s.id === sceneId.value) return s
      const seen = new Set<string>()
      const next = s.items.map((i) => {
        const now = byId.get(i.id!)
        if (now) seen.add(i.id!)
        return now ?? i
      })
      for (const [id, i] of byId) if (!seen.has(id)) next.push(i)
      changed.push(s.id)
      return { ...s, items: next }
    })
    return changed
  }

  /**
   * Other people's saved changes to a scene not shown: these items in place of those with their
   * ids there (or added), and these ids gone
   */
  function patchScene(id: string, upserts: readonly LayoutItem[], deletes: readonly string[]) {
    if (id === sceneId.value) return
    const byId = new Map(upserts.map((i) => [i.id!, i]))
    const gone = new Set(deletes)
    scenes.value = scenes.value.map((s) => {
      if (s.id !== id) return s
      const seen = new Set<string>()
      const next = s.items.flatMap((i) => {
        if (gone.has(i.id!)) return []
        const now = byId.get(i.id!)
        if (now) seen.add(i.id!)
        return [now ?? i]
      })
      for (const [k, i] of byId) if (!seen.has(k)) next.push(i)
      return { ...s, items: next }
    })
  }

  /**
   * The scenes as other people saved them: in `list`'s order with its names, those new here
   * taken from `added`, those not in it gone. The scene shown, gone, gives way to its neighbour.
   * Its name, or null when it's still there.
   */
  function takeScenes(list: readonly { id: string; name: string }[], added: readonly Scene[]) {
    const have = new Map(scenes.value.map((s) => [s.id, s]))
    const fresh = new Map(named(added).map((s) => [s.id, s]))
    const next = named(
      list.flatMap((r) => {
        const s = have.get(r.id) ?? fresh.get(r.id)
        return s ? [{ ...s, name: r.name }] : []
      }),
    )
    if (!next.length) return null
    const shown = scene.value
    const at = scenes.value.findIndex((s) => s.id === sceneId.value)
    scenes.value = next
    if (shown && next.some((s) => s.id === shown.id)) return null
    setScene(next[Math.min(Math.max(at, 0), next.length - 1)]!.id)
    return shown?.name ?? null
  }

  /**
   * Take in a file's scenes, each with an id of its own: in place of all of them (`replace`),
   * else added after the rest, as far as SCENE_MAX allows. How many it took.
   */
  function importScenes(list: readonly Scene[], { replace }: { replace: boolean }) {
    // its items need ids to be told apart, in a cloud project
    const fresh = list.map((s) => ({
      ...s,
      id: newSceneId(),
      items: s.items.map((i) => (i.id ? i : { ...i, id: crypto.randomUUID() })),
    }))
    if (replace) {
      showScenes(fresh)
      return fresh.length
    }
    const room = Math.max(0, SCENE_MAX - scenes.value.length)
    const added = fresh.slice(0, room)
    scenes.value = [...scenes.value, ...added]
    if (added[0]) setScene(added[0].id)
    return added.length
  }

  // First visit opens in view mode so nothing gets moved by accident
  const mode = shallowRef<PlannerMode>(readJSON(MODE_KEY) === 'edit' ? 'edit' : 'view')
  const editing = computed(() => mode.value === 'edit' && !readOnly.value)
  const snap = shallowRef(true)
  /** 多選: taps add to the selection and drags on empty space box-select (for touch screens) */
  const multiSelect = shallowRef(false)
  const wallsCut = shallowRef(false)
  const showLabels = shallowRef(true)
  const shadows = shallowRef(true)
  /** The walls' every edge outlined, where they meet and overlap too (off: only their outline) */
  const wallEdges = shallowRef(false)
  /** Kinds of item hidden from the scene (設定 → 物件顯示); they stay in the layout */
  const hiddenTypes = shallowRef<readonly FurnitureType[]>([])
  /** Kinds of item whose tags are hidden (設定 → 標籤顯示); the tags are kept */
  const hiddenTagTypes = shallowRef<readonly FurnitureType[]>([])
  /** Whether groups' tags and groups' ⓘ notes show (設定 → 標籤顯示 / 資訊顯示) */
  const showGroupTags = shallowRef(true)
  const showGroupInfo = shallowRef(true)
  /** Kinds of item whose ⓘ note buttons are hidden (設定 → 資訊顯示); the notes are kept */
  const hiddenInfoTypes = shallowRef<readonly FurnitureType[]>([])
  const toggled = (
    list: readonly FurnitureType[],
    types: readonly FurnitureType[],
    on: boolean,
  ) => {
    const rest = list.filter((t) => !types.includes(t))
    return on ? rest : [...rest, ...types]
  }
  function setTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenTypes.value = toggled(hiddenTypes.value, types, on)
  }
  function setTagTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenTagTypes.value = toggled(hiddenTagTypes.value, types, on)
  }
  function setInfoTypesVisible(types: readonly FurnitureType[], on: boolean) {
    hiddenInfoTypes.value = toggled(hiddenInfoTypes.value, types, on)
  }
  const savedLook = readJSON(LOOK_KEY)
  /** 設定's 視角靈敏度: how fast the mouse (or a drag) turns the view while walking */
  const lookSensitivity = shallowRef(
    typeof savedLook === 'number' && savedLook >= LOOK_MIN && savedLook <= LOOK_MAX
      ? savedLook
      : LOOK_DEFAULT,
  )
  const savedWalk = readJSON(WALK_KEY) as { walls?: unknown; items?: unknown; bob?: unknown } | null
  /** 設定: walking through the venue passes through walls / items rather than stopping */
  const walkThroughWalls = shallowRef(savedWalk?.walls === true)
  const walkThroughItems = shallowRef(savedWalk?.items === true)
  /** 設定: the view bobs with each step, in first person */
  const walkBob = shallowRef(savedWalk?.bob !== false)
  const savedSidebar = readJSON(SIDEBAR_KEY)
  // First visit on a phone: start collapsed so the venue is visible
  const sidebarCollapsed = shallowRef(
    typeof savedSidebar === 'boolean'
      ? savedSidebar
      : !!globalThis.matchMedia?.('(max-width: 720px)').matches,
  )

  /** The last toast, and when it was given (a toast shown again after the page changes under it) */
  const toast = shallowRef<{ id: number; message: string; at: number } | null>(null)
  /** ⚙ 設定 or ? 操作說明 showing (on phones they open from ☰) */
  const panel = shallowRef<'settings' | 'help' | null>(null)
  let toastId = 0

  /** The scene shown: its rent, by group and by kind */
  const cost = computed(() => summarizeCost(items.value, priceMode.value, slots.value))
  /** All the scenes together: each kind rented as many as the scene using most of it needs */
  const rentTotal = computed(() =>
    scenes.value.length > 1
      ? rentAcrossScenes(scenes.value, priceMode.value, slots.value)
      : cost.value.total,
  )

  function setSlots(n: number) {
    slots.value = clampSlots(n)
  }
  function notify(message: string) {
    toast.value = { id: ++toastId, message, at: Date.now() }
  }

  // The scene shown keeps its latest layout, at once: a scene picked straight after a change
  // leaves it kept
  watch(
    items,
    (list) => {
      const id = sceneId.value
      if (scene.value && scene.value.items !== list)
        scenes.value = scenes.value.map((s) => (s.id === id ? { ...s, items: list } : s))
    },
    { flush: 'sync' },
  )
  // Poster images can push the layout past the browser's storage quota: say so once
  let saveFailed = false
  watch(scenes, (list) => {
    if (projectId.value) return
    const ok = saveScenes(list)
    if (!ok && !saveFailed) notify(t().toast.saveFailed)
    saveFailed = !ok
  })
  watch([priceMode, slots], ([m, s]) => {
    if (!projectId.value) savePricing(m, s)
  })
  watch(sidebarCollapsed, (v) => writeJSON(SIDEBAR_KEY, v))
  watch(lookSensitivity, (v) => writeJSON(LOOK_KEY, v))
  watch([walkThroughWalls, walkThroughItems, walkBob], ([walls, items, bob]) =>
    writeJSON(WALK_KEY, { walls, items, bob }),
  )
  watch(mode, (v) => {
    writeJSON(MODE_KEY, v)
    // every switch of mode starts with 多選 off, so a tap selects just one item again
    multiSelect.value = false
  })

  return {
    projectId,
    readOnly,
    openLocal,
    openProject,
    scenes,
    sceneId,
    scene,
    showScenes,
    setScene,
    addScene,
    renameScene,
    deleteScene,
    moveScene,
    applyToScenes,
    importScenes,
    patchScene,
    takeScenes,
    items,
    selection,
    armed,
    pathDrawing,
    fixedSeats,
    walk,
    lookSensitivity,
    walkThroughWalls,
    walkThroughItems,
    walkBob,
    canUndo,
    canRedo,
    priceMode,
    slots,
    mode,
    editing,
    snap,
    multiSelect,
    wallsCut,
    showLabels,
    shadows,
    wallEdges,
    hiddenTypes,
    setTypesVisible,
    hiddenTagTypes,
    setTagTypesVisible,
    hiddenInfoTypes,
    setInfoTypesVisible,
    showGroupTags,
    showGroupInfo,
    sidebarCollapsed,
    panel,
    toast,
    cost,
    rentTotal,
    setSlots,
    notify,
  }
})

// In dev, swap in the store's new setup when it (or a module it uses, like layout.ts) changes;
// otherwise the running store keeps the old code, e.g. a stale cost summary
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePlannerStore, import.meta.hot))
