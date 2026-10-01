import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { loadItems } from '@/cloud/projects'
import {
  joinProject,
  realtimeOn,
  type Peer,
  type ProjectChannel,
  type Selection,
} from '@/cloud/realtime'
import { t } from '@/i18n'
import { useAccessStore } from '@/stores/access'
import { useAuthStore } from '@/stores/auth'
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

/** How often a drag is sent to the others */
const MOVE_EVERY = 80
/** How often this tab's view goes out while someone follows it */
const CAMERA_EVERY = 250
/** A burst of selection changes (box-selecting, clicking along) goes out as one */
const SELECT_DELAY = 100
/** Changed ids are gathered this long before fetching them, so a burst is one fetch */
const FETCH_DELAY = 120

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
 * open and app_settings has realtime on.
 */
export const useCollabStore = defineStore('collab', () => {
  const project = useProjectStore()
  const planner = usePlannerStore()
  const auth = useAuthStore()
  const access = useAccessStore()

  /** This tab, among the others in presence */
  const key = crypto.randomUUID()
  /** Everyone else online (other tabs of this person's included) */
  const peers = shallowRef<Peer[]>([])
  const connected = shallowRef(false)
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
    if (next.some((p) => !before.has(p.key)) && mine.value.size) sendSelectSoon()
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
      if (project.canEdit) channel?.select([...mine.value])
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
  /** This tab's pointer (the editor sends a few a second); only people who can edit share it */
  function pointer(p: Vec3 | null) {
    if (channel && project.canEdit && auth.user) channel.cursor(p)
  }

  // ─── Drags, sent a few times a second ──────────────────────────────────────

  const pendingMoves = new Map<string, LiveMove>()
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  function sendMoves() {
    moveTimer = undefined
    if (!channel || !pendingMoves.size) return
    channel.move([...pendingMoves.values()])
    pendingMoves.clear()
  }
  /** Items this tab is dragging; the last of a drag goes out within MOVE_EVERY too */
  function move(moves: readonly LiveMove[]) {
    if (!channel || !project.canEdit) return
    for (const m of moves) pendingMoves.set(m.id, m)
    moveTimer ??= setTimeout(sendMoves, MOVE_EVERY)
  }

  // ─── Saved changes coming in ───────────────────────────────────────────────

  const changed = new Set<string>()
  const deleted = new Set<string>()
  let fetchTimer: ReturnType<typeof setTimeout> | undefined

  function onObjects(c: { changed?: string[]; deleted?: string[] }) {
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
      const rows = ids.length ? await loadItems(m.id, ids, auth.user ? null : project.via()) : []
      if (project.meta?.id !== m.id) return
      project.takeRemote(rows, gone, (up, del) => editor?.applyRemote(up, del))
    } catch (e) {
      console.error('[realtime] fetching changed items failed', e)
    }
  }

  /** After the connection was down: every item afresh */
  async function resync() {
    const m = project.meta
    if (!m || !editor) return
    try {
      const rows = await loadItems(m.id, null, auth.user ? null : project.via())
      if (project.meta?.id !== m.id) return
      project.takeRemote(rows, [], (up, del) => editor?.applyRemote(up, del), { full: true })
    } catch (e) {
      console.error('[realtime] catching up failed', e)
    }
    void project.refreshMeta()
  }

  function onAccess() {
    void project.refreshMeta()
    if (project.meta?.role === 'owner') void access.refresh()
  }

  // ─── Joining (last: it runs at once, using everything above) ────────────────

  // joined again whenever the project, who's signed in or their role changes (a new role may
  // send what the old one couldn't)
  watch(
    () => [project.meta?.id, auth.user?.id, project.meta?.role] as const,
    async ([id, user, role]) => {
      leave()
      if (!id || !role) return
      if (!(await realtimeOn())) return
      // moved on while asking
      if (project.meta?.id !== id || auth.user?.id !== user || project.meta?.role !== role) return
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
            // things may have changed while the connection was down: catch up on all of it
            if (again) void resync()
          },
        },
      )
      track()
    },
    { immediate: true },
  )

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
