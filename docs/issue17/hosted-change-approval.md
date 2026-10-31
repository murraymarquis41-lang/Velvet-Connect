# Issue 17 hosted-change approval packet — DRAFT

NO-GO. No hosted schema/Storage changes, deployment, merge, enrollment, tag movement, or release certification are authorized by this document. PR15 remains draft. Independent security/privacy review is still required. Current founder authorization permits implementation and synthetic QA, with hosted changes held for separate approval.


## Current status as of 2026-10-31 (PR #21 head `024fa3e` before this docs commit)
Supersedes the "no hosted changes" wording above for staging only: staging changes below were separately approved and applied. Checklist: A done (30-day retention privacy-approved by Rashaad Murray, 2026-10-31 3:18:58 PM EDT, no conditions); B done; C partial (schedule on, alerts email-only); D and E open.
- Staging `qqintbwoalvoegvqoxlo` only. Applied: `issue_17_evidence_and_appeal_controls`, `issue_17_reconcile_permanent_appeal_review`, `issue_17_evidence_purge_stats`. Private `moderation-evidence` bucket (PNG/JPEG, 5 MB) exists.
- `private.evidence_policy.uploads_enabled` remains **false**.
- First manual purge run [41231229423](https://github.com/murraymarquis41-lang/Velvet-Connect/actions/runs/41231229423): purge PASS (`removed:0`), health PASS (queue 0, overdue 0, orphans 0).
- `*/15` schedule is live on `main` (#31); scheduled runs skip and delete nothing until PR #21 lands. Alerts are GitHub failed-run email only.
- CI at `024fa3e`: CI, WP-01B, Issue 17 draft proof, Authenticated synthetic E2E all passed. `complete-hosted-proof` not yet run.
- Production remains **NO-GO**.

## Exact target and parent

- Repository: murraymarquis41-lang/Velvet-Connect.
- Isolated branch: fix/issue-17-evidence-flow-2026-10-11.
- Parent source: 7a9ad09c803eace7c8be1687a28d98658b7f7a89 (draft PR19, including PR15 ancestry). Starting here preserves grant/FORCE RLS hardening already applied in staging; this does not certify or merge either PR.
- Intended hosted target: qqintbwoalvoegvqoxlo, Velvet Connect Staging, ca-central-1, PostgreSQL 17.6; read-only project/schema identity verified 2026-10-11.
- API: https://qqintbwoalvoegvqoxlo.supabase.co.
- Excluded backend: rrtxdzwfudlqbcticmlp, public verification. No changes to it.
- Existing hosted grant migration: 20260926024046_grant_rls_least_privilege. Do not reapply repository timestamp 20260921040000 just because the historical timestamp differs.
- Staging currently has moderation_case_statements and no moderation_evidence. New QA therefore cannot pass against its current schema.

## Proposed migration and policy scope

`supabase/migrations/20261011181907_issue_17_evidence_and_appeal_controls.sql` is the sole NEW migration. It runs in a transaction and fails before DDL if unresolved historical profile sanctions require reconciliation. Never silently backfill a multi-case enforcement ledger from one profile flag. Prior pending appeals lack the new immutable decision mapping and remain blocked until independently reconciled; they are not granted a legacy bypass.

The migration:

1. Creates neutral own-case listing and assigned-moderator response invitation; parties submit only in permitted open cases. The neutral listing excludes reporter identity, report text, and other-party statements.
2. Restricts retained statement and sensitive report/evidence reads to the author or active assigned case reviewer, plus an independently assigned pending-appeal reviewer. Assignment does not confer permanent-enforcement authority.
3. Creates private evidence reservations and forced-RLS metadata. Only author-bound, case-bound, pending reservations may upload. Five attachments per party/case, PNG/JPEG, 1 byte–5 MiB. No member overwrite/upsert or direct deletes. Storage reads are authenticated operations only; bearer signed URL generation is excluded.
4. Adds expiration enforcement, deletion requests, account/case deletion queueing, and service-only cleanup RPCs. Expired/deletion-requested content becomes unreadable before physical cleanup.
5. Captures sanctions per immutable action and snapshots the appealed decision actor/action privately. Reassignment cannot enable self-review. Overturning removes only the appealed sanction; unrelated sanctions remain effective. Historical unmapped appeals fail closed.
6. Leaves uploads disabled (`private.evidence_policy.uploads_enabled=false`). No production or enrollment configuration is changed. Local config uses PostgreSQL17 and disables signup; this is not a hosted Auth change.

New public RPCs: list_my_moderation_responses, request_moderation_case_response, reserve_moderation_evidence, finalize_moderation_evidence, request_moderation_evidence_deletion, claim_moderation_appeal, list_moderation_appeal_queue. New cleanup RPCs (service role only): list_moderation_evidence_purge, ack_moderation_evidence_purge, purge_expired_moderation_statements. Existing statement, moderation, submit/review appeal functions are revised. Privileged functions use an empty search_path, explicit authorization, and revoked PUBLIC/anon execution. Independent review must accept or remediate these SECURITY DEFINER boundaries.

## Retention decision — APPROVED 2026-10-31

Approved by Rashaad Murray (Rashaad.murray1@icloud.com), email reply "Approved" with no conditions, Sat Oct 31, 2026 3:18:58 PM EDT (Gmail thread "Privacy sign-off request: Velvet Connect Issue 17 evidence/statement retention (30 days)"). The proposal below is the approved text.

- New statements: 30 days from first submission; edits do not extend created_at/expires_at. Existing statements use their recorded created_at + 30 days.
- Evidence: 30 days from reservation, regardless of case outcome. Reservations older than 15 minutes without finalization enter cleanup. No automatic legal hold or indefinite extension.
- User evidence deletion: access is revoked immediately; bytes are removed by the next successful cleanup run.
- Either party's account deletion: associated case statements are removed; evidence metadata is removed and opaque object keys queued for Storage API deletion. Immutable audit is retained under the existing audit rules, outside this new material schedule.
- Purge runs every 15 minutes after separately approved scheduling. A queued key remains retryable for one hour to catch an upload/deletion race; cleanup does not claim success for bytes based only on metadata deletion. An API-based orphan sweep also removes bytes with no evidence metadata, including late uploads after the retry window.
- Service outage: expiration still denies access; physical deletion is delayed until cleanup succeeds. Alert an operator on a failed run. Do not describe delayed bytes as already erased.
- Reviewer must assess the 30-day schedule, earlier deletion effects on open cases/appeals, audit retention, backups/provider retention, legal preservation requirements, and existing initial report text. Privacy approval recorded above (2026-10-31).

## Proposed hosted execution sequence — requires separate approval

1. Confirm exact candidate SHA from draft PR/evidence record. Recheck target ID and current migrations. Capture a privileged schema/grant/advisor snapshot WITHOUT exporting member content. Query counts of active sanctions/pending appeals only and reconcile blockers before proceeding.
2. Independent security/privacy reviewers accept the policy design and retention schedule or require changes. Freeze the chosen candidate again if code changes.
3. Apply ONLY the named new transactional migration to the verified staging project; preserve its ledger entry and SQL hash. No repository history rewriting.
4. Create a new bucket through Storage API using an authenticated project-admin/service context: `createBucket('moderation-evidence', { public: false, fileSizeLimit: 5242880, allowedMimeTypes: ['image/png', 'image/jpeg'] })`. If it already exists, verify those exact settings; abort on mismatch rather than overwriting unrelated configuration. Do not change profile-photos or other buckets.
5. Verify policies affect only moderation-evidence and no unrelated permissive policy permits evidence reads/writes. Verify actual object metadata shape, bucket limits, RLS, grants, helper availability, and advisors.
6. Verify the private cleanup worker `scripts/purge-moderation-evidence.mjs` with `SUPABASE_URL` fixed to staging and encrypted service credentials. It removes bytes through Storage API before acknowledging database cleanup. Schedule it every 15 minutes in an approved private scheduler with failure alerts; do not expose its key or add an automatic schedule until separately approved.
7. Only after retention acceptance and a working cleanup schedule, activate in staging: `update private.evidence_policy set uploads_enabled=true where singleton;`. Any schedule change must also enforce existing expiries; changing retention_days affects only future submissions.
8. Run the complete hosted synthetic suite with ISSUE17_HOSTED_APPROVED=true and ISSUE17_SOURCE_SHA set to the exact source SHA. Retain raw result JSON, workflow/run/job/artifact IDs, cleanup results, and advisor findings. Synthetic seeded accounts only; all member actions use authenticated publishable clients under RLS. Never use a service-role operation as a substitute for a member authorization proof.
9. Human browser QA checks reported-member notice, both statement screens, assigned moderator queue/evidence, independent appeal UI, and accessibility. Return all evidence for review. NO-GO remains; separate merge, tag, enrollment, and release decisions still required.

## Rollback / disable plan

No hosted changes have been made by this implementation task. After an approved apply, operational rollback is containment plus a forward correction, not destructive removal of populated tables/audit.

1. Disable new uploads: `update private.evidence_policy set uploads_enabled=false where singleton;`.
2. Remove only new evidence policies `Upload reserved case evidence` and `Read authorized retained case evidence` if containment is necessary. Keep the bucket private. Do not touch unrelated Storage policies.
3. Revoke authenticated EXECUTE on reserve/finalize/request-response/statement RPCs if the new submission path must be stopped; record every revoke. Preserve block/disconnect, independent appeals, CEO-only authority, audit, and retention cleanup.
4. Keep cleanup running with its restricted encrypted credential. If objects must be removed, enqueue their opaque keys and delete through Storage API, then acknowledge; do not delete storage.objects rows directly.
5. Revert only the new frontend build to the reviewed prior app source when a staging deployment is separately authorized. Do not restore the old mutable-assignee appeal function or global reactivation behavior.
6. Preserve the migration ledger and evidence. Repair using a new reviewed forward migration; rerun exact-SHA tests. Do not drop populated case/evidence/audit tables to simulate rollback.

## Known limitations requiring review

Client file validation and bucket MIME/size limits are not malware scanning, content moderation, or metadata stripping. Files are downloaded with authenticated authorization rather than rendered inline. Screenshots may contain EXIF or unrelated personal information; minimization guidance is shown, but no automated scrubbing is claimed. Downloaded files cannot be remotely revoked. Full hosted service tests and human review remain mandatory. Cleanup scheduling is live on staging only (alerts email-only, not accepted as complete); backup handling and historical appeal reconciliation are not yet deployed or accepted.
