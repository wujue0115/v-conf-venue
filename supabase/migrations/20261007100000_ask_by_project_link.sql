-- The project's own address is now its link (/project/:id, with ?share=<token> while sharing is
-- on). Someone signed in who opens it without the token and can't see the project may now ask
-- the owner for access through the id, as they could through the share link: while sharing is
-- on. Before, asking by id was only for people already viewing, to edit.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261006100000_allowed_creators.sql.

begin;

/**
 * Ask the owner for access: through the share link (`p_token`), or by the project's id
 * (`p_project`) while its sharing is on or to someone who can view it already. Asking again
 * replaces the earlier ask.
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
    where id = p_project and (share_enabled or private.access_role(id) is not null);
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

commit;
