import { supabase } from '@/lib/supabase'
import { parseLayout, type LayoutItem, type Pricing, type Scene } from '@/venue/layout'

/*
 * Cloud projects in Supabase: `projects` (name, owner, the layout file's other parts in
 * `settings`), `project_scenes` (its scenes, in order) and `project_objects` (one row per placed
 * item in a scene, its id the item's: an item copied into another scene keeps its id there).
 * Row level security decides who may read and write; these just make the calls.
 */

/** An item, and the scene it's in */
export interface SceneItem {
  scene: string
  item: LayoutItem
}

/** An item in a scene as one string: what saves are worked out, sent and compared by */
export const refOf = (scene: string, id: string) => `${scene}/${id}`
export function splitRef(ref: string) {
  const k = ref.indexOf('/')
  return { scene: ref.slice(0, k), id: ref.slice(k + 1) }
}

/** A scene's row: its name ('' for none) and its place among the project's scenes */
export interface SceneRow {
  id: string
  name: string
}

/** The layout file's parts besides its items */
export interface ProjectSettings {
  pricing?: Partial<Pricing>
  palettes?: Record<string, readonly string[]>
  /** The floors its items stand on (see floors.ts); absent on projects saved before floors 2 */
  floors?: number
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
  /** In order; every project has one at least, once 20261014100000_scenes.sql has run */
  scenes: Scene[]
  settings: ProjectSettings
}

/** A row in My Projects */
export interface ProjectSummary {
  id: string
  name: string
  updated_at: string
  /** How many items are placed, in all its scenes, and how many scenes it has */
  count: number
  scenes: number
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
  /** allowed_creators has emails, and not this person's */
  | 'not_allowed'
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

/** One item as its row's `type` and `data` (everything but its id and type), in its scene */
function toRow(projectId: string, { scene, item }: SceneItem) {
  const { id, t, ...data } = item
  return { project_id: projectId, scene_id: scene, id: id!, type: t, data }
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
async function upsertItems(projectId: string, items: readonly SceneItem[]) {
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
      .select('id, name, updated_at, project_objects(count), project_scenes(count)')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  ) as (Omit<ProjectSummary, 'count' | 'scenes'> & {
    project_objects: { count: number }[]
    project_scenes: { count: number }[]
  })[]
  return rows.map(({ project_objects, project_scenes, ...p }) => ({
    ...p,
    count: project_objects[0]?.count ?? 0,
    scenes: project_scenes[0]?.count ?? 0,
  }))
}

/** Before creating one: whether the cloud takes new projects, and this person is under the limit */
async function checkCanCreate(ownerId: string) {
  const settings = check(
    await db().from('app_settings').select('value').eq('key', 'cloud').maybeSingle(),
  ) as { value: { enabled?: boolean; allowCreate?: boolean; maxProjectsPerUser?: unknown } } | null
  const v = settings?.value
  if (!v?.enabled || !v.allowCreate) throw new CloudError('paused')
  const may = await db().rpc('may_create_projects')
  // an error (a database without the list, say) leaves it to the insert's own check
  if (!may.error && may.data === false) throw new CloudError('not_allowed')
  if (typeof v.maxProjectsPerUser !== 'number') return
  const r = await db()
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
  check(r)
  if ((r.count ?? 0) >= v.maxProjectsPerUser) throw new CloudError('limit')
}

/** Its scenes as rows, each with its place in the order */
const sceneRows = (projectId: string, scenes: readonly SceneRow[]) =>
  scenes.map((s, sort) => ({ project_id: projectId, id: s.id, name: s.name, sort }))

/** A new project holding these scenes (one at least); returns its id */
export async function createProject(
  ownerId: string,
  name: string,
  scenes: readonly Scene[],
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
    check(await db().from('project_scenes').insert(sceneRows(id, scenes)))
    await upsertItems(
      id,
      // an item never shown in the editor (a scene from a file, say) may have no id yet
      scenes.flatMap((s) =>
        s.items.map((item) => ({
          scene: s.id,
          item: item.id ? item : { ...item, id: crypto.randomUUID() },
        })),
      ),
    )
  } catch (e) {
    // no half-saved project left behind
    await db().from('projects').delete().eq('id', id)
    throw e
  }
  return id
}

type ObjectRow = {
  id: string
  scene_id: string
  type: string
  data: Record<string, unknown>
  updated_at?: string
}

/** Rows of project_objects (or open_shared_project's objects) as layout items */
export function itemsOf(rows: readonly ObjectRow[]) {
  // through parseLayout like a file, so a bad row is dropped rather than breaking the scene
  return parseLayout(rows.map((r) => ({ ...r.data, id: r.id, t: r.type })))
}

/** Rows as items, each with its scene */
function sceneItemsOf(rows: readonly ObjectRow[]): SceneItem[] {
  const by = new Map<string, ObjectRow[]>()
  for (const r of rows) by.set(r.scene_id, [...(by.get(r.scene_id) ?? []), r])
  return [...by].flatMap(([scene, list]) => itemsOf(list).map((item) => ({ scene, item })))
}

/** Scene rows in order, each with its items from `rows` (items in no scene of these are left out) */
export function scenesOf(scenes: readonly SceneRow[], rows: readonly ObjectRow[]): Scene[] {
  const by = new Map<string, ObjectRow[]>(scenes.map((s) => [s.id, []]))
  for (const r of rows) by.get(r.scene_id)?.push(r)
  return scenes.map((s) => ({ id: s.id, name: s.name, items: itemsOf(by.get(s.id)!) }))
}

/** A project's scenes, in order, without their items */
export async function loadScenes(projectId: string): Promise<SceneRow[]> {
  return check(
    await db()
      .from('project_scenes')
      .select('id, name')
      .eq('project_id', projectId)
      .order('sort')
      .order('created_at'),
  ) as SceneRow[]
}

/**
 * A project without its items, if the signed-in person (`userId`) may open it, with their role
 * on it. Without `userId` the role isn't looked up (it reads as viewer).
 */
export async function loadMeta(
  id: string,
  userId?: string,
): Promise<Omit<LoadedProject, 'scenes'>> {
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

/** A project, its scenes and their items (see loadMeta) */
export async function loadProject(id: string, userId?: string): Promise<LoadedProject> {
  const [meta, scenes, rows] = await Promise.all([
    loadMeta(id, userId),
    loadScenes(id),
    db().from('project_objects').select('id, scene_id, type, data').eq('project_id', id),
  ])
  return { ...meta, scenes: scenesOf(scenes, check(rows) as ObjectRow[]) }
}

/**
 * Some of a project's items as they're saved now, by `refs` (refOf): through the share link
 * (`token`) for a guest, who can't read project_objects themselves. All of them with no `refs`.
 * Without a token, `versions` is given each row's updated_at, by ref.
 */
export async function loadItems(
  projectId: string,
  refs: readonly string[] | null,
  token?: string | null,
  versions?: Map<string, string>,
): Promise<SceneItem[]> {
  const versioned = (rows: ObjectRow[]) => {
    if (versions)
      for (const r of rows) if (r.updated_at) versions.set(refOf(r.scene_id, r.id), r.updated_at)
    return rows
  }
  const COLUMNS = 'id, scene_id, type, data, updated_at'
  if (!refs) {
    if (token) {
      const r = await loadShared(token)
      if (r.status !== 'ok') throw new CloudError('gone')
      return r.project.scenes.flatMap((s) => s.items.map((item) => ({ scene: s.id, item })))
    }
    return sceneItemsOf(
      versioned(
        check(
          await db().from('project_objects').select(COLUMNS).eq('project_id', projectId),
        ) as ObjectRow[],
      ),
    )
  }
  // by id (in whichever scenes), then just the ones asked for
  const want = new Set(refs)
  const ids = [...new Set(refs.map((r) => splitRef(r).id))]
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
              .select(COLUMNS)
              .eq('project_id', projectId)
              .in('id', batch),
          )) as ObjectRow[]),
    )
  }
  return sceneItemsOf(versioned(rows.filter((r) => want.has(refOf(r.scene_id, r.id)))))
}

/** When the project was last changed in any way (its items, name, settings or sharing) */
export async function loadUpdatedAt(projectId: string): Promise<string | null> {
  const row = check(
    await db().from('projects').select('updated_at').eq('id', projectId).maybeSingle(),
  ) as { updated_at: string } | null
  return row?.updated_at ?? null
}

/** Each of a project's items' updated_at, by ref: small, without the items themselves */
export async function loadVersions(projectId: string): Promise<Map<string, string>> {
  const rows = check(
    await db()
      .from('project_objects')
      .select('id, scene_id, updated_at')
      .eq('project_id', projectId),
  ) as { id: string; scene_id: string; updated_at: string }[]
  return new Map(rows.map((r) => [refOf(r.scene_id, r.id), r.updated_at]))
}

/**
 * A project's address, and its link: with the share token while sharing is on, so the address
 * bar can be copied and passed on as it is
 */
export function projectPath(id: string, shareToken?: string | null) {
  return shareToken ? `/project/${id}?share=${shareToken}` : `/project/${id}`
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
        scenes: SceneRow[]
        objects: ObjectRow[]
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
      scenes: scenesOf(r.scenes, r.objects),
      settings: settings ?? {},
    },
  }
}

/**
 * The project an old /share/:token link opens, when it lets this person in, for it to go to
 * the project's own link instead. Waits for the saved session first, so it asks as them.
 */
export async function sharedProjectId(token: string): Promise<string | null> {
  await db().auth.getSession()
  const r = await loadShared(token)
  return r.status === 'ok' ? r.project.meta.id : null
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
 * Write what changed: the scenes (every one, in order) when they changed, and those removed;
 * these items upserted, these refs removed; and the settings if given. Scenes go first, so the
 * items have theirs to go in. Returns the project's updated_at afterwards, as the database has it.
 */
export async function saveChanges(
  projectId: string,
  changes: {
    scenes?: readonly SceneRow[]
    removedScenes?: readonly string[]
    upserts: readonly SceneItem[]
    deletes: readonly string[]
    settings?: ProjectSettings
  },
): Promise<string> {
  if (changes.scenes?.length)
    check(await db().from('project_scenes').upsert(sceneRows(projectId, changes.scenes)))
  await upsertItems(projectId, changes.upserts)
  // a removed scene's items go with it
  const removed = new Set(changes.removedScenes)
  const byScene = new Map<string, string[]>()
  for (const ref of changes.deletes) {
    const { scene, id } = splitRef(ref)
    if (!removed.has(scene)) byScene.set(scene, [...(byScene.get(scene) ?? []), id])
  }
  for (const [scene, ids] of byScene)
    check(
      await db()
        .from('project_objects')
        .delete()
        .eq('project_id', projectId)
        .eq('scene_id', scene)
        .in('id', ids),
    )
  if (removed.size)
    check(
      await db()
        .from('project_scenes')
        .delete()
        .eq('project_id', projectId)
        .in('id', [...removed]),
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

/** A copy of a project under a new name, its scenes and all; returns the copy's id */
export async function duplicateProject(ownerId: string, id: string, name: string) {
  const { scenes, settings } = await loadProject(id)
  return createProject(ownerId, name, scenes, settings)
}
