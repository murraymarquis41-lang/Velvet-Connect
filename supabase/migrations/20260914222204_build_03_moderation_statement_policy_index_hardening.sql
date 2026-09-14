-- Build 03 follow-up: cover the moderation case statement author foreign key
-- and consolidate equivalent permissive SELECT policies without changing
-- their authorization semantics.

create index if not exists moderation_case_statements_author_id_idx
  on public.moderation_case_statements (author_id);

drop policy if exists "Members view their own case statements"
  on public.moderation_case_statements;

drop policy if exists "Moderators view case statements"
  on public.moderation_case_statements;

create policy "Members or moderators view case statements"
on public.moderation_case_statements
for select to authenticated
using (
  author_id = (select auth.uid())
  or private.is_moderator((select auth.uid()))
);
