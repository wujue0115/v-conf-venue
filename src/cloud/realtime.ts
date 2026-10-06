import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Role } from './projects'
import type { Vec3 } from '@/venue/places'
import type { CameraState, LiveMove, WalkerState } from '@/venue/VenueEditor'

/*
 * A project's realtime channel, `project:<id>` (private: row level security on
 * realtime.messages decides who may listen and send, see 20261003100000_realtime.sql):
 * - presence: who has the project open, and whose view they follow. Supabase closes the channel
 *   of a client that updates its presence more than 5 times in 30 seconds, so only what rarely
 *   changes goes here, and updates are held back to stay under that (PRESENCE_BUDGET);
 * - broadcast, from people who can edit: 'move' (items being dragged, with the pointer dragging
 *   them), 'cursor' (their pointer), 'select' (what they have selected, which locks it for the
 *   others), 'camera' (their view, while someone follows them), 'walk' (where they are while
 *   walking through the venue, shown as a figure in their colour), 'objects' (ids they saved or
 *   deleted: only the ids, as rows can hold large poster images);
 * - from the database: 'project' (name, settings or sharing), 'access' (someone's access),
 *   'deleted' (the project).
 */

/** What each signed-in person with the project open shows the others, in presence */
export interface PeerState {
  user: string
  name: string
  avatar: string
  role: Role
  /** The tab whose view they're following */
  follow: string | null
}

/** One open tab (a person may have several) */
export interface Peer extends PeerState {
  key: string
}

/** What a tab has selected: each item's id, and when it was picked (ms since epoch) */
export type Selection = [string, number][]

export interface ChannelEvents {
  /** Everyone else online, whenever that changes */
  peers: (peers: Peer[]) => void
  move: (moves: LiveMove[]) => void
  /** A tab's pointer in the venue; null when it left the stage */
  cursor: (key: string, point: Vec3 | null) => void
  select: (key: string, sel: Selection) => void
  camera: (key: string, cam: CameraState) => void
  /** A tab walking through the venue; null once it stopped */
  walk: (key: string, walker: WalkerState | null) => void
  objects: (change: ObjectsChange) => void
  project: () => void
  access: () => void
  deleted: () => void
  /** Connected; `again` after the connection dropped (anything may have been missed meanwhile) */
  joined: (again: boolean) => void
  /** The connection dropped (the client keeps trying by itself) */
  dropped: () => void
}

/** Ids saved (upserted) or deleted, in one message */
export interface ObjectsChange {
  changed?: string[]
  deleted?: string[]
}

export interface ProjectChannel {
  /** Show this to the others (signed-in people only); held back when sent too often */
  track(state: PeerState): void
  /** Items being dragged, and the pointer dragging them when it moved */
  move(moves: LiveMove[], point?: Vec3): void
  cursor(point: Vec3 | null): void
  select(sel: Selection): void
  camera(cam: CameraState): void
  walk(walker: WalkerState | null): void
  /** Whether it went out (not while the connection is down) */
  objects(change: ObjectsChange): boolean
  leave(): void
}

/** Presence updates allowed per window, one under Supabase's 5 per 30 seconds */
export const PRESENCE_BUDGET = 4
export const PRESENCE_WINDOW = 30_000

/**
 * Keeps sends of the latest state under `budget` per `window` ms: one that would go over waits
 * until the oldest leaves the window, and only the latest state waiting is sent then.
 */
export function rateLimited<T>(
  send: (state: T) => void,
  { budget = PRESENCE_BUDGET, window = PRESENCE_WINDOW } = {},
) {
  const sentAt: number[] = []
  let waiting: { state: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush() {
    timer = undefined
    if (!waiting) return
    const now = Date.now()
    while (sentAt.length && now - sentAt[0]! >= window) sentAt.shift()
    if (sentAt.length >= budget) {
      timer = setTimeout(flush, sentAt[0]! + window - now + 50)
      return
    }
    const { state } = waiting
    waiting = null
    sentAt.push(now)
    send(state)
  }

  return {
    push(state: T) {
      waiting = { state }
      if (!timer) flush()
    },
    stop() {
      clearTimeout(timer)
      timer = undefined
      waiting = null
    },
  }
}

/**
 * Join a project's channel as this tab (`key`). `present`: show up in presence (signed-in
 * people); a guest only listens.
 */
export function joinProject(
  projectId: string,
  { key, present }: { key: string; present: boolean },
  on: ChannelEvents,
): ProjectChannel {
  const ch: RealtimeChannel = supabase!.channel(`project:${projectId}`, {
    config: {
      private: true,
      broadcast: { self: false },
      ...(present ? { presence: { key } } : {}),
    },
  })
  let joined = false
  let joinedBefore = false
  let left = false
  /** The presence state to show (sent once joined, and again after a dropped connection) */
  let state: PeerState | null = null
  const presence = rateLimited<PeerState>((s) => void ch.track(s))

  if (present)
    ch.on('presence', { event: 'sync' }, () => {
      const all = ch.presenceState<PeerState>()
      const peers: Peer[] = []
      for (const [k, metas] of Object.entries(all)) {
        if (k === key) continue
        // a tab that tracked twice shows its latest
        const last = metas[metas.length - 1]
        if (last)
          peers.push({
            key: k,
            user: last.user,
            name: last.name,
            avatar: last.avatar,
            role: last.role,
            follow: last.follow ?? null,
          })
      }
      on.peers(peers)
    })
  ch.on('broadcast', { event: 'move' }, ({ payload }) => {
    const { m, k, p } = payload as { m: LiveMove[]; k?: string; p?: Vec3 }
    on.move(m)
    if (k && p) on.cursor(k, p)
  })
    .on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const { k, p } = payload as { k: string; p: Vec3 | null }
      on.cursor(k, p)
    })
    .on('broadcast', { event: 'select' }, ({ payload }) => {
      const { k, s } = payload as { k: string; s: Selection }
      on.select(k, s)
    })
    .on('broadcast', { event: 'camera' }, ({ payload }) => {
      const { k, c } = payload as { k: string; c: CameraState }
      on.camera(k, c)
    })
    .on('broadcast', { event: 'walk' }, ({ payload }) => {
      const { k, w } = payload as { k: string; w: WalkerState | null }
      on.walk(k, w)
    })
    .on('broadcast', { event: 'objects' }, ({ payload }) => on.objects(payload as ObjectsChange))
    .on('broadcast', { event: 'project' }, () => on.project())
    .on('broadcast', { event: 'access' }, () => on.access())
    .on('broadcast', { event: 'deleted' }, () => on.deleted())
    .subscribe((status, err) => {
      if (left) return
      if (status === 'SUBSCRIBED') {
        joined = true
        // the server forgets presence on a dropped connection: show up again
        if (state) presence.push(state)
        on.joined(joinedBefore)
        joinedBefore = true
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        joined = false
        // the client keeps trying by itself
        console.warn('[realtime]', status, err ?? '')
        on.dropped()
      }
    })

  const send = (event: string, payload: object) => {
    if (!joined) return false
    void ch.send({ type: 'broadcast', event, payload })
    return true
  }

  return {
    track(s) {
      if (!present) return
      state = s
      if (joined) presence.push(s)
    },
    move: (m, p) => void send('move', p ? { m, k: key, p } : { m }),
    cursor: (p) => void send('cursor', { k: key, p }),
    select: (s) => void send('select', { k: key, s }),
    camera: (c) => void send('camera', { k: key, c }),
    walk: (w) => void send('walk', { k: key, w }),
    objects: (c) => send('objects', c),
    leave() {
      left = true
      presence.stop()
      void supabase!.removeChannel(ch)
    },
  }
}
