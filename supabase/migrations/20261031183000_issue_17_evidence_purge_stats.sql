-- Velvet Connect — Issue 17 item C: read-only purge backlog stats for the
-- private staging health check. Forward-only. Service role only.
-- DRAFT: hosted apply requires separate founder approval.
begin;
create function public.moderation_evidence_purge_stats()
returns table(
  queue_count bigint,
  queue_oldest_age_seconds bigint,
  overdue_count bigint,
  deletion_requested_count bigint
) language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from private.evidence_deletion_queue),
    (select floor(extract(epoch from now()-min(queued_at)))::bigint from private.evidence_deletion_queue),
    (select count(*) from public.moderation_evidence e
      where e.expires_at<=now()-interval '1 hour'
        or (e.state='reserved' and e.created_at<now()-interval '75 minutes')),
    (select count(*) from public.moderation_evidence e where e.state='deletion_requested');
$$;
revoke all on function public.moderation_evidence_purge_stats() from public,anon,authenticated;
grant execute on function public.moderation_evidence_purge_stats() to service_role;
commit;
