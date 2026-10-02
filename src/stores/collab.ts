import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { CloudError, loadItems, loadUpdatedAt, loadVersions } from '@/cloud/projects'
import {
  joinProject,
  type ObjectsChange,
  type Peer,
  type ProjectChannel,
  type Selection,
} from '@/cloud/realtime'
import { t } from '@/i18n'
import { useAccessStore } from '@/stores/access'
import { useAuthStore } from '@/stores/auth'
import { useCloudStore } from '@/stores/cloud'
import { usePlannerStore } from '@/stores/planner'
import { useProjectStore } from '@/stores/project'
import type { LayoutItem } from '@/venue/layout'
import type { Vec3 } from '@/venue/places'
import type { CameraState, LiveMove, Lock, RemoteCursor } from '@/venue/VenueEditor'

/** What the editor on the stage does for the channel (VenueStage attaches it) */
export interface EditorLink {
  applyRemote(upserts: LayoutItem[], deletes: string[]): void
  applyLive(moves: readonly LiveMove[]): void
  setLocks(locks: ReadonlyMap<string, Lock>): void
  setCursors(cursors: readonly RemoteCursor[]): void
  /** Glide after someone's view (null: stop) */
  follow(cam: CameraState | null): void
  cameraState(): CameraState
}

/**
 * How often a drag is sent to the others: as often as the pointer (POINTER_EVERY in the editor),
 * so on their screens the items, gliding between sends as the pointer does, keep up with it
 */
const MOVE_EVERY = 200
/** A pointer that moved less than this in the venue (metres) isn't sent again */
const POINTER_STEP = 0.05
/** How often this tab's view goes out while someone follows it */
const CAMERA_EVERY = 250
/** A burst of selection changes (box-selecting, clicking along) goes out as one */
const SELECT_DELAY = 100
/** Changed ids are gathered this long before fetching them, so a burst is one fetch */
const FETCH_DELAY = 120
/** Fetching them failed: tried again this much later */
const FETCH_RETRY = 3000
/** Joined this long after the project opened (or after realtime was off): catch up on all of it */
const CATCH_UP_AFTER = 3000
/**
 * Ids saved this recently go to someone who comes in: they may have loaded the project before
 * the save, and this tab not seen them yet when it was sent
 */
const RECENT_SAVE = 5000
/**
 * How often, with someone else there, the saved items are checked against what this tab has,
 * in case word of a save never came (its sender's tab closed or lost its connection as it saved)
 */
const CHECK_EVERY = 60_000

/** One colour per person, the same on every screen */
const COLORS = [
  '#e8590c',
  '#1c7ed6',
  '#2f9e44',
  '#ae3ec9',
  '#f08c00',
  '#0c8599',
  '#d6336c',
  '#5f3dc4',
]
export function colorOf(user: string) {
  let h = 0
  for (const c of user) h = (h * 31 + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]!
}

/** Someone online, with what they have selected */
export type Holder = Peer & { sel: Selection }

/** Who holds each item, among selections: the earliest pick, then the lower tab key */
export function holders(
  peers: readonly Holder[],
  mine: { key: string; sel: ReadonlyMap<string, number> } | null,
) {
  const best = new Map<string, { key: string; at: number; peer: Peer | null }>()
  const offer = (id: string, key: string, at: number, peer: Peer | null) => {
    const b = best.get(id)
    if (!b || at < b.at || (at === b.at && key < b.key)) best.set(id, { key, at, peer })
  }
  if (mine) for (const [id, at] of mine.sel) offer(id, mine.key, at, null)
  for (const p of peers)
    if (p.role === 'owner' || p.role === 'editor')
      for (const [id, at] of p.sel) offer(id, p.key, at, p)
  const locks = new Map<string, Peer>()
  for (const [id, b] of best) if (b.peer) locks.set(id, b.peer)
  return locks
}

/**
 * Working on the open cloud project together: who else has it open, what they have selected
 * (locked here), items they're dragging, where their pointers are, and their saved changes
 * coming in; following someone's view, as in Figma. One channel per project, joined while it's
 * open by someone signed in and app_settings has realtime on. Nothing is sent with nobody else
 * there to see it.
 */
export const useCollabStore = defineStore('collab', () => {
  const project = useProjectStore()
  const planner = usePlannerStore()
  const auth = useAuthStore()
  const access = useAccessStore()
  const cloud = useCloudStore()

  /** This tab, among the others in presence */
  const key = crypto.randomUUID()
  /** Everyone else online (other tabs of this person's included) */
  const peers = shallowRef<Peer[]>([])
  const connected = shallowRef(false)
  /** Anyone else has the project open (signed in: guests don't join the channel) */
  const others = computed(() => peers.value.length > 0)
  /** People online besides this tab, one per person */
  const people = computed(() => {
    const seen = new Map<string, Peer>()
    for (const p of peers.value)
      if (p.user !== auth.user?.id && !seen.has(p.user)) seen.set(p.user, p)
    return [...seen.values()]
  })

  let channel: ProjectChannel | null = null
  let editor: EditorLink | null = null
  /** This tab's selection: each id and when it was picked */
  const mine = shallowRef<ReadonlyMap<string, number>>(new Map())
  /** What each other tab has selected (word comes by broadcast) */
  const selections = shallowRef<ReadonlyMap<string, Selection>>(new Map())

  const locks = computed(() => {
    const held = holders(
      peers.value.map((p) => ({ ...p, sel: selections.value.get(p.key) ?? [] })),
      { key, sel: mine.value },
    )
    const out = new Map<string, Lock>()
    for (const [id, p] of held)
      out.set(id, { name: p.name || t().collab.someone, color: colorOf(p.user) })
    return out
  })
  watch(locks, (l) => editor?.setLocks(l))

  function attach(link: EditorLink) {
    editor = link
    link.setLocks(locks.value)
    link.setCursors(cursors.value)
  }
  function detach(link: EditorLink) {
    if (editor === link) editor = null
  }

  // ─── Leaving ───────────────────────────────────────────────────────────────

  function leave() {
    channel?.leave()
    channel = null
    connected.value = false
    peers.value = []
    clearTimeout(fetchTimer)
    changed.clear()
    deleted.clear()
    pendingMoves.clear()
    clearTimeout(moveTimer)
    moveTimer = undefined
    movedAt = 0
    pointerHeld = null
    recent.clear()
    unsent.clear()
    channelProject = null
    versions.clear()
    baselined = false
    checkedAt = null
    clearInterval(checkTimer)
    checkTimer = undefined
    points.value = new Map()
    selections.value = new Map()
    following.value = null
    editor?.follow(null)
    clearTimeout(selectTimer)
    selectTimer = undefined
    clearTimeout(cameraTimer)
    cameraTimer = undefined
  }

  /** The others online changed: forget tabs that left, and tell newcomers what they missed */
  function onPeers(next: Peer[]) {
    const before = new Set(peers.value.map((p) => p.key))
    peers.value = next
    const here = new Set(next.map((p) => p.key))
    const keep = <V>(m: ReadonlyMap<string, V>) =>
      [...m.keys()].every((k) => here.has(k)) ? m : new Map([...m].filter(([k]) => here.has(k)))
    points.value = keep(points.value)
    selections.value = keep(selections.value)
    // someone new: they don't know what this tab has selected yet
    if (next.some((p) => !before.has(p.key))) {
      if (mine.value.size) sendSelectSoon()
      // nor of what was saved just before they came
      sendRecent()
      // from now on, saves are worth checking for: note where the items stand
      if (!baselined) void check()
      // and where this tab's pointer is, at its next move
      pointerSent = null
    }
  }

  // ─── Presence: who this is, and whose view they follow (rarely changes) ────

  function track() {
    if (!channel || !auth.user) return
    channel.track({
      user: auth.user.id,
      name: auth.name,
      avatar: auth.avatar,
      role: project.meta?.role ?? 'viewer',
      follow: following.value,
    })
  }

  // ─── This tab's selection, by broadcast ────────────────────────────────────

  let selectTimer: ReturnType<typeof setTimeout> | undefined
  function sendSelectSoon() {
    selectTimer ??= setTimeout(() => {
      selectTimer = undefined
      // nobody else there: a newcomer is told when they come (see onPeers)
      if (project.canEdit && others.value) channel?.select([...mine.value])
    }, SELECT_DELAY)
  }

  watch(
    () => planner.selection?.ids ?? [],
    (ids) => {
      const was = mine.value
      const next = new Map<string, number>()
      const now = Date.now()
      for (const id of ids) next.set(id, was.get(id) ?? now)
      if (next.size === was.size && ids.every((id) => was.has(id))) return
      mine.value = next
      sendSelectSoon()
    },
  )

  function onSelect(k: string, sel: Selection) {
    const next = new Map(selections.value)
    if (sel.length) next.set(k, sel)
    else next.delete(k)
    selections.value = next
  }

  // ─── Following someone's view ──────────────────────────────────────────────

  /** The tab whose view this one follows */
  const following = shallowRef<string | null>(null)
  const followed = computed(() => peers.value.find((p) => p.key === following.value) ?? null)
  /** Someone follows this tab: its view goes out as it moves */
  const watched = computed(() => peers.value.some((p) => p.follow === key))

  function follow(peerKey: string | null) {
    following.value = peerKey
    if (!peerKey) editor?.follow(null)
    track()
  }
  /** The person took the camera back */
  function followEnded() {
    following.value = null
    track()
  }
  /** This tab's view moved: out to whoever follows it, a few times a second */
  let cameraTimer: ReturnType<typeof setTimeout> | undefined
  function sendCamera() {
    cameraTimer = undefined
    const cam = editor?.cameraState()
    if (cam && watched.value && project.canEdit) channel?.camera(cam)
  }
  function camera() {
    if (watched.value) cameraTimer ??= setTimeout(sendCamera, CAMERA_EVERY)
  }

  function onCamera(k: string, cam: CameraState) {
    if (k === following.value) editor?.follow(cam)
  }

  watch(followed, (p, was) => {
    // they left, or closed that tab
    if (!following.value || p) return
    planner.notify(t().collab.followLeft(was?.name || t().collab.someone))
    follow(null)
  })
  // someone started following this tab: send the view now, not at the next move
  watch(watched, (on) => on && sendCamera())

  // ─── Pointers ──────────────────────────────────────────────────────────────

  /** Where each tab's pointer is in the venue */
  const points = shallowRef<ReadonlyMap<string, Vec3>>(new Map())
  const cursors = computed(() => {
    const out: RemoteCursor[] = []
    for (const p of peers.value) {
      const point = points.value.get(p.key)
      if (point)
        out.push({ key: p.key, name: p.name || t().collab.someone, color: colorOf(p.user), point })
    }
    return out
  })
  watch(cursors, (c) => editor?.setCursors(c))

  function onCursor(k: string, p: Vec3 | null) {
    const next = new Map(points.value)
    if (p) next.set(k, p)
    else next.delete(k)
    points.value = next
  }
  /** Where this tab's pointer was last sent, so one that hardly moved isn't sent again */
  let pointerSent: Vec3 | null = null
  /**
   * This tab's pointer (the editor reports a few a second). Only people who can edit share it,
   * and only with someone else there to see it: every message counts against the cloud's quota.
   */
  function pointer(p: Vec3 | null) {
    if (!channel || !project.canEdit || !auth.user || !others.value) return
    const q = pointerSent
    if (p && q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < POINTER_STEP) return
    if (!p && !q) return
    // mid-drag: it goes out with the drag's next send rather than on its own
    if (p && Date.now() - movedAt < 2 * MOVE_EVERY) {
      pointerHeld = p
      moveTimer ??= setTimeout(sendMoves, MOVE_EVERY)
      return
    }
    pointerHeld = null
    pointerSent = p
    channel.cursor(p)
  }

  // ─── Drags, sent a few times a second ──────────────────────────────────────

  const pendingMoves = new Map<string, LiveMove>()
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  /** When this tab last dragged something: its pointer meanwhile goes out with the drag */
  let movedAt = 0
  /** This tab's pointer, waiting to go out with the drag (see pointer) */
  let pointerHeld: Vec3 | null = null
  function sendMoves() {
    moveTimer = undefined
    const p = pointerHeld
    pointerHeld = null
    if (!channel) return
    if (p) pointerSent = p
    if (pendingMoves.size) {
      channel.move([...pendingMoves.values()], p ?? undefined)
      pendingMoves.clear()
    } else if (p) channel.cursor(p)
  }
  /** Items this tab is dragging; the last of a drag goes out within MOVE_EVERY too */
  function move(moves: readonly LiveMove[]) {
    if (!channel || !project.canEdit || !others.value) return
    movedAt = Date.now()
    for (const m of moves) pendingMoves.set(m.id, m)
    moveTimer ??= setTimeout(sendMoves, MOVE_EVERY)
  }

  // ─── Saved changes going out ───────────────────────────────────────────────

  /** The project the channel is for (a save may finish after another project opened) */
  let channelProject: string | null = null
  /** Ids saved lately, and when, and whether deleted: for someone who comes in (see RECENT_SAVE) */
  const recent = new Map<string, { at: number; gone: boolean }>()
  /** Saved while the connection was down: sent once it's back. Whether each was deleted */
  const unsent = new Map<string, boolean>()

  /** Ids and whether each was deleted, as one message */
  function change(ids: Iterable<[string, boolean]>): ObjectsChange | null {
    const out: ObjectsChange = {}
    for (const [id, gone] of ids) (gone ? (out.deleted ??= []) : (out.changed ??= [])).push(id)
    return out.changed || out.deleted ? out : null
  }

  /** Tell the others what this tab just saved (they fetch those rows); nobody there, nothing sent */
  function sendSaved(projectId: string, c: ObjectsChange, updatedAt: string) {
    if (!channel || projectId !== channelProject) return
    const now = Date.now()
    const ids: [string, boolean][] = [
      ...(c.changed ?? []).map((id): [string, boolean] => [id, false]),
      ...(c.deleted ?? []).map((id): [string, boolean] => [id, true]),
    ]
    // saved at or before the project's updated_at after it (see check)
    const at = Date.parse(updatedAt)
    for (const [id, gone] of ids)
      if (gone) versions.delete(id)
      else versions.set(id, { at, upTo: true })
    for (const [id, gone] of ids) {
      // the latest save of an id last
      recent.delete(id)
      recent.set(id, { at: now, gone })
    }
    if (!connected.value) {
      for (const [id, gone] of ids) unsent.set(id, gone)
      return
    }
    if (others.value && !channel.objects(c)) for (const [id, gone] of ids) unsent.set(id, gone)
  }
  project.onSaved(sendSaved)

  /** What was saved in the last RECENT_SAVE, to someone who just came */
  function sendRecent() {
    const since = Date.now() - RECENT_SAVE
    for (const [id, { at }] of recent) if (at < since) recent.delete(id)
    const c = change([...recent].map(([id, { gone }]) => [id, gone]))
    if (c) channel?.objects(c)
  }

  /** Back after the connection dropped: what was saved meanwhile */
  function sendUnsent() {
    const c = change(unsent)
    if (c && channel?.objects(c)) unsent.clear()
  }

  // ─── Saved changes coming in ───────────────────────────────────────────────

  const changed = new Set<string>()
  const deleted = new Set<string>()
  let fetchTimer: ReturnType<typeof setTimeout> | undefined

  function onObjects(c: ObjectsChange) {
    // the later word on an id wins
    for (const id of c.changed ?? []) {
      deleted.delete(id)
      changed.add(id)
    }
    for (const id of c.deleted ?? []) {
      changed.delete(id)
      deleted.add(id)
    }
    clearTimeout(fetchTimer)
    fetchTimer = setTimeout(() => void fetchChanged(), FETCH_DELAY)
  }

  async function fetchChanged() {
    const m = project.meta
    if (!m || !editor) return
    const ids = [...changed]
    const gone = [...deleted]
    changed.clear()
    deleted.clear()
    try {
      const seen = new Map<string, string>()
      const rows = ids.length
        ? await loadItems(m.id, ids, auth.user ? null : project.via(), seen)
        : []
      if (project.meta?.id !== m.id) return
      if (auth.user) {
        for (const id of [...ids, ...gone]) versions.delete(id)
        for (const [id, at] of seen) versions.set(id, { at: Date.parse(at), upTo: false })
      }
      project.takeRemote(rows, gone, (up, del) => editor?.applyRemote(up, del))
    } catch (e) {
      console.error('[realtime] fetching changed items failed', e)
      if (project.meta?.id !== m.id) return
      // try again later, with anything that came in meanwhile (the later word on an id winning)
      for (const id of ids) if (!deleted.has(id)) changed.add(id)
      for (const id of gone) if (!changed.has(id)) deleted.add(id)
      clearTimeout(fetchTimer)
      fetchTimer = setTimeout(() => void fetchChanged(), FETCH_RETRY)
    }
  }

  /** After the connection was down: every item afresh */
  async function resync() {
    const m = project.meta
    if (!m || !editor) return
    try {
      const seen = new Map<string, string>()
      const rows = await loadItems(m.id, null, auth.user ? null : project.via(), seen)
      if (project.meta?.id !== m.id) return
      if (auth.user) {
        versions.clear()
        for (const [id, at] of seen) versions.set(id, { at: Date.parse(at), upTo: false })
        baselined = true
      }
      project.takeRemote(rows, [], (up, del) => editor?.applyRemote(up, del), { full: true })
    } catch (e) {
      // a guest's link that no longer opens it: the page says so
      if (e instanceof CloudError && e.code === 'gone') return void project.reload()
      console.error('[realtime] catching up failed', e)
      return
    }
    // a guest's items came through the link, which just showed it still opens
    if (auth.user) void project.refreshMeta()
  }

  function onAccess() {
    // a guest has no access of their own to change (sharing changing comes as 'project')
    if (!auth.user) return
    void project.refreshMeta()
    if (project.meta?.role === 'owner') void access.refresh()
  }

  // ─── Checking for saves whose word never came ──────────────────────────────

  /**
   * Each item's updated_at as this tab has it, by id: exactly, as fetched, or (`upTo`) no later
   * than this, for this tab's own saves
   */
  const versions = new Map<string, { at: number; upTo: boolean }>()
  /** `versions` holds every item: taken from the saved items once someone else came */
  let baselined = false
  /** The project's updated_at at the last check: unchanged since, nothing to look at */
  let checkedAt: string | null = null
  let checking = false
  let checkTimer: ReturnType<typeof setInterval> | undefined

  /**
   * With someone else there: when the project changed since the last check, read each saved
   * item's updated_at (not the items: they can hold large images) and fetch those this tab
   * hasn't, and drop those gone, as if word of them had come
   */
  async function check() {
    const id = channelProject
    if (!id || checking || !others.value || !connected.value) return
    if (document.visibilityState === 'hidden') return
    checking = true
    try {
      const at = await loadUpdatedAt(id)
      if (channelProject !== id || at === checkedAt) return
      const saved = await loadVersions(id)
      if (channelProject !== id) return
      checkedAt = at
      if (!baselined) {
        versions.clear()
        for (const [k, v] of saved) versions.set(k, { at: Date.parse(v), upTo: false })
        baselined = true
        return
      }
      const missed: string[] = []
      for (const [k, v] of saved) {
        const had = versions.get(k)
        const t = Date.parse(v)
        if (!had || (had.upTo ? t > had.at : t !== had.at)) missed.push(k)
      }
      const gone = [...versions.keys()].filter((k) => !saved.has(k))
      if (missed.length || gone.length) onObjects({ changed: missed, deleted: gone })
    } catch (e) {
      console.warn('[realtime] checking for missed saves failed', e)
    } finally {
      checking = false
    }
  }

  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check()
    })

  // ─── Joining (last: it runs at once, using everything above) ────────────────

  /** When the open project was loaded, to tell whether joining now may have missed changes */
  let openedAt = 0
  watch(
    () => project.meta?.id,
    () => (openedAt = Date.now()),
    { immediate: true },
  )

  // joined again whenever the project, who's signed in or their role changes (a new role may
  // send what the old one couldn't), and left while app_settings has realtime off
  watch(
    // each compared on its own: the project's meta is replaced on every save, and a getter
    // returning a new array would rejoin each time (others seeing this tab leave and come back)
    [() => project.meta?.id, () => auth.user?.id, () => project.meta?.role, () => cloud.realtime],
    ([id, user, role, on]) => {
      leave()
      // guests don't join: a public link could bring more viewers than the free plan's 200
      // connections, and every message to each of them counts (they catch up when they come
      // back to the tab instead, see below)
      if (!id || !role || !on || !user) return
      channelProject = id
      checkTimer = setInterval(() => void check(), CHECK_EVERY)
      channel = joinProject(
        id,
        { key, present: !!user },
        {
          peers: onPeers,
          move: (m) => editor?.applyLive(m),
          cursor: onCursor,
          select: onSelect,
          camera: onCamera,
          objects: onObjects,
          project: () => void project.refreshMeta(),
          access: onAccess,
          deleted: () => void project.reload(),
          joined: (again) => {
            connected.value = true
            sendUnsent()
            // things may have changed while the connection was down, or before it was first
            // made (realtime switched on late): catch up on all of it
            if (again || Date.now() - openedAt > CATCH_UP_AFTER) void resync()
          },
          dropped: () => (connected.value = false),
        },
      )
      track()
    },
    { immediate: true },
  )

  // ─── Guests: no channel, so a look for changes when they come back to the tab ──

  /** Away from the tab at least this long: changes are looked for on coming back */
  const GUEST_RECHECK_AFTER = 120_000
  let hiddenAt = 0
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (!auth.user && project.meta && hiddenAt && Date.now() - hiddenAt >= GUEST_RECHECK_AFTER)
        void resync()
      hiddenAt = 0
    })

  return {
    peers,
    people,
    connected,
    locks,
    following,
    attach,
    detach,
    move,
    pointer,
    camera,
    follow,
    followEnded,
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useCollabStore, import.meta.hot))
