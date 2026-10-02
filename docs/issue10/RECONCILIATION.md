# Issue #10 — corrected migration provenance

Draft remediation from `7a9ad09c803eace7c8be1687a28d98658b7f7a89`.
Authoritative project: `qqintbwoalvoegvqoxlo`; read-only recapture October 2, 2026.
Not certification. Historical SQL and hosted migration-history rows are preserved.

| Hosted history | Repository coverage |
| --- | --- |
| `20260813004637_build_03_base_schema` | Recovered baseline plus Issue #10 Storage recovery. |
| `20260813004648_build_03_mobile_profile_photos` | Baseline/photo objects plus Storage recovery. |
| `20260813004655_build_03_safety_and_matching` | Baseline safety/matching plus recovered trigger and internal ACLs. |
| `20260813004757_build_03_advisor_cleanup` | Baseline indexes/configuration; managed platform defaults need full-stack comparison. |
| `20260824223232_wp_01c_block_verification_gate` | Baseline eligibility helper/policies plus recovered eligible Storage read policy. |
| `20260825075452_enable_staging_profile_onboarding` | Repository `20260825000100` equivalent SQL, different timestamp. |
| `20260904000723_build_03_moderation_enrollment_deletion` | Repository `20260831000100` equivalent SQL, different timestamp. |
| `20260904000815_build_03_staging_rpc_privilege_hardening` | Same repository version/name. |
| `20260904075719_grant_least_privilege_member_updates` | Same repository version/name. |
| `20260904082031_build_03_performance_advisor_hardening` | Same repository version/name. |
| `20260904181824_allow_audit_actor_deidentification` | Same repository version/name. |
| `20260905182323_trust_safety_reporting_triage` | `20261002224814_issue_10_recover_triage_trigger_privileges.sql`, critical coercion/sexual-image-abuse queue. **Not admin diagnostics.** |
| `20260905184446_issue_17_two_sided_case_statements` | Repository `20260905183500` equivalent SQL, different timestamp. |
| `20260905184459_issue_17_case_statement_rpc_privilege_hardening` | Repository PUBLIC revocation/authenticated-only grant denies anonymous EXECUTE in the compatibility harness; full platform defaults require retest. |
| `20260914222204_build_03_moderation_statement_policy_index_hardening` | Same repository version/name. |
| `20260926024046_grant_rls_least_privilege` | Repository `20260921040000` equivalent SQL, different timestamp. |

Equivalent SQL here means ordered text alignment after removing line comments
and normalizing whitespace/case; not byte identity or full certification.

The recovered baseline is unchanged from recovery commit
`c88f9d39388f86efc90a33b7adccc5014671f1d7`; it is a reconstruction, not original
historical SQL. Its previously claimed complete coverage was disproven by
missing Storage definitions and trigger/privilege differences.

The preserved historical `20260913233000_restore_admin_diagnostics.sql` header
wrongly attributes diagnostics to reporting triage. Its body matches current
staging, but no corresponding diagnostics ledger entry was returned. Original
diagnostics provenance remains unresolved. Do not invent an application event.

## Forward deltas and boundaries

`20261002224814_issue_10_recover_triage_trigger_privileges.sql` recovers the
actual queue body, `UPDATE OF liked` trigger, owner-only EXECUTE on the two
internal functions and authenticated USAGE on private. It does not duplicate
broad platform default grants, change policy predicates or open enrollment.

`20261002224816_issue_10_recover_profile_photo_storage.sql` recovers actual
private bucket settings and four application policies. It requires managed
Storage tables/functions and does not synthesize them. The eligible policy
uses the existing verified/onboarded/active/unblocked discovery helper.

Service-role/default-ACL differences and redundant profile column INSERT
entries are not blindly copied. Compare effective permissions on a full
matching platform before deciding whether another application delta is needed.

`supabase/config.issue10-isolated.toml` is separate from the hosted-oriented
config: local project identity, PostgreSQL major 17, signup/email signup and
anonymous sign-ins disabled. No hosted configuration is changed.

## Evidence limits

The old September 13 PGlite claim that diagnostics was the sole reporting-triage
delta was incorrect. The October 2 base replay applied 11 migrations and
passed 23 sampled checks, with two critical-triage failures. Neither result
certifies a new commit or a full Supabase reconstruction.

The founder packet must record the new exact SHA, immutable migration hashes,
full logs, schema/ACL comparisons, synthetic results and any runtime blocker.
PGlite platform stand-ins do not prove Auth/JWT/API, Storage object-service,
advisor or full PostgreSQL 17 behavior. Keep issue #10 open until the full gate
passes and the founder separately approves closeout.

PRs #15/#19/#20 stay draft/unmerged; enrollment stays zero; build-03 unchanged.
No existing hosted database apply, merge, spending, certification or release.
