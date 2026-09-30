-- v-conf-venue cloud: projects, their placed objects, who may open them, and the app's settings,
-- with row level security and the share link.
-- Run as a whole in the Supabase Dashboard → SQL Editor, on a database without these tables.
--
-- Who may do what
--   owner   everything; the only one who changes sharing and people.
--   editor  approved as editor, or signed in with the link while edit_access = 'authenticated'.
--   viewer  approved, or signed in with the link while view_access isn't 'allowed'.
--           Guests see an 'anyone' project through open_shared_project() only.
-- "With the link" = a project_access row for your email, of any status: opening the link while
-- signed in adds one with status 'link'. share_enabled off: the link opens and grants nothing;
-- approved people keep their access.

begin;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  share_token uuid not null default gen_random_uuid() unique,
  share_enabled boolean not null default false,
  view_access text not null default 'anyone'
    check (view_access in ('anyone', 'authenticated', 'allowed')),
  edit_access text not null default 'allowed'
    check (edit_access in ('authenticated', 'allowed')),
  -- the layout file's other parts: { pricing: { priceMode, slots }, palettes: {...} }
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `id` is LayoutItem.id, from the file, so the same layout can live in two projects
create table public.project_objects (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

-- status 'link': signed in and opened the share link, nothing granted by name
create table public.project_access (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer', 'editor')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'link')),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

-- readable by everyone: keep secrets out of it
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- change these in the Dashboard (Table Editor → app_settings)
insert into public.app_settings (key, value) values (
  'cloud',
  '{"enabled": true, "allowCreate": true, "allowUpdate": true, "allowRealtime": true, "maxProjectsPerUser": 20}'
);

-- ─── Helpers (security definer: they read past RLS, so policies don't recurse) ─

create schema private;
grant usage on schema private to authenticated;

create or replace function private.my_email() returns text
language sql stable
set search_path = ''
as $$ select lower(nullif(auth.jwt() ->> 'email', '')) $$;

/** app_settings 'cloud' allows it now: 'create' a project, or 'update' anything */
create or replace function private.allowed(action text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select (s.value ->> 'enabled')::boolean
      and case action
        when 'create' then (s.value ->> 'allowCreate')::boolean
        else (s.value ->> 'allowUpdate')::boolean
      end
    from public.app_settings s where s.key = 'cloud'
  ), false)
$$;

/** Below app_settings 'cloud'.maxProjectsPerUser; no limit while it isn't a number */
create or replace function private.below_project_limit() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select (select count(*) from public.projects p where p.owner_id = auth.uid())
      < (s.value ->> 'maxProjectsPerUser')::numeric
    from public.app_settings s
    where s.key = 'cloud' and jsonb_typeof(s.value -> 'maxProjectsPerUser') = 'number'
  ), true)
$$;

create or replace function private.is_owner(p_project uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p where p.id = p_project and p.owner_id = auth.uid()
  )
$$;

/** 'owner', 'editor', 'viewer', or null — for the signed-in user; guests always get null */
create or replace function private.access_role(p_project uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when p.owner_id = auth.uid() then 'owner'
    when (a.status = 'approved' and a.role = 'editor')
      or (a.id is not null and p.share_enabled and p.edit_access = 'authenticated') then 'editor'
    when a.status = 'approved'
      or (a.id is not null and p.share_enabled and p.view_access <> 'allowed') then 'viewer'
  end
  from public.projects p
  left join public.project_access a
    on a.project_id = p.id and lower(a.email) = private.my_email()
  where p.id = p_project and auth.uid() is not null
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ─── updated_at ──────────────────────────────────────────────────────────────

create or replace function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.project_objects
  for each row execute function private.set_updated_at();

-- An editor's change moves the project up in My Projects (editors can't update projects themselves)
create or replace function private.touch_projects() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.projects set updated_at = now()
  where id in (select distinct c.project_id from changed c);
  return null;
end
$$;

create trigger touch_on_insert after insert on public.project_objects
  referencing new table as changed for each statement execute function private.touch_projects();
create trigger touch_on_update after update on public.project_objects
  referencing new table as changed for each statement execute function private.touch_projects();
create trigger touch_on_delete after delete on public.project_objects
  referencing old table as changed for each statement execute function private.touch_projects();

-- ─── Row level security ──────────────────────────────────────────────────────

-- New Supabase projects don't grant tables to the API roles by themselves; RLS below narrows these.
-- Guests get the settings only; everything else about a project goes through open_shared_project().
grant select on public.app_settings to anon, authenticated;
grant select, insert, update, delete
  on public.projects, public.project_objects, public.project_access to authenticated;

alter table public.app_settings enable row level security;
alter table public.projects enable row level security;
alter table public.project_objects enable row level security;
alter table public.project_access enable row level security;

-- readable by everyone: keep secrets out of app_settings
create policy "anyone reads the settings" on public.app_settings
  for select to anon, authenticated using (true);

create policy "read projects you can open" on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.access_role(id) is not null);
create policy "create your own projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and private.allowed('create') and private.below_project_limit()
  );
create policy "owners change their projects" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and private.allowed('update'));
create policy "owners delete their projects" on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()) and private.allowed('update'));

create policy "read the objects of projects you can open" on public.project_objects
  for select to authenticated
  using (private.access_role(project_id) is not null);
create policy "editors add objects" on public.project_objects
  for insert to authenticated
  with check (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));
create policy "editors change objects" on public.project_objects
  for update to authenticated
  using (private.access_role(project_id) in ('owner', 'editor'))
  with check (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));
create policy "editors remove objects" on public.project_objects
  for delete to authenticated
  using (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));

create policy "owners and the person themselves read access" on public.project_access
  for select to authenticated
  using (private.is_owner(project_id) or lower(email) = (select private.my_email()));
create policy "owners add people" on public.project_access
  for insert to authenticated
  with check (private.is_owner(project_id) and private.allowed('update'));
create policy "owners approve and change access" on public.project_access
  for update to authenticated
  using (private.is_owner(project_id))
  with check (private.is_owner(project_id) and private.allowed('update'));
-- denying a request deletes it too
create policy "owners remove people, people leave" on public.project_access
  for delete to authenticated
  using (private.is_owner(project_id) or lower(email) = (select private.my_email()));

-- ─── Share link RPCs ─────────────────────────────────────────────────────────

/**
 * What /share/:token shows; a link with sharing off is 'not_found'.
 * Returns { status: 'ok', role, project, objects }, or { status } of 'not_found',
 * 'sign_in_required' or 'no_access' (with `requested`: true once access was asked for).
 */
create or replace function public.open_shared_project(p_token uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.projects;
  me text := private.my_email();
  r text;
begin
  select * into p from public.projects where share_token = p_token and share_enabled;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- remember that this signed-in person has the link, when the link grants something
  if me is not null and p.owner_id <> auth.uid()
    and (p.view_access <> 'allowed' or p.edit_access = 'authenticated') then
    insert into public.project_access (project_id, email, role, status)
    values (p.id, me, 'viewer', 'link')
    on conflict (project_id, email) do nothing;
  end if;

  r := coalesce(private.access_role(p.id), case when p.view_access = 'anyone' then 'viewer' end);
  if r is null then
    return jsonb_build_object(
      'status', case when auth.uid() is null then 'sign_in_required' else 'no_access' end,
      'requested', exists (
        select 1 from public.project_access a
        where a.project_id = p.id and lower(a.email) = me and a.status = 'pending'
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'role', r,
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

/**
 * Ask the owner for access through the share link (a pending row). Anyone already approved
 * asks the owner in person instead: an approved viewer who wants to edit gets 'already_approved'.
 */
create or replace function public.request_access(p_token uuid, p_role text default 'editor')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.projects;
  me text := private.my_email();
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if not private.allowed('update') then
    raise exception 'cloud_paused' using errcode = '55000';
  end if;
  select * into p from public.projects where share_token = p_token and share_enabled;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.owner_id = auth.uid() or exists (
    select 1 from public.project_access a
    where a.project_id = p.id and lower(a.email) = me and a.status = 'approved'
  ) then
    raise exception 'already_approved' using errcode = '23505';
  end if;

  insert into public.project_access (project_id, email, role, status)
  values (p.id, me, p_role, 'pending')
  on conflict (project_id, email) do update set role = excluded.role, status = 'pending';
end
$$;

revoke all on function public.open_shared_project(uuid) from public;
revoke all on function public.request_access(uuid, text) from public;
grant execute on function public.open_shared_project(uuid) to anon, authenticated;
grant execute on function public.request_access(uuid, text) to authenticated;

commit;
