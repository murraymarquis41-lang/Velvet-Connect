-- Velvet Connect — F-05 and F-10 source remediation.
-- Forward-only. Does not edit historical migrations.
-- Does not change F-35, disable hosted sign-ups, apply this migration, or open enrollment.

-- ---------------------------------------------------------------------------
-- F-10: keep the allegation when a profile is removed.
-- ---------------------------------------------------------------------------

alter table public.reports alter column reporter_id drop not null;
alter table public.reports alter column reported_id drop not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conrelid = 'public.reports'::regclass
      and con.contype = 'f'
      and att.attname in ('reporter_id', 'reported_id')
  loop
    execute format('alter table public.reports drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

alter table public.reports
  add constraint reports_reported_id_fkey
  foreign key (reported_id) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- F-05: only a CEO may overturn a permanent suspension.
-- The current assignee still cannot review the appeal.
-- ---------------------------------------------------------------------------

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
  subject_status text;
  last_enforcement text;
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
    select profile.safety_status
    into subject_status
    from public.profiles profile
    where profile.id = target_profile;

    select moderation_action.action
    into last_enforcement
    from public.moderation_actions moderation_action
    where moderation_action.case_id = target_case
      and moderation_action.action in (
        'temporarily_suspended', 'reactivated', 'permanently_suspended'
      )
    order by moderation_action.created_at desc, moderation_action.id desc
    limit 1;

    if subject_status = 'permanently_suspended'
       or last_enforcement = 'permanently_suspended' then
      if not private.has_moderator_role(actor, 'ceo') then
        raise exception 'CEO authorization required to overturn a permanent suspension';
      end if;
    end if;

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

-- ---------------------------------------------------------------------------
-- F-10: hold deletion during an open case or a suspension.
-- ---------------------------------------------------------------------------

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

  if exists (
    select 1
    from public.moderation_cases
    where reported_id = account_id
      and status in ('queued', 'in_review', 'escalated')
  ) then
    raise exception 'Account deletion is held while a moderation case is open';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = account_id
      and safety_status is distinct from 'active'
  ) then
    raise exception 'Account deletion is held while the account is suspended';
  end if;

  delete from auth.sessions where user_id = account_id;
  delete from auth.users where id = account_id;
  return found;
end;
$$;
