import { supabase } from '@/lib/supabase'
import { parseLayout, type LayoutItem, type Pricing } from '@/venue/layout'

/*
 * Cloud projects in Supabase: `projects` (name, owner, the layout file's other parts in
 * `settings`) and `project_objects` (one row per placed item, its id the item's). Row level
 * security decides who may read and write; these just make the calls.
 */

/** The layout file's parts besides its items */
export interface ProjectSettings {
  pricing?: Partial<Pricing>
  palettes?: Record<string, readonly string[]>
}

/** The signed-in person's part in a project (or a guest's, through an open share link) */
export type Role = 'owner' | 'editor' | 'viewer'
/** What an owner grants someone by email, or someone asks the owner for */
export type Grant = 'viewer' | 'editor'
/** Who may view through the share link: anyone, signed-in people, or only people added by name */
export type ViewAccess = 'anyone' | 'authenticated' | 'allowed'
/** Who may edit through the share link: signed-in people, or only people added as editors */
export type EditAccess = 'authenticated' | 'allowed'

/** A project's share link and who it lets in; only its owner sees and changes these */
export interface Sharing {
  share_token: string
  share_enabled: boolean
  view_access: ViewAccess
  edit_access: EditAccess
}

export interface ProjectMeta {
  id: string
  name: string
  updated_at: string
  role: Role
  /** What this person has asked the owner for and is waiting on (never for its owner) */
  requested: Grant | null
  /** For its owner only */
  sharing: Sharing | null
}

export interface LoadedProject {
  meta: ProjectMeta
  items: LayoutItem[]
  settings: ProjectSettings
}

/** A row in My Projects */
export interface ProjectSummary {
  id: string
  name: string
  updated_at: string
  /** How many items are placed */
  count: number
}

/** Why a call failed, for the message shown */
export type CloudErrorCode =
  /** no Supabase project configured in this build */
  | 'unavailable'
  | 'not_found'
  /** at app_settings' maxProjectsPerUser */
  | 'limit'
  /** app_settings has the cloud (or creating projects) switched off */
  | 'paused'
  /** row level security refused it: no longer allowed to edit, or the cloud paused */
  | 'denied'
  /** the project was deleted while open, or this person can no longer open it */
  | 'gone'
  /** found on checking after a failed save: */
  /** signed out (in this tab or another) */
  | 'signed_out'
  /** opened through a share link that's since been turned off or replaced */
  | 'link_off'
  /** their editing rights were taken away; they may still view */
  | 'viewer'
  /** the session ran out and couldn't be renewed */
  | 'auth'
  /** no connection */
  | 'network'
  /** Supabase had a problem of its own (5xx, timeout, too many requests) */
  | 'server'
  | 'failed'

/** Failures worth trying again: they tend to pass on their own */
export const isTransient = (code: CloudErrorCode) =>
  code === 'network' || code === 'server' || code === 'auth'

export class CloudError extends Error {
  constructor(
    readonly code: CloudErrorCode,
    /** The underlying error from Supabase, for the console */
    readonly detail?: unknown,
  ) {
    super(code)
  }
}

/** Longest project name kept, in characters */
export const NAME_MAX = 80
export const cleanName = (s: string) => s.trim().slice(0, NAME_MAX)

export function db() {
  if (!supabase) throw new CloudError('unavailable')
  return supabase
}

type ApiError = { code?: string; message?: string } | null

/** What kind of failure an API response is, from its status and Postgres / PostgREST code */
function classify(error: NonNullable<ApiError>, status: number): CloudErrorCode {
  // fetch itself failed (offline, DNS, CORS): supabase-js reports it with no status
  if (!status || /fetch|network|load failed/i.test(error.message ?? '')) return 'network'
  // permission refused comes back as 401 for guests, so this goes before the 401 check
  if (error.code === '42501') return 'denied'
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return 'auth'
  if (status >= 500 || status === 408 || status === 429) return 'server'
  // a row's project no longer exists
  if (error.code === '23503') return 'gone'
  return 'failed'
}

/** A response's data, or its error thrown as a CloudError */
export function check<T>(r: { data: T; error: ApiError; status: number }): T {
  if (r.error) throw new CloudError(classify(r.error, r.status), r.error)
  return r.data
}

/** One item as its row's `type` and `data` (everything but its id and type) */
function toRow(projectId: string, item: LayoutItem) {
  const { id, t, ...data } = item
  return { project_id: projectId, id: id!, type: t, data }
}

/**
 * What a row holds, as a string: compared to tell whether an item changed since it was saved.
 * Its keys sorted, so the same item reads the same however it was put together.
 */
export function rowKey(item: LayoutItem) {
  const { id: _id, ...rest } = item
  const keys = Object.keys(rest).sort() as (keyof typeof rest)[]
  return JSON.stringify(keys.map((k) => [k, rest[k]]))
}

/**
 * Upsert rows a batch at a time, each batch under ~1 MB (poster images make rows large), so no
 * request grows past what the API accepts
 */
async function upsertItems(projectId: string, items: readonly LayoutItem[]) {
  const LIMIT = 1_000_000
  let batch: ReturnType<typeof toRow>[] = []
  let size = 0
  const send = async () => {
    if (!batch.length) return
    check(await db().from('project_objects').upsert(batch))
    batch = []
    size = 0
  }
  for (const item of items) {
    const row = toRow(projectId, item)
    const n = JSON.stringify(row).length
    if (size + n > LIMIT) await send()
    batch.push(row)
    size += n
  }
  await send()
}

/** The signed-in person's own projects, the latest changed first */
export async function listMyProjects(ownerId: string): Promise<ProjectSummary[]> {
  const rows = check(
    await db()
      .from('projects')
      .select('id, name, updated_at, project_objects(count)')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  ) as (Omit<ProjectSummary, 'count'> & { project_objects: { count: number }[] })[]
  return rows.map(({ project_objects, ...p }) => ({ ...p, count: project_objects[0]?.count ?? 0 }))
}

/** Before creating one: whether the cloud takes new projects, and this person is under the limit */
async function checkCanCreate(ownerId: string) {
  const settings = check(
    await db().from('app_settings').select('value').eq('key', 'cloud').maybeSingle(),
  ) as { value: { enabled?: boolean; allowCreate?: boolean; maxProjectsPerUser?: unknown } } | null
  const v = settings?.value
  if (!v?.enabled || !v.allowCreate) throw new CloudError('paused')
  if (typeof v.maxProjectsPerUser !== 'number') return
  const r = await db()
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
  check(r)
  if ((r.count ?? 0) >= v.maxProjectsPerUser) throw new CloudError('limit')
}

/** A new project holding these items; returns its id */
export async function createProject(
  ownerId: string,
  name: string,
  items: readonly LayoutItem[],
  settings: ProjectSettings,
): Promise<string> {
  await checkCanCreate(ownerId)
  const { id } = check(
    await db()
      .from('projects')
      .insert({ name: cleanName(name), settings })
      .select('id')
      .single(),
  ) as { id: string }
  try {
    await upsertItems(id, items)
  } catch (e) {
    // no half-saved project left behind
    await db().from('projects').delete().eq('id', id)
    throw e
  }
  return id
}

type ObjectRow = { id: string; type: string; data: Record<string, unknown> }

/** Rows of project_objects (or open_shared_project's objects) as layout items */
export function itemsOf(rows: ObjectRow[]) {
  // through parseLayout like a file, so a bad row is dropped rather than breaking the scene
  return parseLayout(rows.map((r) => ({ ...r.data, id: r.id, t: r.type })))
}

/**
 * A project without its items, if the signed-in person (`userId`) may open it, with their role
 * on it. Without `userId` the role isn't looked up (it reads as viewer).
 */
export async function loadMeta(id: string, userId?: string): Promise<Omit<LoadedProject, 'items'>> {
  const project = check(
    await db()
      .from('projects')
      .select(
        'id, name, owner_id, updated_at, settings, share_token, share_enabled, view_access, edit_access',
      )
      .eq('id', id)
      .maybeSingle(),
  ) as
    | (Sharing & { id: string; name: string; owner_id: string; updated_at: string } & {
        settings: ProjectSettings | null
      })
    | null
  if (!project) throw new CloudError('not_found')
  let role: Role = 'viewer'
  let requested: Grant | null = null
  if (userId && project.owner_id === userId) role = 'owner'
  else if (userId) {
    role = (check(await db().rpc('project_role', { p_project: id })) as Role) ?? 'viewer'
    // row level security shows someone other than the owner just their own row
    const mine = check(
      await db().from('project_access').select('requested_role').eq('project_id', id).maybeSingle(),
    ) as { requested_role: Grant | null } | null
    requested = mine?.requested_role ?? null
  }
  const { share_token, share_enabled, view_access, edit_access } = project
  return {
    meta: {
      id: project.id,
      name: project.name,
      updated_at: project.updated_at,
      role,
      requested,
      sharing: role === 'owner' ? { share_token, share_enabled, view_access, edit_access } : null,
    },
    settings: project.settings ?? {},
  }
}

/** A project and its items (see loadMeta) */
export async function loadProject(id: string, userId?: string): Promise<LoadedProject> {
  const [meta, rows] = await Promise.all([
    loadMeta(id, userId),
    db().from('project_objects').select('id, type, data').eq('project_id', id),
  ])
  return { ...meta, items: itemsOf(check(rows) as ObjectRow[]) }
}

/**
 * Some of a project's items as they're saved now: through the share link (`token`) for a guest,
 * who can't read project_objects themselves. All of them with no `ids`.
 */
export async function loadItems(
  projectId: string,
  ids: readonly string[] | null,
  token?: string | null,
): Promise<LayoutItem[]> {
  if (!ids) {
    if (token) {
      const r = await loadShared(token)
      if (r.status !== 'ok') throw new CloudError('gone')
      return r.project.items
    }
    return itemsOf(
      check(
        await db().from('project_objects').select('id, type, data').eq('project_id', projectId),
      ) as ObjectRow[],
    )
  }
  const rows: ObjectRow[] = []
  // a batch at a time, so the request's address stays short
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    rows.push(
      ...((token
        ? check(await db().rpc('shared_objects', { p_token: token, p_ids: batch }))
        : check(
            await db()
              .from('project_objects')
              .select('id, type, data')
              .eq('project_id', projectId)
              .in('id', batch),
          )) as ObjectRow[]),
    )
  }
  return itemsOf(rows)
}

/** What a share link opens to */
export type SharedResult =
  | { status: 'ok'; project: LoadedProject }
  | { status: 'not_found' | 'sign_in_required' }
  /** signed in, but the link doesn't let them in; `requested`: they've asked the owner */
  | { status: 'no_access'; requested: boolean }

/** Open a project through its share link, signed in or not */
export async function loadShared(token: string): Promise<SharedResult> {
  const r = check(await db().rpc('open_shared_project', { p_token: token })) as
    | { status: 'not_found' | 'sign_in_required' }
    | { status: 'no_access'; requested: boolean }
    | {
        status: 'ok'
        role: Role
        requested_role: Grant | null
        project: Omit<Sharing, 'share_token'> & {
          id: string
          name: string
          updated_at: string
          settings: ProjectSettings | null
        }
        objects: { id: string; type: string; data: Record<string, unknown> }[]
      }
  if (r.status !== 'ok') return r
  const { id, name, updated_at, settings, share_enabled, view_access, edit_access } = r.project
  return {
    status: 'ok',
    project: {
      meta: {
        id,
        name,
        updated_at,
        role: r.role,
        requested: r.requested_role ?? null,
        sharing:
          r.role === 'owner'
            ? { share_token: token, share_enabled, view_access, edit_access }
            : null,
      },
      items: itemsOf(r.objects),
      settings: settings ?? {},
    },
  }
}

/**
 * Why this person can't save to a project now, checked afresh after a save failed: the cloud
 * paused, signed out, the project gone (or out of reach), the share link they came through off
 * or replaced, or only viewing now. 'ok' when they still may edit (so it was something else).
 */
export async function checkAccess(
  projectId: string,
  { signedIn, shareToken }: { signedIn: boolean; shareToken: string | null },
): Promise<
  'ok' | Extract<CloudErrorCode, 'paused' | 'signed_out' | 'gone' | 'link_off' | 'viewer'>
> {
  const settings = check(
    await db().from('app_settings').select('value').eq('key', 'cloud').maybeSingle(),
  ) as { value: { enabled?: boolean; allowUpdate?: boolean } } | null
  if (!settings?.value.enabled || !settings.value.allowUpdate) return 'paused'
  if (!signedIn) return 'signed_out'
  const role = check(await db().rpc('project_role', { p_project: projectId })) as Role | null
  if (role === 'owner' || role === 'editor') return 'ok'
  if (role === 'viewer') return 'viewer'
  // no role at all: through a link that no longer opens, or the project itself is gone
  if (shareToken) {
    const r = check(await db().rpc('open_shared_project', { p_token: shareToken })) as {
      status: string
    }
    if (r.status === 'not_found') return 'link_off'
  }
  return 'gone'
}

/** Change a project's share link settings; a new `share_token` makes the old link stop working */
export async function updateSharing(id: string, patch: Partial<Sharing>): Promise<Sharing> {
  return check(
    await db()
      .from('projects')
      .update(patch)
      .eq('id', id)
      .select('share_token, share_enabled, view_access, edit_access')
      .single(),
  ) as Sharing
}

/**
 * Write what changed: these items upserted, these ids removed, and the settings if given.
 * Returns the project's updated_at afterwards, as the database has it.
 */
export async function saveChanges(
  projectId: string,
  changes: {
    upserts: readonly LayoutItem[]
    deletes: readonly string[]
    settings?: ProjectSettings
  },
): Promise<string> {
  await upsertItems(projectId, changes.upserts)
  if (changes.deletes.length)
    check(
      await db()
        .from('project_objects')
        .delete()
        .eq('project_id', projectId)
        .in('id', [...changes.deletes]),
    )
  // through a function, since editors may change these but not the projects row itself
  if (changes.settings)
    check(
      await db().rpc('set_project_settings', {
        p_project: projectId,
        p_settings: changes.settings,
      }),
    )
  const row = check(
    await db().from('projects').select('updated_at').eq('id', projectId).maybeSingle(),
  ) as { updated_at: string } | null
  // gone while saving: the writes above would have failed, but just in case
  if (!row) throw new CloudError('gone')
  return row.updated_at
}

export async function renameProject(id: string, name: string) {
  check(
    await db()
      .from('projects')
      .update({ name: cleanName(name) })
      .eq('id', id),
  )
}

export async function deleteProject(id: string) {
  check(await db().from('projects').delete().eq('id', id))
}

/** A copy of a project under a new name; returns the copy's id */
export async function duplicateProject(ownerId: string, id: string, name: string) {
  const { items, settings } = await loadProject(id)
  return createProject(ownerId, name, items, settings)
}
