-- Issue #17: two-sided pre-decision moderation statements.
-- Preserves reporter privacy, immediate disconnect, human-only disposition,
-- and least-privilege access. Evidence-file storage is intentionally handled
-- in a separate migration after privacy review of retention/deletion controls.

create table public.moderation_case_statements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_side text not null check (author_side in ('reporter', 'reported_member')),
  statement text not null check (char_length(trim(statement)) between 10 and 4000),
  created_at timestamptz not null default now(),
  unique (case_id, author_id, author_side)
);

create index moderation_case_statements_case_idx
  on public.moderation_case_statements (case_id, created_at);

alter table public.moderation_case_statements enable row level security;
alter table public.moderation_case_statements force row level security;

create or replace function private.member_case_side(target_case_id uuid, member_id uuid)
returns text
language sql
stable security definer
set search_path to ''
as $$
  select case
    when report.reporter_id = member_id then 'reporter'
    when moderation_case.reported_id = member_id then 'reported_member'
    else null
  end
  from public.moderation_cases moderation_case
  left join public.reports report on report.id = moderation_case.report_id
  where moderation_case.id = target_case_id;
$$;

create policy "Members view their own case statements"
on public.moderation_case_statements
for select to authenticated
using (author_id = (select auth.uid()));

create policy "Moderators view case statements"
on public.moderation_case_statements
for select to authenticated
using (private.is_moderator((select auth.uid())));

revoke all on table public.moderation_case_statements from anon, authenticated;
grant select on table public.moderation_case_statements to authenticated;

create or replace function public.submit_moderation_case_statement(
  target_case_id uuid,
  member_statement text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor uuid := auth.uid();
  side text;
  case_status text;
  statement_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(member_statement)) < 10 then
    raise exception 'Statement must contain at least 10 characters';
  end if;

  select status into case_status
  from public.moderation_cases
  where id = target_case_id;

  if case_status is null then
    raise exception 'Moderation case not found';
  end if;
  if case_status in ('resolved', 'dismissed') then
    raise exception 'Pre-decision statements are closed after final disposition';
  end if;

  side := private.member_case_side(target_case_id, actor);
  if side is null then
    raise exception 'This member is not a party to the moderation case';
  end if;

  insert into public.moderation_case_statements (
    case_id, author_id, author_side, statement
  ) values (
    target_case_id, actor, side, trim(member_statement)
  )
  on conflict (case_id, author_id, author_side)
  do update set statement = excluded.statement, created_at = now()
  returning id into statement_id;

  return statement_id;
end;
$$;

revoke all on function private.member_case_side(uuid, uuid) from public;
grant execute on function private.member_case_side(uuid, uuid) to authenticated;

revoke all on function public.submit_moderation_case_statement(uuid, text) from public;
grant execute on function public.submit_moderation_case_statement(uuid, text) to authenticated;
