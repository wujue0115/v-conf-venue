import { check, CloudError, db, type Grant, type ProjectSummary, type Role } from './projects'

/*
 * Who may open a project besides its owner: `project_access`, one row per email, holding what
 * the owner granted (`role`), what the person asked for (`requested_role`) and whether they
 * opened the share link signed in (`via_link`). Only the owner sees every row; anyone else sees
 * just their own.
 */

export interface AccessEntry {
  id: string
  email: string
  /** Granted by the owner; null: nothing by name */
  role: Grant | null
  /** Asked for and waiting on the owner */
  requested_role: Grant | null
  requested_at: string | null
  /** Opened the share link while signed in */
  via_link: boolean
  created_at: string
}

/** Emails are kept as Google gives them back to the database: trimmed, lowercase */
export const cleanEmail = (s: string) => s.trim().toLowerCase()
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

const COLUMNS = 'id, email, role, requested_role, requested_at, via_link, created_at'

/** Everyone with a row on the project, for its owner */
export async function listAccess(projectId: string): Promise<AccessEntry[]> {
  return check(
    await db()
      .from('project_access')
      .select(COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ) as AccessEntry[]
}

/** How many are waiting on the owner */
export async function countRequests(projectId: string): Promise<number> {
  const r = await db()
    .from('project_access')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .not('requested_role', 'is', null)
  check(r)
  return r.count ?? 0
}

/** Granting `role` answers an ask for no more than it; a viewer asking to edit keeps asking */
const answers = (role: Grant, asked: Grant | null | undefined) =>
  role === 'editor' || asked !== 'editor'
const ANSWERED = { requested_role: null, requested_at: null }

/**
 * Grant someone a role by email. Someone who already has a row (`existing`: opened the link,
 * asked) keeps it, now with this role.
 */
export async function addPerson(
  projectId: string,
  email: string,
  role: Grant,
  existing?: Pick<AccessEntry, 'requested_role'> | null,
) {
  check(
    await db()
      .from('project_access')
      .upsert(
        {
          project_id: projectId,
          email: cleanEmail(email),
          role,
          ...(answers(role, existing?.requested_role) ? ANSWERED : {}),
        },
        { onConflict: 'project_id,email' },
      ),
  )
}

/** Change what someone added by name may do */
export async function setRole(entry: AccessEntry, role: Grant) {
  check(
    await db()
      .from('project_access')
      .update({ role, ...(answers(role, entry.requested_role) ? ANSWERED : {}) })
      .eq('id', entry.id),
  )
}

/** Give them what they asked for */
export async function approve(entry: AccessEntry) {
  if (!entry.requested_role) return
  check(
    await db()
      .from('project_access')
      .update({ role: entry.requested_role, ...ANSWERED })
      .eq('id', entry.id),
  )
}

/** Turn the ask down; a row with nothing else on it goes */
export async function deny(entry: AccessEntry) {
  if (!entry.role && !entry.via_link) return removeAccess(entry)
  check(await db().from('project_access').update(ANSWERED).eq('id', entry.id))
}

/** Take the row away: what they were granted, their ask, and that they had the link */
export async function removeAccess(entry: Pick<AccessEntry, 'id'>) {
  check(await db().from('project_access').delete().eq('id', entry.id))
}

/**
 * Whether this person has asked for access to a project they can't open (row level security
 * shows them their own access row even so)
 */
export async function hasAsked(projectId: string): Promise<boolean> {
  const mine = check(
    await db()
      .from('project_access')
      .select('requested_role')
      .eq('project_id', projectId)
      .maybeSingle(),
  ) as { requested_role: Grant | null } | null
  return !!mine?.requested_role
}

/**
 * Ask the owner for a role: through a share link (`token`), or by the project's id
 * (`projectId`): while its sharing is on, or to edit one already open to them. 'already' when
 * they turn out to have it.
 */
export async function requestAccess(
  role: Grant,
  where: { token: string } | { projectId: string },
): Promise<'requested' | 'already'> {
  const r = await db().rpc('request_access', {
    p_role: role,
    ...('token' in where ? { p_token: where.token } : { p_project: where.projectId }),
  })
  const message = r.error?.message ?? ''
  if (message.includes('not_found')) throw new CloudError('not_found', r.error)
  if (message.includes('cloud_paused')) throw new CloudError('paused', r.error)
  if (message.includes('sign_in_required')) throw new CloudError('signed_out', r.error)
  return check(r) as 'requested' | 'already'
}

/** A row in Shared with me */
export interface SharedSummary extends ProjectSummary {
  role: Exclude<Role, 'owner'>
}

/**
 * Projects other people added this person to by name. Row level security hides any whose
 * sharing is off, and shows them only their own access row.
 */
export async function listSharedWithMe(userId: string): Promise<SharedSummary[]> {
  const rows = check(
    await db()
      .from('projects')
      .select('id, name, updated_at, project_objects(count), project_access!inner(role)')
      .neq('owner_id', userId)
      .not('project_access.role', 'is', null)
      .order('updated_at', { ascending: false }),
  ) as (Omit<ProjectSummary, 'count'> & {
    project_objects: { count: number }[]
    project_access: { role: Grant }[]
  })[]
  return rows.map(({ project_objects, project_access, ...p }) => ({
    ...p,
    count: project_objects[0]?.count ?? 0,
    role: project_access[0]?.role ?? 'viewer',
  }))
}
