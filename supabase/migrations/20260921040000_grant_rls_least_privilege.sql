-- Velvet Connect Build 03 — grant and FORCE RLS least-privilege remediation
-- Founder staging lock: 2026-09-21
-- Parent SHA: 4f8c5d457343f029c8ed0bb6e032b0382ad6b0c5
-- Scope: F-23, F-24, F-25, F-02, F-03 only.
-- Does not remediate F-05, F-10, or F-35.
-- Does not change RLS policy predicates.
-- Not a merge, tag, enrollment, beta, or production authorization.

-- ---------------------------------------------------------------------------
-- 1. Replace GRANT ALL with the commands that have matching RLS policies
-- ---------------------------------------------------------------------------

revoke all on table public.profile_photos from anon, authenticated;
grant select, insert, update, delete on table public.profile_photos to authenticated;

revoke all on table public.swipes from anon, authenticated;
grant select, insert, update on table public.swipes to authenticated;

revoke all on table public.blocks from anon, authenticated;
grant select, insert, delete on table public.blocks to authenticated;

revoke all on table public.reports from anon, authenticated;
grant select, insert on table public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Matches: SELECT only. Insert/delete stay on the definer trigger.
-- ---------------------------------------------------------------------------

revoke all on table public.matches from anon, authenticated;
grant select on table public.matches to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Messages: SELECT, INSERT, column UPDATE(read_at) only
-- ---------------------------------------------------------------------------

revoke all on table public.messages from anon, authenticated;
grant select, insert on table public.messages to authenticated;
grant update (read_at) on table public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Revoke TRUNCATE, REFERENCES, and TRIGGER on member tables
-- ---------------------------------------------------------------------------

revoke delete, truncate, references, trigger on table public.profiles from authenticated;
revoke truncate, references, trigger on table public.profile_photos from authenticated;
revoke truncate, references, trigger on table public.swipes from authenticated;
revoke truncate, references, trigger on table public.matches from authenticated;
revoke truncate, references, trigger on table public.messages from authenticated;
revoke truncate, references, trigger on table public.blocks from authenticated;
revoke truncate, references, trigger on table public.reports from authenticated;
revoke truncate, references, trigger on table public.moderator_roles from authenticated;
revoke truncate, references, trigger on table public.moderation_cases from authenticated;
revoke truncate, references, trigger on table public.moderation_actions from authenticated;
revoke truncate, references, trigger on table public.moderation_appeals from authenticated;
revoke truncate, references, trigger on table public.moderation_case_statements from authenticated;

revoke all on table public.profiles from anon;
revoke all on table public.profile_photos from anon;
revoke all on table public.swipes from anon;
revoke all on table public.matches from anon;
revoke all on table public.messages from anon;
revoke all on table public.blocks from anon;
revoke all on table public.reports from anon;
revoke all on table public.moderator_roles from anon;
revoke all on table public.moderation_cases from anon;
revoke all on table public.moderation_actions from anon;
revoke all on table public.moderation_appeals from anon;
revoke all on table public.moderation_case_statements from anon;

-- ---------------------------------------------------------------------------
-- 5. private.member_case_side: owner-path only (statement RPC definer)
-- ---------------------------------------------------------------------------

revoke all on function private.member_case_side(uuid, uuid) from public;
revoke all on function private.member_case_side(uuid, uuid) from anon;
revoke all on function private.member_case_side(uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 6. admin_diagnostics: retain, drop service_role grant
-- ---------------------------------------------------------------------------

revoke all on function public.admin_diagnostics() from public;
revoke all on function public.admin_diagnostics() from anon;
revoke all on function public.admin_diagnostics() from service_role;
grant execute on function public.admin_diagnostics() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. FORCE RLS on remaining member tables
-- Owner-definer match trigger must keep working. Superuser-owned definers
-- typically still bypass RLS. Do not add a member INSERT/DELETE policy on matches.
-- ---------------------------------------------------------------------------

alter table public.profile_photos force row level security;
alter table public.swipes force row level security;
alter table public.matches force row level security;
alter table public.messages force row level security;
alter table public.blocks force row level security;
alter table public.reports force row level security;
