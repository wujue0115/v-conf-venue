import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Role } from './projects'
import type { Vec3 } from '@/venue/places'
import type { CameraState, LiveMove } from '@/venue/VenueEditor'

/*
 * A project's realtime channel, `project:<id>` (private: row level security on
 * realtime.messages decides who may listen and send, see 20261003100000_realtime.sql):
 * - presence: who has the project open, and whose view they follow. Supabase closes the channel
 *   of a client that updates its presence more than 5 times in 30 seconds, so only what rarely
 *   changes goes here, and updates are held back to stay under that (PRESENCE_BUDGET);
 * - broadcast, from people who can edit: 'move' (items being dragged), 'cursor' (their pointer),
 *   'select' (what they have selected, which locks it for the others), 'camera' (their view,
 *   while someone follows them);
 * - from the database: 'objects' (ids changed or deleted), 'project' (name, settings or sharing),
 *   'access' (someone's access), 'deleted' (the project).
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
  objects: (change: { changed?: string[]; deleted?: string[] }) => void
  project: () => void
  access: () => void
  deleted: () => void
  /** Connected; `again` after the connection dropped (anything may have been missed meanwhile) */
  joined: (again: boolean) => void
}

export interface ProjectChannel {
  /** Show this to the others (signed-in people only); held back when sent too often */
  track(state: PeerState): void
  move(moves: LiveMove[]): void
  cursor(point: Vec3 | null): void
  select(sel: Selection): void
  camera(cam: CameraState): void
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
  ch.on('broadcast', { event: 'move' }, ({ payload }) => on.move((payload as { m: LiveMove[] }).m))
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
    .on('broadcast', { event: 'objects' }, ({ payload }) =>
      on.objects(payload as { changed?: string[]; deleted?: string[] }),
    )
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
      }
    })

  const send = (event: string, payload: object) => {
    if (joined) void ch.send({ type: 'broadcast', event, payload })
  }

  return {
    track(s) {
      if (!present) return
      state = s
      if (joined) presence.push(s)
    },
    move: (m) => send('move', { m }),
    cursor: (p) => send('cursor', { k: key, p }),
    select: (s) => send('select', { k: key, s }),
    camera: (c) => send('camera', { k: key, c }),
    leave() {
      left = true
      presence.stop()
      void supabase!.removeChannel(ch)
    },
  }
}
