-- Build 03 milestone delta: adults-only enrollment, moderation/admin controls,
-- and complete self-service account deletion.

alter table public.profiles
  add column date_of_birth date,
  add column adult_attested_at timestamptz,
  add column terms_accepted_at timestamptz,
  add column safety_status text not null default 'active'
    check (safety_status in ('active', 'temporarily_suspended', 'permanently_suspended')),
  add column suspended_until timestamptz;

alter table public.profiles
  add constraint profiles_adult_enrollment_check check (
    onboarding_completed = false
    or created_at < timestamptz '2026-08-31 00:00:00+00'
    or (
      date_of_birth is not null
      and date_of_birth <= (current_date - interval '18 years')::date
      and adult_attested_at is not null
      and terms_accepted_at is not null
    )
  );

create or replace function private.is_profile_discoverable_to(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select (select auth.uid()) = viewer_id
    and viewer_id <> target_id
    and exists (
      select 1
      from public.profiles viewer
      join public.profiles target on target.id = target_id
      where viewer.id = viewer_id
        and viewer.verified
        and viewer.onboarding_completed
        and viewer.safety_status = 'active'
        and target.verified
        and target.onboarding_completed
        and target.safety_status = 'active'
    )
    and not exists (
      select 1 from public.blocks
      where (blocker_id = viewer_id and blocked_id = target_id)
         or (blocker_id = target_id and blocked_id = viewer_id)
    );
$$;

create or replace function private.members_are_active(member_a uuid, member_b uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.profiles first_member
    join public.profiles second_member on second_member.id = member_b
    where first_member.id = member_a
      and first_member.safety_status = 'active'
      and second_member.safety_status = 'active'
  );
$$;

drop policy "Participants read unblocked matches" on public.matches;
create policy "Participants read active unblocked matches" on public.matches
for select to authenticated
using (
  (((select auth.uid()) = user_a_id) or ((select auth.uid()) = user_b_id))
  and private.members_are_active(user_a_id, user_b_id)
  and not private.is_blocked_pair(user_a_id, user_b_id)
);

drop policy "Participants read unblocked messages" on public.messages;
create policy "Participants read active unblocked messages" on public.messages
for select to authenticated
using (exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and private.members_are_active(m.user_a_id, m.user_b_id)
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

drop policy "Participants send as themselves unblocked" on public.messages;
create policy "Participants send as themselves active unblocked" on public.messages
for insert to authenticated
with check ((select auth.uid()) = sender_id and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and private.members_are_active(m.user_a_id, m.user_b_id)
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

drop policy "Participants mark received unblocked messages read" on public.messages;
create policy "Participants mark received active unblocked messages read" on public.messages
for update to authenticated
using (sender_id <> (select auth.uid()) and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and private.members_are_active(m.user_a_id, m.user_b_id)
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
))
with check (sender_id <> (select auth.uid()) and read_at is not null and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and private.members_are_active(m.user_a_id, m.user_b_id)
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

create table public.moderator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator', 'safety_admin', 'ceo')),
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid unique references public.reports(id) on delete set null,
  reported_id uuid references public.profiles(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'in_review', 'escalated', 'resolved', 'dismissed')),
  severity text not null default 'standard'
    check (severity in ('standard', 'priority', 'critical')),
  assigned_to uuid references auth.users(id) on delete set null,
  disposition_reason text check (char_length(disposition_reason) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'queued', 'claimed', 'escalated', 'resolved', 'dismissed',
    'temporarily_suspended', 'reactivated', 'permanently_suspended',
    'appeal_upheld', 'appeal_overturned'
  )),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  statement text not null check (char_length(statement) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'overturned')),
  reviewer_id uuid references auth.users(id) on delete set null,
  review_reason text check (char_length(review_reason) between 3 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (case_id, appellant_id)
);

create index moderation_cases_queue_idx
  on public.moderation_cases (status, severity, created_at);
create index moderation_cases_reported_idx
  on public.moderation_cases (reported_id, created_at desc);
create index moderation_actions_case_idx
  on public.moderation_actions (case_id, created_at);
create index moderation_appeals_status_idx
  on public.moderation_appeals (status, created_at);

create trigger moderation_cases_set_updated_at
before update on public.moderation_cases
for each row execute function public.set_updated_at();

create or replace function private.is_moderator(member_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.moderator_roles
    where user_id = member_id and active
  );
$$;

create or replace function private.has_moderator_role(member_id uuid, required_role text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.moderator_roles
    where user_id = member_id and active and role = required_role
  );
$$;

create or replace function private.queue_report_for_review()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  new_case_id uuid;
begin
  insert into public.blocks (blocker_id, blocked_id)
  values (new.reporter_id, new.reported_id)
  on conflict (blocker_id, blocked_id) do nothing;

  insert into public.moderation_cases (report_id, reported_id, severity)
  values (
    new.id,
    new.reported_id,
    case
      when lower(new.reason) in ('immediate danger', 'violence', 'underage concern') then 'critical'
      when lower(new.reason) in ('harassment', 'hate', 'impersonation') then 'priority'
      else 'standard'
    end
  )
  returning id into new_case_id;

  insert into public.moderation_actions (case_id, actor_id, action, reason)
  values (new_case_id, null, 'queued', 'Report automatically queued for human review.');
  return new;
end;
$$;

create trigger reports_queue_for_review
after insert on public.reports
for each row execute function private.queue_report_for_review();

insert into public.moderation_cases (report_id, reported_id, severity)
select
  report.id,
  report.reported_id,
  case
    when lower(report.reason) in ('immediate danger', 'violence', 'underage concern') then 'critical'
    when lower(report.reason) in ('harassment', 'hate', 'impersonation') then 'priority'
    else 'standard'
  end
from public.reports report
on conflict (report_id) do nothing;

insert into public.moderation_actions (case_id, actor_id, action, reason)
select moderation_case.id, null, 'queued', 'Existing report added during Build 03 moderation migration.'
from public.moderation_cases moderation_case
where not exists (
  select 1 from public.moderation_actions action where action.case_id = moderation_case.id
);

create or replace function public.moderate_case(
  target_case_id uuid,
  requested_action text,
  action_reason text,
  suspension_hours integer default 72
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor uuid := auth.uid();
  target_profile uuid;
  current_case_status text;
begin
  if actor is null or not private.is_moderator(actor) then
    raise exception 'Moderator authorization required';
  end if;
  if char_length(trim(action_reason)) < 3 then
    raise exception 'A reason is required';
  end if;

  select reported_id, status into target_profile, current_case_status
  from public.moderation_cases
  where id = target_case_id
  for update;
  if target_profile is null then raise exception 'Moderation case not found'; end if;

  case requested_action
    when 'claimed' then
      if current_case_status not in ('queued', 'in_review') then
        raise exception 'Only an open case can be claimed';
      end if;
      update public.moderation_cases
      set status = 'in_review', assigned_to = actor
      where id = target_case_id and status in ('queued', 'in_review');
    when 'escalated' then
      if current_case_status in ('resolved', 'dismissed') then
        raise exception 'A closed case cannot be escalated';
      end if;
      update public.moderation_cases
      set status = 'escalated', severity = 'critical', assigned_to = actor
      where id = target_case_id and status not in ('resolved', 'dismissed');
    when 'resolved' then
      if current_case_status in ('resolved', 'dismissed') then
        raise exception 'Case is already closed';
      end if;
      update public.moderation_cases
      set status = 'resolved', assigned_to = actor,
          disposition_reason = trim(action_reason), resolved_at = now()
      where id = target_case_id;
      update public.reports set status = 'resolved' where id = (
        select report_id from public.moderation_cases where id = target_case_id
      );
    when 'dismissed' then
      if current_case_status in ('resolved', 'dismissed') then
        raise exception 'Case is already closed';
      end if;
      update public.moderation_cases
      set status = 'dismissed', assigned_to = actor,
          disposition_reason = trim(action_reason), resolved_at = now()
      where id = target_case_id;
      update public.reports set status = 'dismissed' where id = (
        select report_id from public.moderation_cases where id = target_case_id
      );
    when 'temporarily_suspended' then
      if current_case_status in ('resolved', 'dismissed') then
        raise exception 'A closed case cannot suspend an account';
      end if;
      if suspension_hours < 1 or suspension_hours > 720 then
        raise exception 'Temporary suspension must be between 1 and 720 hours';
      end if;
      update public.profiles
      set safety_status = 'temporarily_suspended',
          suspended_until = now() + make_interval(hours => suspension_hours)
      where id = target_profile;
      update public.moderation_cases
      set status = 'escalated', assigned_to = actor, severity = 'critical'
      where id = target_case_id;
    when 'reactivated' then
      if not private.has_moderator_role(actor, 'safety_admin')
         and not private.has_moderator_role(actor, 'ceo') then
        raise exception 'Safety administrator authorization required';
      end if;
      update public.profiles
      set safety_status = 'active', suspended_until = null
      where id = target_profile;
    when 'permanently_suspended' then
      if not private.has_moderator_role(actor, 'ceo') then
        raise exception 'CEO authorization required for permanent action';
      end if;
      update public.profiles
      set safety_status = 'permanently_suspended', suspended_until = null
      where id = target_profile;
      update public.moderation_cases
      set status = 'resolved', assigned_to = actor,
          disposition_reason = trim(action_reason), resolved_at = now()
      where id = target_case_id;
    else
      raise exception 'Unsupported moderation action';
  end case;

  insert into public.moderation_actions (case_id, actor_id, action, reason)
  values (target_case_id, actor, requested_action, trim(action_reason));
end;
$$;

create or replace function public.submit_moderation_appeal(target_case_id uuid, appeal_statement text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  appeal_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.moderation_cases
    where id = target_case_id and reported_id = auth.uid() and status in ('escalated', 'resolved', 'dismissed')
  ) then
    raise exception 'Eligible moderation case not found';
  end if;
  insert into public.moderation_appeals (case_id, appellant_id, statement)
  values (target_case_id, auth.uid(), trim(appeal_statement))
  returning id into appeal_id;
  return appeal_id;
end;
$$;

create or replace function public.review_moderation_appeal(
  target_appeal_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor uuid := auth.uid();
  target_case uuid;
  target_profile uuid;
  original_reviewer uuid;
begin
  if actor is null or (
    not private.has_moderator_role(actor, 'safety_admin')
    and not private.has_moderator_role(actor, 'ceo')
  ) then
    raise exception 'Safety administrator authorization required';
  end if;
  if decision not in ('upheld', 'overturned') then
    raise exception 'Appeal decision must be upheld or overturned';
  end if;
  if char_length(trim(decision_reason)) < 3 then
    raise exception 'A review reason is required';
  end if;

  select appeal.case_id, moderation_case.reported_id, moderation_case.assigned_to
  into target_case, target_profile, original_reviewer
  from public.moderation_appeals appeal
  join public.moderation_cases moderation_case on moderation_case.id = appeal.case_id
  where appeal.id = target_appeal_id and appeal.status = 'pending'
  for update of appeal;
  if target_case is null then raise exception 'Pending appeal not found'; end if;
  if original_reviewer = actor then
    raise exception 'Appeal requires a reviewer other than the original case assignee';
  end if;

  update public.moderation_appeals
  set status = decision, reviewer_id = actor,
      review_reason = trim(decision_reason), reviewed_at = now()
  where id = target_appeal_id;

  if decision = 'overturned' then
    update public.profiles
    set safety_status = 'active', suspended_until = null
    where id = target_profile;
    update public.moderation_cases
    set status = 'resolved', disposition_reason = trim(decision_reason), resolved_at = now()
    where id = target_case;
  end if;

  insert into public.moderation_actions (case_id, actor_id, action, reason)
  values (target_case, actor, 'appeal_' || decision, trim(decision_reason));
end;
$$;

create or replace function public.delete_own_account(confirmation text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then raise exception 'Authentication required'; end if;
  if confirmation <> 'DELETE' then raise exception 'Type DELETE to confirm account deletion'; end if;

  -- Revoke refresh sessions before removing the Auth identity. Existing short-
  -- lived JWTs cannot reach user-owned rows after the cascading deletion.
  delete from auth.sessions where user_id = account_id;

  -- The profiles FK and all current user-owned application rows cascade from
  -- auth.users. Storage upload is not enabled in this release slice; physical
  -- object deletion must use the Storage API if that capability is activated.
  delete from auth.users where id = account_id;
  return found;
end;
$$;

create or replace function private.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'Moderation audit records are immutable';
end;
$$;

create trigger moderation_actions_immutable
before update or delete on public.moderation_actions
for each row execute function private.prevent_moderation_audit_mutation();

alter table public.moderator_roles enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_cases force row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_actions force row level security;
alter table public.moderation_appeals enable row level security;
alter table public.moderation_appeals force row level security;

create policy "Moderators view their active role" on public.moderator_roles
for select to authenticated using (user_id = (select auth.uid()));

create policy "Moderators view moderation cases" on public.moderation_cases
for select to authenticated using (private.is_moderator((select auth.uid())));

create policy "Reported members view appealable cases" on public.moderation_cases
for select to authenticated using (
  reported_id = (select auth.uid()) and status in ('escalated', 'resolved', 'dismissed')
);

create policy "Moderators view immutable actions" on public.moderation_actions
for select to authenticated using (private.is_moderator((select auth.uid())));

create policy "Members view own appeals" on public.moderation_appeals
for select to authenticated using (appellant_id = (select auth.uid()));

create policy "Moderators view appeals" on public.moderation_appeals
for select to authenticated using (private.is_moderator((select auth.uid())));

create policy "Moderators view report details" on public.reports
for select to authenticated using (private.is_moderator((select auth.uid())));

create policy "Moderators view reported profiles" on public.profiles
for select to authenticated using (
  private.is_moderator((select auth.uid()))
  and exists (
    select 1 from public.moderation_cases where reported_id = profiles.id
  )
);

revoke all on public.moderator_roles, public.moderation_cases,
  public.moderation_actions, public.moderation_appeals from anon, authenticated;
grant select on public.moderator_roles, public.moderation_cases,
  public.moderation_actions, public.moderation_appeals to authenticated;

revoke all on function private.is_moderator(uuid) from public;
revoke all on function private.has_moderator_role(uuid, text) from public;
revoke all on function private.members_are_active(uuid, uuid) from public;
grant execute on function private.is_moderator(uuid) to authenticated;
grant execute on function private.has_moderator_role(uuid, text) to authenticated;
grant execute on function private.members_are_active(uuid, uuid) to authenticated;

revoke all on function public.moderate_case(uuid, text, text, integer) from public;
revoke all on function public.submit_moderation_appeal(uuid, text) from public;
revoke all on function public.review_moderation_appeal(uuid, text, text) from public;
revoke all on function public.delete_own_account(text) from public;
grant execute on function public.moderate_case(uuid, text, text, integer) to authenticated;
grant execute on function public.submit_moderation_appeal(uuid, text) to authenticated;
grant execute on function public.review_moderation_appeal(uuid, text, text) to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;

revoke update on table public.profiles from authenticated;
grant update (
  display_name, age, city, bio, interests, avatar_url, pronouns,
  gender_identity, orientation, intention, looking_for, onboarding_completed,
  date_of_birth, adult_attested_at, terms_accepted_at
) on table public.profiles to authenticated;
