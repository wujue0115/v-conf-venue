-- Making a new share link now shuts out everyone who came in through the old one. Before, their
-- project_access rows kept via_link, so the old link's visitors kept what the link allowed (and
-- the project stayed in their list) though the link itself stopped working. People added by name
-- keep their role, and asks stay for the owner to answer; only "has the link" is forgotten.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261008100000_objects_by_broadcast.sql.

begin;

create or replace function private.forget_link_visitors() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.project_access a
  where a.project_id = new.id and a.via_link
    and a.role is null and a.requested_role is null;
  update public.project_access a set via_link = false
  where a.project_id = new.id and a.via_link;
  return null;
end
$$;

revoke all on function private.forget_link_visitors() from public, anon, authenticated;

create trigger forget_link_visitors after update on public.projects
  for each row
  when (old.share_token is distinct from new.share_token)
  execute function private.forget_link_visitors();

commit;
