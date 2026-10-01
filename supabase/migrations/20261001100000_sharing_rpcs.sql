-- What the planner needs for sharing, beyond the initial tables:
--   project_role(id)              which role the signed-in person has on a project, so a project
--                                 opened by its id (not through the share link) knows whether
--                                 they may edit it
--   set_project_settings(id, s)   saving the layout file's other parts (pricing, colour rows):
--                                 editors may, though only owners may update `projects` itself
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20260930110000_initial_tables.sql.

begin;

/** 'owner', 'editor', 'viewer', or null when the signed-in person can't open it */
create or replace function public.project_role(p_project uuid) returns text
language sql stable security definer
set search_path = ''
as $$ select private.access_role(p_project) $$;

/** Replace a project's settings, for its owner or an editor; returns its updated_at */
create or replace function public.set_project_settings(p_project uuid, p_settings jsonb)
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  t timestamptz;
begin
  if coalesce(private.access_role(p_project), '') not in ('owner', 'editor') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.allowed('update') then
    raise exception 'cloud_paused' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'invalid_settings' using errcode = '22023';
  end if;
  update public.projects set settings = p_settings where id = p_project
  returning updated_at into t;
  return t;
end
$$;

revoke all on function public.project_role(uuid) from public;
revoke all on function public.set_project_settings(uuid, jsonb) from public;
grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.set_project_settings(uuid, jsonb) to authenticated;

commit;
