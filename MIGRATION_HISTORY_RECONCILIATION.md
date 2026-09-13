# Build 03 Migration-History Reconciliation

Status: **PARTIAL — clean PostgreSQL replay passed; Supabase-isolated advisor/E2E proof remains required**

This record reconciles the repository migration chain with the historical migration ledger in the authoritative Velvet Connect staging project without rewriting or deleting the staging ledger.

## Release control

- PR #15 remains draft and unmerged.
- Real-user enrollment remains closed.
- Beta/production release remains unauthorized.
- The `build-03` tag must not move until all release gates close.
- No staging migration-history rows are to be edited, deleted, or backfilled merely to make filenames match the repository.

## Why the histories differ

The repository intentionally contains `20260813004637_build_03_recovered_live_schema.sql`, reconstructed from the authoritative staging project on 2026-08-26. Its header states that it is a faithful current-schema reconstruction, not the original historical SQL text. Therefore the repository can be a reproducible schema lineage while the staging ledger remains the evidence of the actual historical application sequence.

## Current staging ledger -> repository canonical lineage

| Staging migration | Repository canonical equivalent | Reconciliation status |
| --- | --- | --- |
| `20260813004637_build_03_base_schema` | `20260813004637_build_03_recovered_live_schema.sql` | Folded into recovered baseline |
| `20260813004648_build_03_mobile_profile_photos` | `20260813004637_build_03_recovered_live_schema.sql` | Folded into recovered baseline |
| `20260813004655_build_03_safety_and_matching` | `20260813004637_build_03_recovered_live_schema.sql` | Folded into recovered baseline |
| `20260813004757_build_03_advisor_cleanup` | `20260813004637_build_03_recovered_live_schema.sql` | Folded into recovered baseline |
| `20260824223232_wp_01c_block_verification_gate` | `20260813004637_build_03_recovered_live_schema.sql` | Folded into recovered baseline; verify in isolated reconstruction |
| `20260825075452_enable_staging_profile_onboarding` | `20260825000100_enable_staging_profile_onboarding.sql` | Equivalent purpose; timestamp differs |
| `20260904000723_build_03_moderation_enrollment_deletion` | `20260831000100_build_03_moderation_enrollment_deletion.sql` | Equivalent purpose; timestamp differs |
| `20260904000815_build_03_staging_rpc_privilege_hardening` | `20260904000815_build_03_staging_rpc_privilege_hardening.sql` | Direct match |
| `20260904075719_grant_least_privilege_member_updates` | `20260904075719_grant_least_privilege_member_updates.sql` | Direct match |
| `20260904082031_build_03_performance_advisor_hardening` | `20260904082031_build_03_performance_advisor_hardening.sql` | Direct match |
| `20260904181824_allow_audit_actor_deidentification` | `20260904181824_allow_audit_actor_deidentification.sql` | Direct match |
| `20260905182323_trust_safety_reporting_triage` | `20260913233000_restore_admin_diagnostics.sql` | Historical delta identified as `public.admin_diagnostics()` and restored forward-only with staging-equivalent authorization and grants |
| `20260905184446_issue_17_two_sided_case_statements` | `20260905183500_issue_17_two_sided_case_statements.sql` | Equivalent feature; timestamp differs |
| `20260905184459_issue_17_case_statement_rpc_privilege_hardening` | Folded into `20260905183500_issue_17_two_sided_case_statements.sql` | Repository migration already revokes public access and grants authenticated EXECUTE; verify in isolated reconstruction |

## Current live-schema spot checks

Read-only staging inspection confirms the current definitions exist for:

- `public.moderate_case`
- `public.submit_moderation_appeal`
- `public.review_moderation_appeal`
- `public.delete_own_account`
- `public.submit_moderation_case_statement`

The current `submit_moderation_case_statement` implementation matches the repository Issue #17 design at the functional level: authenticated member check, party-to-case check, closed-case prevention, upserted statement, and SECURITY DEFINER execution with an empty search path.

This spot check is evidence of current-schema alignment only. It does **not** by itself prove that a clean database can be reconstructed from the repository migration chain.

## 2026-09-13 clean-replay evidence

A clean PostgreSQL 18.3 environment (PGlite 0.5.8) was initialized with only
the Supabase Auth role/schema prerequisites and then given every repository
migration exactly once, in filename order, from a working tree based on
`533102f00774ad17a35ac8ae4aee05e8f23a154e` plus the forward-only
`20260913233000_restore_admin_diagnostics.sql` reconciliation migration.

- All nine migrations applied without manual repair.
- The resulting 12 public tables and 25 public RLS policies match staging by
  name and command/role surface.
- Live comparison identified `public.admin_diagnostics()` as the sole missing
  function from the historical `trust_safety_reporting_triage` migration.
- The forward migration restores the live `SECURITY DEFINER`, empty
  `search_path`, CEO/safety-admin authorization checks, anonymous denial, and
  authenticated/service-role EXECUTE grants.
- Behavioral checks confirm CEO execution succeeds, a non-admin authenticated
  user is denied, anonymous EXECUTE is absent, and the Issue #17 migration
  retains authenticated-only RPC access.

The Supabase branch API was also attempted after an explicit $0.01344/hour
cost confirmation, but Supabase rejected branch creation because the
organization is on the Free plan. No paid branch was created. Consequently,
advisor and full Auth/E2E evidence against a clean Supabase branch remains open
and this record does not claim final reconstruction-gate closure.

## Remaining isolated-reconstruction gate

Before this gate can close:

1. Freeze and record the exact Build 03 candidate SHA containing the forward migration.
2. Replay that exact SHA in a full isolated Supabase environment when a Pro branch or equivalent disposable stack is available.
3. Rerun security/performance advisors and authenticated synthetic E2E against that isolated reconstruction.
4. Record the resulting evidence URLs and close this gate only if they pass.

## Prohibited reconciliation shortcuts

Do not:

- delete or rename rows in `supabase_migrations.schema_migrations` on staging;
- mark unapplied repository migrations as applied merely to make histories look identical;
- mutate historical migration files after they have been used as release evidence without resetting the certification candidate and rerunning all gates;
- treat filename equivalence as schema equivalence;
- close the gate until the unresolved reporting-triage delta is accounted for and a clean reconstruction succeeds.

## Decision rule

Migration-history reconciliation is complete only when the repository chain rebuilds the required Build 03 schema from clean state and the resulting security/function behavior is materially equivalent to staging, with any intentional differences documented. Staging's historical ledger remains preserved as historical evidence.
