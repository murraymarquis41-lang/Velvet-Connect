-- Issue #10: recover demonstrated application deltas from authoritative staging.
-- Read-only capture: qqintbwoalvoegvqoxlo, 2026-10-02 UTC.
-- Queue source: hosted 20260905182323_trust_safety_reporting_triage,
-- rechecked against current pg_get_functiondef. No historical migration edit.
-- Internal EXECUTE and private USAGE match captured staging ACLs.
-- Draft only: applying to an existing hosted database requires separate approval.

CREATE OR REPLACE FUNCTION private.queue_report_for_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      when lower(new.reason) in (
        'immediate danger',
        'violence',
        'coercion',
        'sexual image abuse',
        'underage concern'
      ) then 'critical'
      when lower(new.reason) in ('harassment', 'hate', 'impersonation') then 'priority'
      else 'standard'
    end
  )
  returning id into new_case_id;

  insert into public.moderation_actions (case_id, actor_id, action, reason)
  values (new_case_id, null, 'queued', 'Report automatically queued for human review.');
  return new;
end;
$function$
;

drop trigger swipes_create_match_on_mutual_like on public.swipes;
CREATE TRIGGER swipes_create_match_on_mutual_like AFTER INSERT OR UPDATE OF liked ON public.swipes FOR EACH ROW EXECUTE FUNCTION private.create_match_on_mutual_like();

-- These are internal functions, not member RPCs. Trigger invocation remains
-- on the owner path. Do not mirror platform-wide default EXECUTE grants.
revoke all on function private.members_are_blocked(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.create_match_on_mutual_like() from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
