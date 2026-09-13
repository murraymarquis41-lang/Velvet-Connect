# Build 03 Security Exception Record

Status: pending authenticated QA and independent human security review

## Advisor finding

The Supabase security advisor reports four `0029` warnings because these
authenticated RPCs use `SECURITY DEFINER`:

- `delete_own_account`
- `moderate_case`
- `review_moderation_appeal`
- `submit_moderation_appeal`

These functions intentionally perform narrowly scoped operations that ordinary
table grants and row-level security do not authorize. Removing definer rights
without an equivalent privileged server boundary would break account deletion
or weaken the atomic moderation workflow.

## Compensating controls

Each RPC:

1. has an empty, fixed `search_path`;
2. uses fully qualified object references;
3. is revoked from `PUBLIC` and `anon`;
4. is granted only to `authenticated` (plus the platform service role);
5. derives the caller from `auth.uid()` rather than accepting an actor ID;
6. validates ownership or an active database-backed moderator role;
7. validates allowed actions and required reasons; and
8. writes moderation changes and immutable audit entries atomically where
   applicable.

The deletion RPC can delete only the calling user's account. The moderation
RPCs cannot grant roles. Permanent suspension is restricted to an active CEO
role, and appeal review requires a safety administrator or CEO who was not the
original case assignee.

## Required closure evidence

This exception is not approved for release until authenticated negative and
positive tests demonstrate the controls above and an independent human reviewer
accepts the design. Leaked-password protection is a separate Auth configuration
gate and is not covered by this exception.
