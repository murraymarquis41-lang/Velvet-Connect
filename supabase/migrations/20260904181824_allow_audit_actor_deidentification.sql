-- Preserve immutable audit content while permitting the documented
-- de-identification caused by deleting an Auth user referenced as an actor.

create or replace function private.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null
     and new.actor_id is null
     and row(new.id, new.case_id, new.action, new.reason, new.created_at)
         is not distinct from
         row(old.id, old.case_id, old.action, old.reason, old.created_at)
  then
    return new;
  end if;

  raise exception 'Moderation audit records are immutable';
end;
$$;
