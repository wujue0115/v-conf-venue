-- Opening a share link again no longer rewrites the opener's project_access row when it already
-- says they have the link. Before, every visit by someone signed in updated the row, which sent
-- an 'access' message on the project's channel to everyone with it open.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261003100000_realtime.sql.

begin;

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
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'type', o.type, 'data', o.data))
      from public.project_objects o where o.project_id = p.id
    ), '[]'::jsonb)
  );
end
$$;

commit;
