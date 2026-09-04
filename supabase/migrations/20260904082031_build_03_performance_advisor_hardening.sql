-- Build 03 follow-up: cover moderation foreign keys and consolidate equivalent
-- permissive SELECT policies without changing their authorization semantics.

create index if not exists moderation_actions_actor_id_idx
  on public.moderation_actions (actor_id);

create index if not exists moderation_appeals_appellant_id_idx
  on public.moderation_appeals (appellant_id);

create index if not exists moderation_appeals_reviewer_id_idx
  on public.moderation_appeals (reviewer_id);

create index if not exists moderation_cases_assigned_to_idx
  on public.moderation_cases (assigned_to);

create index if not exists moderator_roles_granted_by_idx
  on public.moderator_roles (granted_by);

drop policy if exists "Members view own appeals" on public.moderation_appeals;
drop policy if exists "Moderators view appeals" on public.moderation_appeals;
create policy "Members or moderators view appeals"
on public.moderation_appeals
for select to authenticated
using (
  appellant_id = (select auth.uid())
  or private.is_moderator((select auth.uid()))
);

drop policy if exists "Moderators view moderation cases" on public.moderation_cases;
drop policy if exists "Reported members view appealable cases" on public.moderation_cases;
create policy "Moderators or affected members view cases"
on public.moderation_cases
for select to authenticated
using (
  private.is_moderator((select auth.uid()))
  or (
    reported_id = (select auth.uid())
    and status in ('escalated', 'resolved', 'dismissed')
  )
);

drop policy if exists "Members discover eligible unblocked profiles" on public.profiles;
drop policy if exists "Moderators view reported profiles" on public.profiles;
create policy "Members discover or moderators review profiles"
on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or private.is_profile_discoverable_to((select auth.uid()), id)
  or (
    private.is_moderator((select auth.uid()))
    and exists (
      select 1
      from public.moderation_cases
      where moderation_cases.reported_id = profiles.id
    )
  )
);

drop policy if exists "Moderators view report details" on public.reports;
drop policy if exists "Reporters read their reports" on public.reports;
create policy "Reporters or moderators view reports"
on public.reports
for select to authenticated
using (
  reporter_id = (select auth.uid())
  or private.is_moderator((select auth.uid()))
);
