begin;
-- DRAFT: hosted apply and retention activation require separate founder approval.
-- No enrollment, production, tag, or release changes. PostgreSQL 17.
-- Proposed retention: 30 days from first submission, never reset by edits.
do $$ begin
  if exists(select 1 from public.profiles where safety_status<>'active') then
    raise exception 'Historical sanctions require explicit reconciliation before this migration';
  end if;
end $$;

create table private.evidence_policy (
  singleton boolean primary key default true check (singleton),
  uploads_enabled boolean not null default false,
  retention_days integer not null default 30 check (retention_days between 1 and 90)
);
insert into private.evidence_policy default values;
revoke all on private.evidence_policy from public, anon, authenticated;
grant select, update on private.evidence_policy to service_role;
alter table private.evidence_policy enable row level security;

alter table public.moderation_cases add column response_requested_at timestamptz;
alter table public.moderation_appeals add column review_assigned_to uuid references auth.users(id) on delete set null;
create index moderation_appeals_review_assigned_idx on public.moderation_appeals(review_assigned_to);
alter table public.moderation_case_statements add column expires_at timestamptz;
update public.moderation_case_statements set expires_at = created_at + interval '30 days';
alter table public.moderation_case_statements alter column expires_at set not null;

-- Bind access checks to auth.uid(); do not expose an arbitrary-member lookup.
create function private.case_review_allowed(target_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_moderator(auth.uid()) and (
    exists (select 1 from public.moderation_cases where id=target_case and assigned_to=auth.uid())
    or exists (select 1 from public.moderation_appeals where case_id=target_case
      and status='pending' and review_assigned_to=auth.uid())
  );
$$;
revoke all on function private.case_review_allowed(uuid) from public, anon;
grant execute on function private.case_review_allowed(uuid) to authenticated;

create function private.case_submission_allowed(target_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users where id=auth.uid()
  ) and exists (
    select 1 from public.moderation_cases c left join public.reports r on r.id=c.report_id
    where c.id=target_case and c.status not in ('resolved','dismissed')
      and (r.reporter_id=auth.uid() or (c.reported_id=auth.uid() and c.response_requested_at is not null))
  );
$$;
revoke all on function private.case_submission_allowed(uuid) from public, anon;
grant execute on function private.case_submission_allowed(uuid) to authenticated;

-- Neutral listing never returns reporter identity, report text, or other parties' statements.
create function public.list_my_moderation_responses()
returns table(case_id uuid, case_status text, member_side text, may_submit boolean, uploads_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select c.id,c.status,
    case when r.reporter_id=auth.uid() then 'reporter' else 'reported_member' end,
    private.case_submission_allowed(c.id), p.uploads_enabled
  from public.moderation_cases c left join public.reports r on r.id=c.report_id
  cross join private.evidence_policy p
  where auth.uid() is not null and (r.reporter_id=auth.uid()
    or (c.reported_id=auth.uid() and c.response_requested_at is not null));
$$;
revoke all on function public.list_my_moderation_responses() from public, anon;
grant execute on function public.list_my_moderation_responses() to authenticated;

create function public.request_moderation_case_response(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  if not private.case_review_allowed(target_case_id) or not exists (
    select 1 from public.moderation_cases where id=target_case_id
      and status not in ('resolved','dismissed') and assigned_to=auth.uid()
  ) then raise exception 'Assigned moderator and open case required'; end if;
  update public.moderation_cases set response_requested_at=coalesce(response_requested_at,now()) where id=target_case_id;
end;
$$;
revoke all on function public.request_moderation_case_response(uuid) from public, anon;
grant execute on function public.request_moderation_case_response(uuid) to authenticated;

create or replace function public.submit_moderation_case_statement(target_case_id uuid, member_statement text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; side text;
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  if not private.case_submission_allowed(target_case_id) then raise exception 'Open case and permitted party required'; end if;
  if member_statement is null or char_length(trim(member_statement)) not between 10 and 4000 then
    raise exception 'Statement must contain 10 to 4000 characters'; end if;
  side := private.member_case_side(target_case_id,auth.uid());
  if exists(select 1 from public.moderation_case_statements where case_id=target_case_id and author_id=auth.uid() and expires_at<=now()) then
    raise exception 'Statement retention period has ended'; end if;
  insert into public.moderation_case_statements(case_id,author_id,author_side,statement,expires_at)
  values(target_case_id,auth.uid(),side,trim(member_statement),now()+make_interval(days=>(select retention_days from private.evidence_policy)))
  on conflict(case_id,author_id,author_side) do update set statement=excluded.statement
  returning id into sid;
  return sid;
end;
$$;
drop policy "Members or moderators view case statements" on public.moderation_case_statements;
create policy "Retained statements for author or assigned reviewer" on public.moderation_case_statements
for select to authenticated using (expires_at>now() and (author_id=(select auth.uid()) or private.case_review_allowed(case_id)));

create table public.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  mime_type text not null check(mime_type in ('image/png','image/jpeg')),
  byte_size integer not null check(byte_size between 1 and 5242880),
  state text not null default 'reserved' check(state in ('reserved','ready','deletion_requested')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index moderation_evidence_case_idx on public.moderation_evidence(case_id);
create index moderation_evidence_author_idx on public.moderation_evidence(author_id);
create index moderation_evidence_expiry_idx on public.moderation_evidence(expires_at);
alter table public.moderation_evidence enable row level security;
alter table public.moderation_evidence force row level security;
revoke all on public.moderation_evidence from public, anon, authenticated;
grant select on public.moderation_evidence to authenticated;
grant all on public.moderation_evidence to service_role;
create policy "Retained evidence metadata for author or assigned reviewer" on public.moderation_evidence
for select to authenticated using (expires_at>now() and state<>'deletion_requested'
  and (author_id=(select auth.uid()) or (state='ready' and private.case_review_allowed(case_id))));

-- Storage API must perform object deletion. Queue survives case/account cascades.
create table private.evidence_deletion_queue (
  object_path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.evidence_deletion_queue enable row level security;
revoke all on private.evidence_deletion_queue from public,anon,authenticated;
grant all on private.evidence_deletion_queue to service_role;
create function private.queue_evidence_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.evidence_deletion_queue(object_path) values(old.object_path) on conflict do nothing;
  return old;
end;
$$;
create trigger queue_evidence_deletion before delete on public.moderation_evidence
for each row execute function private.queue_evidence_deletion();

create function public.reserve_moderation_evidence(target_case_id uuid, evidence_mime text, evidence_size integer)
returns public.moderation_evidence language plpgsql security definer set search_path = '' as $$
declare item public.moderation_evidence; days integer;
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  if not private.case_submission_allowed(target_case_id) then raise exception 'Open case and permitted party required'; end if;
  select retention_days into days from private.evidence_policy where uploads_enabled;
  if days is null then raise exception 'Evidence uploads await approved retention and hosted activation'; end if;
  if evidence_mime is null or evidence_mime not in ('image/png','image/jpeg') or evidence_size is null or evidence_size not between 1 and 5242880 then
    raise exception 'Only PNG/JPEG evidence up to 5 MiB is accepted'; end if;
  if (select count(*) from public.moderation_evidence where case_id=target_case_id and author_id=auth.uid())>=5 then
    raise exception 'Maximum five evidence attachments per party per case'; end if;
  item.id:=gen_random_uuid();
  insert into public.moderation_evidence(id,case_id,author_id,object_path,mime_type,byte_size,expires_at)
  values(item.id,target_case_id,auth.uid(),target_case_id::text||'/'||item.id::text,evidence_mime,evidence_size,now()+make_interval(days=>days))
  returning * into item;
  return item;
end;
$$;
revoke all on function public.reserve_moderation_evidence(uuid,text,integer) from public,anon;
grant execute on function public.reserve_moderation_evidence(uuid,text,integer) to authenticated;

-- Apply via bucket API in approval runbook: private, 5 MiB, PNG/JPEG only.
-- Policies affect ONLY moderation-evidence. No UPDATE/upsert/DELETE for members.
create function private.evidence_object_allowed(path text, uploading boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid()) and exists (
    select 1 from public.moderation_evidence e where e.object_path=path and e.expires_at>now()
    and case when uploading then e.author_id=auth.uid() and e.state='reserved'
      and e.created_at>now()-interval '15 minutes' and private.case_submission_allowed(e.case_id)
      and (select uploads_enabled from private.evidence_policy)
    else e.state='ready' and (e.author_id=auth.uid() or private.case_review_allowed(e.case_id)) end
  );
$$;
revoke all on function private.evidence_object_allowed(text,boolean) from public,anon;
grant execute on function private.evidence_object_allowed(text,boolean) to authenticated;
create policy "Upload reserved case evidence" on storage.objects for insert to authenticated
with check(bucket_id='moderation-evidence' and private.evidence_object_allowed(name,true));
create policy "Read authorized retained case evidence" on storage.objects for select to authenticated
using(bucket_id='moderation-evidence' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
  and private.evidence_object_allowed(name,false));

create function public.finalize_moderation_evidence(evidence_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.moderation_evidence; target_case uuid;
begin
  select case_id into target_case from public.moderation_evidence where id=evidence_id and author_id=auth.uid();
  perform 1 from public.moderation_cases where id=target_case for update;
  select * into e from public.moderation_evidence where id=evidence_id and author_id=auth.uid() for update;
  if e.id is null or e.state<>'reserved' or e.expires_at<=now() or not private.case_submission_allowed(e.case_id) then
    raise exception 'Permitted pending evidence required'; end if;
  if not exists(select 1 from storage.objects where bucket_id='moderation-evidence' and name=e.object_path
    and metadata->>'mimetype'=e.mime_type and (metadata->>'size')::bigint=e.byte_size) then
    raise exception 'Uploaded evidence metadata does not match reservation'; end if;
  update public.moderation_evidence set state='ready' where id=e.id;
end;
$$;
revoke all on function public.finalize_moderation_evidence(uuid) from public,anon;
grant execute on function public.finalize_moderation_evidence(uuid) to authenticated;
create function public.request_moderation_evidence_deletion(evidence_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.moderation_evidence set state='deletion_requested' where id=evidence_id and author_id=auth.uid();
  if not found then raise exception 'Own evidence required'; end if;
end;
$$;
revoke all on function public.request_moderation_evidence_deletion(uuid) from public,anon;
grant execute on function public.request_moderation_evidence_deletion(uuid) to authenticated;

-- Service-only lifecycle RPCs. Purger removes bytes through Storage API FIRST.
create function public.list_moderation_evidence_purge()
returns table(object_path text) language sql security definer set search_path = '' as $$
  select e.object_path from public.moderation_evidence e where e.expires_at<=now()
    or e.state='deletion_requested' or (e.state='reserved' and e.created_at<now()-interval '15 minutes')
  union select q.object_path from private.evidence_deletion_queue q;
$$;
create function public.ack_moderation_evidence_purge(purged_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.moderation_evidence where object_path=purged_path and (expires_at<=now()
    or state='deletion_requested' or (state='reserved' and created_at<now()-interval '15 minutes'));
  delete from private.evidence_deletion_queue where object_path=purged_path and queued_at<now()-interval '1 hour';
end;
$$;
create function public.purge_expired_moderation_statements()
returns void language sql security definer set search_path = '' as $$
  delete from public.moderation_case_statements where expires_at<=now();
$$;
revoke all on function public.list_moderation_evidence_purge() from public,anon,authenticated;
revoke all on function public.ack_moderation_evidence_purge(text) from public,anon,authenticated;
revoke all on function public.purge_expired_moderation_statements() from public,anon,authenticated;
grant execute on function public.list_moderation_evidence_purge() to service_role;
grant execute on function public.ack_moderation_evidence_purge(text) to service_role;
grant execute on function public.purge_expired_moderation_statements() to service_role;

create function private.delete_member_case_material()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Hide and queue material for either deleted party, without removing audit.
  delete from public.moderation_evidence e where e.author_id=old.id or e.case_id in (
    select c.id from public.moderation_cases c left join public.reports r on r.id=c.report_id
    where c.reported_id=old.id or r.reporter_id=old.id);
  delete from public.moderation_case_statements s where s.author_id=old.id or s.case_id in (
    select c.id from public.moderation_cases c left join public.reports r on r.id=c.report_id
    where c.reported_id=old.id or r.reporter_id=old.id);
  return old;
end;
$$;
create trigger delete_member_case_material before delete on auth.users
for each row execute function private.delete_member_case_material();

-- Track sanctions per decision, not as a single mutable profile flag.
create table private.case_sanctions (
  action_id bigint primary key references public.moderation_actions(id) on delete cascade,
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  member_id uuid references auth.users(id) on delete set null,
  action text not null,
  expires_at timestamptz,
  active boolean not null default true
);
create index case_sanctions_member_idx on private.case_sanctions(member_id);
create index case_sanctions_case_idx on private.case_sanctions(case_id);
alter table private.case_sanctions enable row level security;
revoke all on private.case_sanctions from public,anon,authenticated;
create function private.recompute_case_sanctions(member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare until_at timestamptz; permanent boolean;
begin
  select coalesce(bool_or(action='permanently_suspended'),false),max(expires_at) into permanent,until_at
  from private.case_sanctions where member_id=member and active and (expires_at is null or expires_at>now());
  update public.profiles set safety_status=case when permanent then 'permanently_suspended'
    when until_at is not null then 'temporarily_suspended' else 'active' end,
    suspended_until=case when permanent then null else until_at end where id=member;
end;
$$;
create function private.capture_case_sanction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member uuid;
begin
  select reported_id into member from public.moderation_cases where id=new.case_id;
  if new.action in ('temporarily_suspended','permanently_suspended') then
    insert into private.case_sanctions(action_id,case_id,member_id,action,expires_at)
    select new.id,new.case_id,member,new.action,case when new.action='temporarily_suspended' then suspended_until else null end
    from public.profiles where id=member;
  elsif new.action='reactivated' then
    update private.case_sanctions set active=false where case_id=new.case_id;
  end if;
  if new.action in ('temporarily_suspended','permanently_suspended','reactivated') then
    perform private.recompute_case_sanctions(member);
  end if;
  return new;
end;
$$;
create trigger capture_case_sanction after insert on public.moderation_actions
for each row execute function private.capture_case_sanction();
-- Existing multi-case enforcement cannot be reconstructed safely from a single
-- profile flag. Block activation if unresolved historical sanctions exist.


create table private.appeal_decisions (
  appeal_id uuid primary key references public.moderation_appeals(id) on delete cascade,
  decision_action_id bigint not null references public.moderation_actions(id),
  decision_actor_id uuid references auth.users(id) on delete set null
);
alter table private.appeal_decisions enable row level security;
revoke all on private.appeal_decisions from public,anon,authenticated;
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

  select reported_id into target_profile from public.moderation_cases where id=target_case_id;
  if target_profile is null then raise exception 'Moderation case not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_profile::text,17));
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
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid; act public.moderation_actions;
begin
  if auth.uid() is null or appeal_statement is null or char_length(trim(appeal_statement)) not between 10 and 2000 then
    raise exception 'Authenticated member and 10 to 2000 character statement required'; end if;
  perform 1 from public.moderation_cases where id=target_case_id and reported_id=auth.uid()
    and status in ('escalated','resolved','dismissed') for update;
  if not found then raise exception 'Eligible moderation case not found'; end if;
  select * into act from public.moderation_actions where case_id=target_case_id
    and action in ('temporarily_suspended','permanently_suspended','resolved','dismissed') order by id desc limit 1;
  if act.id is null or act.actor_id is null then raise exception 'Decision provenance requires human reconciliation'; end if;
  insert into public.moderation_appeals(case_id,appellant_id,statement)
  values(target_case_id,auth.uid(),trim(appeal_statement)) returning id into aid;
  insert into private.appeal_decisions values(aid,act.id,act.actor_id);
  return aid;
end;
$$;
-- Fail closed for prior pending appeals with no trustworthy immutable decision mapping.
create function public.claim_moderation_appeal(target_appeal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare original_actor uuid;
begin
  if auth.uid() is null or not (private.has_moderator_role(auth.uid(),'safety_admin') or private.has_moderator_role(auth.uid(),'ceo')) then
    raise exception 'Safety administrator authorization required'; end if;
  perform 1 from public.moderation_appeals where id=target_appeal_id and status='pending' for update;
  if not found then raise exception 'Pending appeal not found'; end if;
  select decision_actor_id into original_actor from private.appeal_decisions where appeal_id=target_appeal_id;
  if original_actor is null or original_actor=auth.uid() then raise exception 'Independent decision-actor review required'; end if;
  update public.moderation_appeals set review_assigned_to=auth.uid() where id=target_appeal_id;
end;
$$;
revoke all on function public.claim_moderation_appeal(uuid) from public,anon;
grant execute on function public.claim_moderation_appeal(uuid) to authenticated;
create or replace function public.review_moderation_appeal(target_appeal_id uuid, decision text, decision_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare original_actor uuid; target_case uuid; target_profile uuid; appealed_action bigint;
begin
  if auth.uid() is null or not (private.has_moderator_role(auth.uid(),'safety_admin') or private.has_moderator_role(auth.uid(),'ceo')) then
    raise exception 'Safety administrator authorization required'; end if;
  if decision is null or decision not in ('upheld','overturned') or decision_reason is null
    or char_length(trim(decision_reason)) not between 3 and 500 then raise exception 'Valid decision and reason required'; end if;
  select c.reported_id into target_profile from public.moderation_appeals a join public.moderation_cases c on c.id=a.case_id
  where a.id=target_appeal_id;
  if target_profile is null then raise exception 'Appeal subject unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_profile::text,17));
  select a.case_id,d.decision_actor_id,d.decision_action_id into target_case,original_actor,appealed_action
  from public.moderation_appeals a join private.appeal_decisions d on d.appeal_id=a.id
  where a.id=target_appeal_id and a.status='pending' and a.review_assigned_to=auth.uid() for update of a;
  if target_case is null or original_actor is null or original_actor=auth.uid() then raise exception 'Assigned independent decision-actor review required'; end if;
  update public.moderation_appeals set status=decision,reviewer_id=auth.uid(),review_reason=trim(decision_reason),reviewed_at=now() where id=target_appeal_id;
  if decision='overturned' then
    update private.case_sanctions set active=false where action_id=appealed_action;
    perform private.recompute_case_sanctions(target_profile);
    -- Do not resolve a case with another unappealed active sanction.
    if not exists(select 1 from private.case_sanctions where case_id=target_case and active and (expires_at is null or expires_at>now())) then
      update public.moderation_cases set status='resolved',disposition_reason=trim(decision_reason),resolved_at=now() where id=target_case;
    end if;
  end if;
  insert into public.moderation_actions(case_id,actor_id,action,reason)
  values(target_case,auth.uid(),'appeal_'||decision,trim(decision_reason));
end;
$$;
-- All privileged internal helpers start without PUBLIC execute.
revoke all on function private.queue_evidence_deletion() from public,anon,authenticated;
revoke all on function private.delete_member_case_material() from public,anon,authenticated;
revoke all on function private.recompute_case_sanctions(uuid) from public,anon,authenticated;
revoke all on function private.capture_case_sanction() from public,anon,authenticated;

-- Queue metadata may be visible to moderators; sensitive report/appeal text is assigned-only.
drop policy "Reporters or moderators view reports" on public.reports;
create policy "Assigned reviewers view report details" on public.reports for select to authenticated
using (reporter_id=(select auth.uid()) or exists(select 1 from public.moderation_cases c where c.report_id=reports.id and private.case_review_allowed(c.id)));
drop policy "Members or moderators view appeals" on public.moderation_appeals;
create policy "Assigned independent reviewer views appeals" on public.moderation_appeals for select to authenticated
using (appellant_id=(select auth.uid()) or (review_assigned_to=(select auth.uid()) and private.is_moderator((select auth.uid()))));
create function public.list_moderation_appeal_queue()
returns table(id uuid,case_id uuid,created_at timestamptz,statement text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.case_id,a.created_at,case when a.review_assigned_to=auth.uid() then a.statement else null end
  from public.moderation_appeals a join private.appeal_decisions d on d.appeal_id=a.id
  where a.status='pending' and auth.uid() is not null
    and (private.has_moderator_role(auth.uid(),'safety_admin') or private.has_moderator_role(auth.uid(),'ceo'))
    and d.decision_actor_id is not null and d.decision_actor_id<>auth.uid();
$$;
revoke all on function public.list_moderation_appeal_queue() from public,anon;
grant execute on function public.list_moderation_appeal_queue() to authenticated;

commit;
