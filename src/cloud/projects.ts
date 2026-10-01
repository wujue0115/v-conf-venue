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

export interface ProjectMeta {
  id: string
  name: string
  owner_id: string
  updated_at: string
}

/** A row in My Projects */
export interface ProjectSummary extends ProjectMeta {
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
  /** the project was deleted while open */
  | 'gone'
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

function db() {
  if (!supabase) throw new CloudError('unavailable')
  return supabase
}

type ApiError = { code?: string; message?: string } | null

/** What kind of failure an API response is, from its status and Postgres / PostgREST code */
function classify(error: NonNullable<ApiError>, status: number): CloudErrorCode {
  // fetch itself failed (offline, DNS, CORS): supabase-js reports it with no status
  if (!status || /fetch|network|load failed/i.test(error.message ?? '')) return 'network'
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return 'auth'
  if (status >= 500 || status === 408 || status === 429) return 'server'
  if (error.code === '42501') return 'denied'
  // a row's project no longer exists
  if (error.code === '23503') return 'gone'
  return 'failed'
}

/** A response's data, or its error thrown as a CloudError */
function check<T>(r: { data: T; error: ApiError; status: number }): T {
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
      .select('id, name, owner_id, updated_at, project_objects(count)')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  ) as (ProjectMeta & { project_objects: { count: number }[] })[]
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

/** A project and its items, if the signed-in person may open it */
export async function loadProject(
  id: string,
): Promise<{ meta: ProjectMeta; items: LayoutItem[]; settings: ProjectSettings }> {
  const project = check(
    await db()
      .from('projects')
      .select('id, name, owner_id, updated_at, settings')
      .eq('id', id)
      .maybeSingle(),
  ) as (ProjectMeta & { settings: ProjectSettings }) | null
  if (!project) throw new CloudError('not_found')
  const rows = check(
    await db().from('project_objects').select('id, type, data').eq('project_id', id),
  ) as { id: string; type: string; data: Record<string, unknown> }[]
  // through parseLayout like a file, so a bad row is dropped rather than breaking the scene
  const items = parseLayout(rows.map((r) => ({ ...r.data, id: r.id, t: r.type })))
  const { settings, ...meta } = project
  return { meta, items, settings: settings ?? {} }
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
  if (changes.settings)
    check(await db().from('projects').update({ settings: changes.settings }).eq('id', projectId))
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
