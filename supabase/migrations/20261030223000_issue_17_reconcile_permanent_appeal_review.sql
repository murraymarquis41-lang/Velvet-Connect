-- Velvet Connect — reconcile #21 (issue 17 independent appeals) with #26 (F-05).
-- Forward-only. 20261021192300 replaced review_moderation_appeal and dropped the
-- issue-17 independence checks; this restores them while keeping the F-05 rule
-- that only a CEO may overturn a permanent suspension.
begin;
create or replace function public.review_moderation_appeal(target_appeal_id uuid, decision text, decision_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare original_actor uuid; target_case uuid; target_profile uuid; appealed_action bigint;
  appealed_kind text;
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
  if decision='overturned' then
    -- F-05: only a CEO may overturn a permanent suspension.
    select action into appealed_kind from public.moderation_actions where id=appealed_action;
    -- Case-scoped: an unrelated permanent sanction on another case is kept by
    -- private.case_sanctions and does not block reviewing this appeal.
    if (appealed_kind='permanently_suspended'
        or exists(select 1 from private.case_sanctions s where s.case_id=target_case and s.active and s.action='permanently_suspended'))
       and not private.has_moderator_role(auth.uid(),'ceo') then
      raise exception 'CEO authorization required to overturn a permanent suspension';
    end if;
  end if;
  update public.moderation_appeals set status=decision,reviewer_id=auth.uid(),review_reason=trim(decision_reason),reviewed_at=now() where id=target_appeal_id;
  if decision='overturned' then
    update private.case_sanctions set active=false where action_id=appealed_action;
    perform private.recompute_case_sanctions(target_profile);
    if not exists(select 1 from private.case_sanctions where case_id=target_case and active and (expires_at is null or expires_at>now())) then
      update public.moderation_cases set status='resolved',disposition_reason=trim(decision_reason),resolved_at=now() where id=target_case;
    end if;
  end if;
  insert into public.moderation_actions(case_id,actor_id,action,reason)
  values(target_case,auth.uid(),'appeal_'||decision,trim(decision_reason));
end;
$$;
revoke all on function public.review_moderation_appeal(uuid,text,text) from public,anon;
grant execute on function public.review_moderation_appeal(uuid,text,text) to authenticated;
commit;
