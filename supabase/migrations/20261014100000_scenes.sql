-- Scenes: a project holds several layouts of its own (one for each part of the day, say), picked
-- in the planner. Each scene is a project_scenes row; each placed item is in one scene, and an
-- item copied into another scene keeps its id there, so an item is now (project, scene, id).
-- Run as a whole in the Supabase Dashboard → SQL Editor, after
-- 20261009100000_new_link_forgets_visitors.sql, before the app that saves scenes is deployed.
--
-- Every project's items so far become its first scene. Until the app is deployed, what it saves
-- goes into a project's first scene (made when there's none), so it keeps working meanwhile.
--
-- What the database sends on a project's channel, besides 20261003100000_realtime.sql's
--   scenes    {}  a scene added, renamed, moved or removed  → read the scenes again

begin;

-- ─── project_scenes ──────────────────────────────────────────────────────────

-- `id` comes from the planner (a scene made in the browser keeps its id in the cloud)
create table public.project_scenes (
  project_id uuid not null references public.projects (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  -- '' shows as "Scene n", n its place in the order
  name text not null default '',
  -- the order they're shown in, lowest first
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

-- each project's items so far are its first scene
insert into public.project_scenes (project_id) select id from public.projects;

alter table public.project_objects add column scene_id uuid;
update public.project_objects o set scene_id = s.id
from public.project_scenes s where s.project_id = o.project_id;
alter table public.project_objects alter column scene_id set not null;
alter table public.project_objects drop constraint project_objects_pkey;
alter table public.project_objects add primary key (project_id, scene_id, id);
alter table public.project_objects add constraint project_objects_scene_fkey
  foreign key (project_id, scene_id) references public.project_scenes (project_id, id)
  on delete cascade;

/**
 * An item saved without a scene (by the app from before scenes) goes into its project's first
 * scene, made when it has none
 */
create or replace function private.object_scene() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.scene_id is null then
    select s.id into new.scene_id from public.project_scenes s
    where s.project_id = new.project_id
    order by s.sort, s.created_at
    limit 1;
    if new.scene_id is null then
      insert into public.project_scenes (project_id) values (new.project_id)
      returning id into new.scene_id;
    end if;
  end if;
  return new;
end
$$;

revoke all on function private.object_scene() from public, anon, authenticated;

create trigger fill_scene before insert on public.project_objects
  for each row execute function private.object_scene();

-- ─── Changes: updated_at, the project moved up, word on its channel ──────────

create trigger set_updated_at before update on public.project_scenes
  for each row execute function private.set_updated_at();

create trigger touch_on_insert after insert on public.project_scenes
  referencing new table as changed for each statement execute function private.touch_projects();
create trigger touch_on_update after update on public.project_scenes
  referencing new table as changed for each statement execute function private.touch_projects();
create trigger touch_on_delete after delete on public.project_scenes
  referencing old table as changed for each statement execute function private.touch_projects();

-- the scenes changed: everyone reads them again (one message per project per statement)
create or replace function private.notify_scenes() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p uuid;
begin
  for p in select distinct c.project_id from changed c loop
    perform private.notify_project(p, 'scenes', '{}'::jsonb);
  end loop;
  return null;
end
$$;

revoke all on function private.notify_scenes() from public, anon, authenticated;

create trigger notify_on_insert after insert on public.project_scenes
  referencing new table as changed for each statement execute function private.notify_scenes();
create trigger notify_on_update after update on public.project_scenes
  referencing new table as changed for each statement execute function private.notify_scenes();
create trigger notify_on_delete after delete on public.project_scenes
  referencing old table as changed for each statement execute function private.notify_scenes();

-- ─── Row level security: as for the items ────────────────────────────────────

grant select, insert, update, delete on public.project_scenes to authenticated;
alter table public.project_scenes enable row level security;

create policy "read the scenes of projects you can open" on public.project_scenes
  for select to authenticated
  using (private.access_role(project_id) is not null);
create policy "editors add scenes" on public.project_scenes
  for insert to authenticated
  with check (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));
create policy "editors change scenes" on public.project_scenes
  for update to authenticated
  using (private.access_role(project_id) in ('owner', 'editor'))
  with check (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));
create policy "editors remove scenes" on public.project_scenes
  for delete to authenticated
  using (private.access_role(project_id) in ('owner', 'editor') and private.allowed('update'));

-- ─── Guests: the scenes, and each item's scene ───────────────────────────────

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
    on conflict (project_id, email) do update set via_link = true
      -- already known to have the link: nothing changes, so nobody is told access changed
      where not public.project_access.via_link;
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
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.sort, s.created_at)
      from public.project_scenes s where s.project_id = p.id
    ), '[]'::jsonb),
    'objects', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'scene_id', o.scene_id, 'type', o.type, 'data', o.data)
      )
      from public.project_objects o where o.project_id = p.id
    ), '[]'::jsonb)
  );
end
$$;

commit;

/**
 * Some of a shared project's items, through its share link, for guests (signed-in people read
 * project_objects themselves): those with these ids, in any scene, each with its scene. Empty
 * when the link doesn't let them view.
 */
create or replace function public.shared_objects(p_token uuid, p_ids uuid[]) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', o.id, 'scene_id', o.scene_id, 'type', o.type, 'data', o.data)
  ), '[]')
  from public.projects p
  join public.project_objects o on o.project_id = p.id
  where p.share_token = p_token and p.share_enabled
    and (p.view_access = 'anyone' or private.access_role(p.id) is not null)
    and o.id = any (p_ids)
$$;

commit;
