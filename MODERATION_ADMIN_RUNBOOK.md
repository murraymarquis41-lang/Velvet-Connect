# Moderation Administrator Runbook

The moderation UI is fail-closed. It appears only when the signed-in user's
UUID has an active row in `public.moderator_roles`.

## Provisioning

After the Build 03 migration is deployed, an authorized database administrator
must provision the initial CEO role through the Supabase SQL editor or another
trusted server-side administrative path. Never expose service-role credentials
to the browser.

```sql
insert into public.moderator_roles (user_id, role, active, granted_by)
values ('<CEO_AUTH_USER_UUID>', 'ceo', true, '<CEO_AUTH_USER_UUID>')
on conflict (user_id) do update
set role = excluded.role,
    active = excluded.active,
    granted_by = excluded.granted_by,
    granted_at = now();
```

Replace the placeholder with the exact Auth user UUID after verifying the CEO's
account in the Supabase Auth users panel. Do not use an email address or guess a
UUID.

Additional roles are `moderator` and `safety_admin`:

- `moderator`: claim, escalate, resolve, dismiss, and temporarily suspend;
- `safety_admin`: moderator rights plus reactivation and appeal review; and
- `ceo`: safety-admin rights plus permanent suspension.

Appeals must be decided by a safety administrator or CEO who was not the
original case assignee. Every case action and appeal outcome requires a reason
and is appended to `moderation_actions`.

## Deployment gate

Provision roles only after the migration has replayed successfully in an
isolated database and security advisors have been reviewed. Public enrollment
must remain disabled until live staging verification passes.
