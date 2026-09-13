# Build 03 Supabase Staging Evidence — 2026-09-11

Status: **CAPTURED — release gates remain open**

## Project identity

| Purpose | Project | Evidence |
| --- | --- | --- |
| Authoritative authenticated Build 03 staging | `qqintbwoalvoegvqoxlo` — Velvet Connect Staging | Connected project list; `.github/workflows/e2e-synthetic.yml` target |
| Enrollment-paused public verification backend | `rrtxdzwfudlqbcticmlp` — Velvet Connect | `.github/workflows/pages.yml` and `.github/workflows/release-smoke.yml` |

These are separate projects. Evidence from `rrtxdzwfudlqbcticmlp` must not be used as
proof of the Build 03 staging schema.

## Fresh authoritative staging evidence

Captured through read-only management and SQL access on 2026-09-11 UTC:

- Project status: `ACTIVE_HEALTHY`.
- Applied migration ledger: 14 entries, from
  `20260813004637_build_03_base_schema` through
  `20260905184459_issue_17_case_statement_rpc_privilege_hardening`.
- Required tables present: `profiles`, `reports`, `blocks`,
  `moderator_roles`, `moderation_cases`, `moderation_actions`,
  `moderation_appeals`, and `moderation_case_statements`.
- RLS is enabled on all listed tables. FORCE RLS is enabled on
  `profiles`, `moderation_cases`, `moderation_actions`,
  `moderation_appeals`, and `moderation_case_statements`.
- The five exposed Build 03 RPCs are SECURITY DEFINER with an empty search path,
  callable by `authenticated`, and not callable by `anon`:
  `delete_own_account`, `moderate_case`, `review_moderation_appeal`,
  `submit_moderation_appeal`, and `submit_moderation_case_statement`.
- Persistent Auth users: zero.
- Persistent moderator-role rows: zero.

## Fresh advisors

Security advisor:

- Five WARN findings:
  `authenticated_security_definer_function_executable`, one for each exposed
  Build 03 RPC above.
- These warnings remain subject to independent human security/privacy review;
  this record does not accept or waive them.
- Remediation reference:
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Performance advisor:

- One INFO unindexed foreign key:
  `moderation_case_statements_author_id_fkey`.
- Four INFO unused indexes.
- One WARN for multiple permissive authenticated SELECT policies on
  `moderation_case_statements`.
- Remediation references:
  https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
  and
  https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## Gate impact

- Supabase management access and fresh evidence capture are complete.
- CEO moderator provisioning remains blocked because no verified persistent CEO
  Auth identity exists in authoritative staging.
- Clean repository migration reconstruction remains open.
- Independent human security/privacy acceptance remains open.
- PR #15 remains draft; enrollment remains closed; beta/production release
  remains unauthorized; the `build-03` tag remains untouched.
