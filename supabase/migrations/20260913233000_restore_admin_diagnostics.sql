-- Reconcile the repository migration chain with the historical
-- trust_safety_reporting_triage migration applied to Build 03 staging.
-- This is a read-only diagnostic available only to safety administrators and
-- the CEO; anonymous access remains explicitly revoked.

create or replace function public.admin_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.has_moderator_role(actor, 'ceo')
     and not private.has_moderator_role(actor, 'safety_admin') then
    raise exception 'Administrative authorization required';
  end if;

  select jsonb_build_object(
    'auth_users', (
      select count(*)
      from auth.users
    ),
    'moderator_roles', (
      select count(*)
      from public.moderator_roles
      where active = true
    ),
    'open_moderation_cases', (
      select count(*)
      from public.moderation_cases
      where status in ('queued', 'in_review', 'escalated')
    ),
    'pending_appeals', (
      select count(*)
      from public.moderation_appeals
      where status = 'pending'
    ),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_diagnostics() from public;
revoke all on function public.admin_diagnostics() from anon;
grant execute on function public.admin_diagnostics() to authenticated;
grant execute on function public.admin_diagnostics() to service_role;
