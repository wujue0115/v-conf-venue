-- Access control: people added by email, asking for access, and sharing as the project's one switch.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261001100000_sharing_rpcs.sql.
--
-- project_access goes from one `status` to three independent parts of the same row:
--   role            what the owner granted: 'viewer', 'editor', or null (nothing by name)
--   requested_role  what this person asked the owner for, or null; may sit beside a role
--                   (an approved viewer asking to edit keeps viewing while waiting)
--   via_link        signed in and opened the share link
-- A row holds at least one of them; denying a request on a row with nothing else deletes it.
--
-- share_enabled is now the whole project's switch: off, only the owner can open it, people
-- added by name included. Their rows stay, and count again once it's back on.

begin;

-- ─── project_access: role / requested_role / via_link ────────────────────────

alter table public.project_access
  add column requested_role text check (requested_role in ('viewer', 'editor')),
  add column requested_at timestamptz,
  add column via_link boolean not null default false;

-- every 'pending' and 'link' row came through the share link
update public.project_access set via_link = true where status in ('pending', 'link');
update public.project_access
  set requested_role = role, requested_at = created_at
  where status = 'pending';

alter table public.project_access alter column role drop not null;
update public.project_access set role = null where status in ('pending', 'link');
alter table public.project_access drop column status;

-- one row per person: emails are kept lowercase, as Google's (private.my_email) is compared
update public.project_access set email = lower(trim(email));
alter table public.project_access
  add constraint project_access_email_lower check (email = lower(email) and email <> ''),
  add constraint project_access_not_empty
    check (role is not null or requested_role is not null or via_link);

-- ─── Who may do what ─────────────────────────────────────────────────────────

/** 'owner', 'editor', 'viewer', or null — for the signed-in user; guests always get null */
create or replace function private.access_role(p_project uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when p.owner_id = auth.uid() then 'owner'
    -- sharing off: nobody but the owner
    when not p.share_enabled then null
    when a.role = 'editor' or (a.via_link and p.edit_access = 'authenticated') then 'editor'
    when a.role = 'viewer' or (a.via_link and p.view_access <> 'allowed') then 'viewer'
  end
  from public.projects p
  left join public.project_access a
    on a.project_id = p.id and a.email = private.my_email()
  where p.id = p_project and auth.uid() is not null
$$;

-- the owner never adds themselves: they have everything already
drop policy "owners add people" on public.project_access;
create policy "owners add people" on public.project_access
  for insert to authenticated
  with check (
    private.is_owner(project_id) and private.allowed('update')
    and email <> (select private.my_email())
  );
drop policy "owners approve and change access" on public.project_access;
create policy "owners approve and change access" on public.project_access
  for update to authenticated
  using (private.is_owner(project_id))
  with check (
    private.is_owner(project_id) and private.allowed('update')
    and email <> (select private.my_email())
  );
drop policy "owners and the person themselves read access" on public.project_access;
create policy "owners and the person themselves read access" on public.project_access
  for select to authenticated
  using (private.is_owner(project_id) or email = (select private.my_email()));
drop policy "owners remove people, people leave" on public.project_access;
create policy "owners remove people, people leave" on public.project_access
  for delete to authenticated
  using (private.is_owner(project_id) or email = (select private.my_email()));

-- ─── Share link RPCs ─────────────────────────────────────────────────────────

/**
 * What /share/:token shows; a link with sharing off is 'not_found'.
 * Returns { status: 'ok', role, requested_role, project, objects }, or { status } of
 * 'not_found', 'sign_in_required' or 'no_access' (with `requested`: true once access was asked for).
 */
create or replace function public.open_shared_project(p_token uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.projects;
  me text := private.my_email();
  r text;
  asked text;
begin
  select * into p from public.projects where share_token = p_token and share_enabled;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- remember that this signed-in person has the link, when the link grants something
  if me is not null and p.owner_id <> auth.uid()
    and (p.view_access <> 'allowed' or p.edit_access = 'authenticated') then
    insert into public.project_access (project_id, email, via_link)
    values (p.id, me, true)
    on conflict (project_id, email) do update set via_link = true;
  end if;

  select a.requested_role into asked
  from public.project_access a where a.project_id = p.id and a.email = me;

  r := coalesce(private.access_role(p.id), case when p.view_access = 'anyone' then 'viewer' end);
  if r is null then
    return jsonb_build_object(
      'status', case when auth.uid() is null then 'sign_in_required' else 'no_access' end,
      'requested', asked is not null
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'role', r,
    'requested_role', asked,
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'share_enabled', p.share_enabled,
      'view_access', p.view_access,
      'edit_access', p.edit_access,
      'settings', p.settings,
      'updated_at', p.updated_at
    ),
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'type', o.type, 'data', o.data))
      from public.project_objects o where o.project_id = p.id
    ), '[]'::jsonb)
  );
end
$$;

drop function public.request_access(uuid, text);

/**
 * Ask the owner for access: through the share link (`p_token`), or (`p_project`) on a project
 * this person can already view, to edit it. Asking again replaces the earlier ask.
 * Returns 'requested', or 'already' when they have that much (or more) already.
 */
create or replace function public.request_access(
  p_role text default 'editor',
  p_token uuid default null,
  p_project uuid default null
) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.projects;
  me text := private.my_email();
  r text;
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if not private.allowed('update') then
    raise exception 'cloud_paused' using errcode = '55000';
  end if;
  if p_token is not null then
    select * into p from public.projects where share_token = p_token and share_enabled;
  else
    select * into p from public.projects
    where id = p_project and private.access_role(id) is not null;
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  r := private.access_role(p.id);
  if r in ('owner', 'editor') or (r = 'viewer' and p_role = 'viewer') then
    return 'already';
  end if;

  -- asking through the link shows they hold it: remember that too
  insert into public.project_access (project_id, email, requested_role, requested_at, via_link)
  values (p.id, me, p_role, now(), p_token is not null)
  on conflict (project_id, email) do update
    set requested_role = excluded.requested_role,
      requested_at = now(),
      via_link = public.project_access.via_link or excluded.via_link;
  return 'requested';
end
$$;

revoke all on function public.request_access(text, uuid, uuid) from public;
grant execute on function public.request_access(text, uuid, uuid) to authenticated;

commit;
