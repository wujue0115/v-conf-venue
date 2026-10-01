-- Who may create cloud projects: the emails in public.allowed_creators. While it's empty, anyone
-- signed in may (as before); once it holds any email, only those may. Everyone else still opens
-- what's shared with them, and edits what they were added to as editors.
--
-- Add people in the Dashboard: Table Editor → allowed_creators → Insert row (an email; it's
-- stored trimmed and lowercase). The list isn't readable through the API (unlike app_settings,
-- which anyone can read): the app only asks may_create_projects() about the person signed in.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261004100000_quiet_link_visits.sql.

begin;

create table public.allowed_creators (
  email text primary key check (email = lower(trim(email)) and email <> ''),
  created_at timestamptz not null default now()
);

-- typed into the Table Editor any old way: kept trimmed and lowercase, as Google's are compared
create or replace function private.clean_creator_email() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.email := lower(trim(new.email)); return new; end $$;

create trigger clean_email before insert or update on public.allowed_creators
  for each row execute function private.clean_creator_email();

-- no policies: nobody reads or writes it through the API, only the Dashboard
alter table public.allowed_creators enable row level security;
revoke all on public.allowed_creators from anon, authenticated;

/** The signed-in person may create projects: the list is empty, or has their email */
create or replace function private.may_create() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    not exists (select 1 from public.allowed_creators)
    or exists (select 1 from public.allowed_creators c where c.email = private.my_email())
  )
$$;

revoke all on function private.clean_creator_email() from public, anon, authenticated;
revoke all on function private.may_create() from public, anon, authenticated;
grant execute on function private.may_create() to authenticated;

drop policy "create your own projects" on public.projects;
create policy "create your own projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.allowed('create')
    and private.below_project_limit()
    and private.may_create()
  );

/** For the app: whether the signed-in person may create projects (never who else may) */
create or replace function public.may_create_projects() returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.may_create() $$;

revoke all on function public.may_create_projects() from public;
grant execute on function public.may_create_projects() to authenticated;

commit;
