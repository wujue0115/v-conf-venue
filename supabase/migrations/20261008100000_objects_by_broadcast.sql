-- Saved items are no longer announced by the database. Its 'objects' message went to everyone on
-- the project's channel, the person saving included, even with nobody else there, and once per
-- statement (an upsert batch, a delete). The editor that saved now broadcasts the ids itself, in
-- one message, only when someone else has the project open (the channel's policies already let
-- owners and editors broadcast). A change made outside the app, in the Table Editor say, then
-- shows to people with the project open when they next reload or reconnect.
-- Run as a whole in the Supabase Dashboard → SQL Editor, after 20261003100000_realtime.sql, once
-- the app that broadcasts 'objects' is deployed (until then, others would miss saves).

begin;

drop trigger if exists notify_on_insert on public.project_objects;
drop trigger if exists notify_on_update on public.project_objects;
drop trigger if exists notify_on_delete on public.project_objects;
drop function if exists private.notify_objects();

commit;
