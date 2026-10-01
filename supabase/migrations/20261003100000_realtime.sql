-- Realtime: one private channel per project, `project:<id>`, for who's online (presence), items
-- moving while someone drags them (broadcast), and word from the database when something saved
-- changed. Run as a whole in the Supabase Dashboard → SQL Editor, after
-- 20261002100000_access_control.sql.
--
-- Who may use a project's channel (row level security on realtime.messages)
--   listen     anyone who can open the project; guests too, while it's shared with 'anyone'
--   presence   signed-in people who can open it (viewers show as online too)
--   broadcast  its owner and editors
--
-- What the database sends on it (realtime.send, only the ids: rows can hold large poster images)
--   objects   { changed: [ids] } or { deleted: [ids] }    → fetch those rows again
--   project   {}  its name, settings or sharing changed     → read the project again
--   access    {}  someone's access changed                 → check your own role again
--   deleted   {}  the project is gone
-- None of them carry who changed what, or anyone's email: guests may be listening.

begin;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

/** The project a channel topic is for: 'project:<uuid>', else null */
create or replace function private.topic_project(p_topic text) returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 9)::uuid
  end
$$;

/** Shared with anyone who has the link: guests may watch it */
create or replace function private.open_to_anyone(p_project uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project and p.share_enabled and p.view_access = 'anyone'
  )
$$;

/** app_settings 'cloud' has realtime on */
create or replace function private.realtime_on() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select (s.value ->> 'enabled')::boolean and (s.value ->> 'allowRealtime')::boolean
    from public.app_settings s where s.key = 'cloud'
  ), false)
$$;

/** Tell a project's channel something changed; never lets a failure here undo the change */
create or replace function private.notify_project(p_project uuid, p_event text, p_payload jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.realtime_on() then
    return;
  end if;
  perform realtime.send(p_payload, p_event, 'project:' || p_project::text, true);
exception when others then
  raise warning 'notify_project(%, %) failed: %', p_project, p_event, sqlerrm;
end
$$;

revoke all on function private.topic_project(text) from public, anon, authenticated;
revoke all on function private.open_to_anyone(uuid) from public, anon, authenticated;
revoke all on function private.realtime_on() from public, anon, authenticated;
revoke all on function private.notify_project(uuid, text, jsonb) from public, anon, authenticated;
-- the channel policies below call these as the person listening
grant usage on schema private to anon;
grant execute on function private.topic_project(text) to anon, authenticated;
grant execute on function private.open_to_anyone(uuid) to anon, authenticated;

-- ─── Who may use a project's channel ─────────────────────────────────────────

create policy "listen to projects you can open" on realtime.messages
  for select to authenticated
  using (private.access_role(private.topic_project((select realtime.topic()))) is not null);
create policy "guests listen to projects open to anyone" on realtime.messages
  for select to anon
  using (private.open_to_anyone(private.topic_project((select realtime.topic()))));
create policy "show yourself online, and editors broadcast" on realtime.messages
  for insert to authenticated
  with check (
    case realtime.messages.extension
      when 'presence' then
        private.access_role(private.topic_project((select realtime.topic()))) is not null
      when 'broadcast' then
        private.access_role(private.topic_project((select realtime.topic()))) in ('owner', 'editor')
      else false
    end
  );

-- ─── What the database sends ─────────────────────────────────────────────────

-- items saved: the ids, per project, one message per statement
create or replace function private.notify_objects() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.project_id, jsonb_agg(c.id) as ids from changed c group by c.project_id
  loop
    perform private.notify_project(
      r.project_id,
      'objects',
      jsonb_build_object(case when tg_op = 'DELETE' then 'deleted' else 'changed' end, r.ids)
    );
  end loop;
  return null;
end
$$;

create trigger notify_on_insert after insert on public.project_objects
  referencing new table as changed for each statement execute function private.notify_objects();
create trigger notify_on_update after update on public.project_objects
  referencing new table as changed for each statement execute function private.notify_objects();
create trigger notify_on_delete after delete on public.project_objects
  referencing old table as changed for each statement execute function private.notify_objects();

-- the project's name, settings or sharing (not updated_at, which every save moves)
create or replace function private.notify_project_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.notify_project(old.id, 'deleted', '{}'::jsonb);
  else
    perform private.notify_project(new.id, 'project', '{}'::jsonb);
  end if;
  return null;
end
$$;

create trigger notify_on_change after update on public.projects
  for each row
  when (
    old.name is distinct from new.name
    or old.settings is distinct from new.settings
    or old.share_enabled is distinct from new.share_enabled
    or old.share_token is distinct from new.share_token
    or old.view_access is distinct from new.view_access
    or old.edit_access is distinct from new.edit_access
  )
  execute function private.notify_project_row();
create trigger notify_on_delete after delete on public.projects
  for each row execute function private.notify_project_row();

-- someone's access: everyone checks their own (the message doesn't say whose)
create or replace function private.notify_access() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p uuid;
begin
  for p in select distinct c.project_id from changed c loop
    perform private.notify_project(p, 'access', '{}'::jsonb);
  end loop;
  return null;
end
$$;

create trigger notify_on_insert after insert on public.project_access
  referencing new table as changed for each statement execute function private.notify_access();
create trigger notify_on_update after update on public.project_access
  referencing new table as changed for each statement execute function private.notify_access();
create trigger notify_on_delete after delete on public.project_access
  referencing old table as changed for each statement execute function private.notify_access();

-- ─── Guests fetching what changed ────────────────────────────────────────────

/**
 * Some of a shared project's items, through its share link, for guests (signed-in people read
 * project_objects themselves). Empty when the link doesn't let them view.
 */
create or replace function public.shared_objects(p_token uuid, p_ids uuid[]) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'type', o.type, 'data', o.data)), '[]')
  from public.projects p
  join public.project_objects o on o.project_id = p.id
  where p.share_token = p_token and p.share_enabled
    and (p.view_access = 'anyone' or private.access_role(p.id) is not null)
    and o.id = any (p_ids)
$$;

revoke all on function public.shared_objects(uuid, uuid[]) from public;
grant execute on function public.shared_objects(uuid, uuid[]) to anon, authenticated;

commit;
