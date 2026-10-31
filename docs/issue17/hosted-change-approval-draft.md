# Issue #17 / PR #21: hosted change approval packet (DRAFT)

**Status: NO-GO. This is a request for approval, not an approval.** No hosted schema or Storage change, deployment, merge, tag, enrollment, or certification is authorized by this document. Independent security and privacy review is still required.

- Repo: `murraymarquis41-lang/Velvet-Connect`. PR #21 (draft), candidate head `cc082b0`. Before apply, record the full 40-character SHA.
- Sources: `docs/issue17/hosted-change-approval.md`, `docs/issue17/remaining-proof-matrix.md`, `supabase/migrations/`.

## 1. Change summary
Adds two-sided moderation case statements, private evidence attachments, 30-day retention and cleanup, and independent appeals:
- A neutral listing of a member's own cases. It hides the reporter's identity, the report text, and the other party's statement. The assigned moderator invites a response.
- Statements and evidence can be read only by their author, the active assigned reviewer, or an independently assigned appeal reviewer.
- Private evidence uploads: reservation-bound, at most 5 per party per case, PNG/JPEG only, 1 B to 5 MiB, no overwrite or upsert, no signed URLs.
- Sanctions are tracked per action. Appealed decisions are snapshotted, self-review is blocked, unrelated sanctions are kept, and unmapped historical appeals fail closed.
- A CEO-only rule for overturning permanent suspensions is kept (reconciled with #26 / F-05).

## 2. Target
- **Staging only:** `qqintbwoalvoegvqoxlo` (Velvet Connect Staging, ca-central-1, PG 17.6), `https://qqintbwoalvoegvqoxlo.supabase.co`. Identity was verified read-only on 2026-10-11.
- **Excluded:** `rrtxdzwfudlqbcticmlp` (public verification) and production. Neither gets any change.
- Staging currently has `moderation_case_statements` but not `moderation_evidence`.

## 3. Migrations, tables, bucket, policies
Migrations to apply in order, after checking the hosted ledger first:
1. `20261011181907_issue_17_evidence_and_appeal_controls.sql`: the main change, transactional. It aborts before any DDL if historical sanctions are unreconciled.
2. `20261021192300_f05_f10_permanent_appeal_and_deletion_hold.sql` (#26). **Already applied:** F-05 is already applied to hosted, so it is not part of this approval. Confirm it is in the hosted ledger before applying migration 3.
3. `20261030223000_issue_17_reconcile_permanent_appeal_review.sql`: restores the issue-17 independence checks after F-05.

> The older packet names only migration 1 as "the sole new migration". That is out of date for head `cc082b0` and has to be resolved before approval.

Do **not** reapply `20260921040000`. Hosted already has it as `20260926024046_grant_rls_least_privilege`.

**Tables:** `public.moderation_evidence`, `private.evidence_policy`, `private.evidence_deletion_queue`, `private.case_sanctions`, `private.appeal_decisions`.

**Bucket:** created through the Storage API, not SQL: `moderation-evidence` with `public:false`, `fileSizeLimit:5242880`, `allowedMimeTypes:['image/png','image/jpeg']`. If the bucket already exists, verify these settings and abort on any mismatch. Do not touch `profile-photos` or any other bucket.

**Policies:**
- `storage.objects`: "Upload reserved case evidence" (insert) and "Read authorized retained case evidence" (select). Both are for authenticated users only.
- `moderation_evidence`: "Retained evidence metadata for author or assigned reviewer".
- `moderation_case_statements`: "Retained statements for author or assigned reviewer".
- `reports`: "Assigned reviewers view report details".
- `moderation_appeals`: "Assigned independent reviewer views appeals".

**RPCs:**
- Public: `list_my_moderation_responses`, `request_moderation_case_response`, `reserve_/finalize_moderation_evidence`, `request_moderation_evidence_deletion`, `claim_moderation_appeal`, `list_moderation_appeal_queue`.
- Service role only: `list_/ack_moderation_evidence_purge`, `purge_expired_moderation_statements`.
- All are SECURITY DEFINER with an empty `search_path` and with PUBLIC/anon execute revoked. Reviewers must accept these boundaries.

## 4. Uploads off by default
The migration leaves `private.evidence_policy.uploads_enabled = false`. Turn it on (`update private.evidence_policy set uploads_enabled=true where singleton;`) only once retention is accepted **and** the cleanup schedule with alerts is running. Turning it on is a separate approval step. No Auth, production, or enrollment configuration changes.

## 5. Privacy notes: 30-day retention (APPROVED)

**Privacy sign-off:** Approved by Rashaad Murray (Rashaad.murray1@icloud.com), email reply "Approved" with no conditions, Sat Oct 31, 2026 3:18:58 PM EDT (Gmail thread "Privacy sign-off request: Velvet Connect Issue 17 evidence/statement retention (30 days)"). Scope: the 30-day statement/evidence retention and deletion rules and caveats in this section. Uploads remain disabled until D; production remains NO-GO.
- Statements expire 30 days after first submission, and edits do not extend that. Existing statements expire at `created_at` + 30 days.
- Evidence expires 30 days after reservation, whatever the case outcome. Reservations not finalized within 15 minutes are cleaned up. There is no automatic legal hold.
- Expired content and content with a deletion request becomes unreadable at once. Bytes are deleted by the Storage API purger: `scripts/purge-moderation-evidence.mjs`, every 15 minutes, a 1-hour retry window, plus an orphan sweep.
- If either party deletes their account, their statements are removed and evidence keys are queued for deletion. The audit trail stays under the existing rules.
- Limits: no malware scan, no EXIF scrubbing, no content moderation. Files people have already downloaded cannot be revoked.
- The reviewer must decide on: the 30-day period, how early deletion affects open cases and appeals, audit, backup and provider retention, legal preservation, and existing report text.

## 6. Risk
| Risk | Mitigation |
|---|---|
| SECURITY DEFINER RPC misuse | Empty search_path, explicit auth checks, revoked anon execute, independent review |
| Evidence leak through Storage | Private bucket, reservation-bound policies, no signed URLs, check that no unrelated permissive policy covers it |
| Migration fails on legacy sanctions or appeals | Fails before DDL. Reconcile counts first, with no silent backfill |
| Bytes kept after "deletion" | Expiry blocks reads; purger acknowledges only after the Storage API delete; failures alert |
| Migration ordering or ledger drift (§3) | Diff the hosted ledger before apply; apply only the named files |
| Wrong project | Recheck the project ID immediately before every step |

## 7. Rollback (containment plus forward fix; never drop populated tables)
1. `update private.evidence_policy set uploads_enabled=false where singleton;`
2. If needed, drop only the two new `storage.objects` evidence policies. The bucket stays private.
3. Revoke authenticated EXECUTE on the reserve, finalize, request-response, and statement RPCs, and record each revoke.
4. Keep cleanup running. Remove objects only through queued keys and the Storage API, never with a direct `storage.objects` delete.
5. Revert the frontend only under a separately authorized deploy. Do not restore the old mutable-assignee appeal logic.
6. Keep the ledger and evidence. Fix with a new reviewed forward migration and rerun the exact-SHA tests.

## 8. Proof plan
**Before apply:**
- Confirm the SHA.
- Take a schema, grant, and advisor snapshot (no member content).
- Get counts of sanctions and pending appeals, and reconcile them.
- Get sign-off from the security and privacy reviewers.

**Apply, then verify:**
- Ledger entry and SQL hash.
- Bucket settings.
- That the policies cover only `moderation-evidence`.
- RLS, grants, and advisors.

**Hosted synthetic suite:**
- Run with `ISSUE17_HOSTED_APPROVED=true` and `ISSUE17_SOURCE_SHA=<full SHA>`.
- Use synthetic accounts only. Member actions go through authenticated publishable clients; no service-role stand-ins.
- Keep the raw JSON, run/job/artifact IDs, cleanup results, and a byte-deletion proof.

**Human browser QA:**
- Reported-member notice, both statement screens, the moderator queue and evidence, the independent appeal UI, and accessibility.
- Local browser QA has **not** passed yet.

**Current local evidence:** 15 SQL/RLS scenarios, 3 purger contract tests, 7 purge-health tests, 5 Vitest tests, plus lint, typecheck, and build pass. Hosted proof so far is limited to the staging purge run and CI listed in the status section below.

## 9. Approval requested (separately, in order)
- [x] A: Security/privacy design and the 30-day retention — done. Retention privacy-approved by Rashaad Murray, 2026-10-31 3:18:58 PM EDT (no conditions).
- [x] B: Apply migrations (§3 list, finalized) and create the bucket on `qqintbwoalvoegvqoxlo` — done (migrations + private bucket).
- [ ] C: Cleanup worker schedule and alerts — partial: schedule on, first manual run PASS, alerts are email-only. Not fully done.
- [ ] D: Set `uploads_enabled=true` in staging — open (still false).
- [ ] E: Run the hosted synthetic suite and human QA — open.

None of these authorizes a merge, a tag, enrollment, production, or closing #17.

## Status as of 2026-10-31 (PR #21 head `024fa3e` before this docs commit)
- Staging `qqintbwoalvoegvqoxlo` only. Applied: `issue_17_evidence_and_appeal_controls`, `issue_17_reconcile_permanent_appeal_review`, `issue_17_evidence_purge_stats`. Private `moderation-evidence` bucket (PNG/JPEG, 5 MB) exists.
- `private.evidence_policy.uploads_enabled` remains **false**.
- First manual purge run [41231229423](https://github.com/murraymarquis41-lang/Velvet-Connect/actions/runs/41231229423): purge PASS (`removed:0`), health PASS (queue 0, overdue 0, orphans 0).
- `*/15` schedule is live on `main` (#31); scheduled runs skip and delete nothing until PR #21 lands. Alerts are GitHub failed-run email only.
- CI at `024fa3e`: CI, WP-01B, Issue 17 draft proof, Authenticated synthetic E2E all passed. `complete-hosted-proof` not yet run.
- Production remains **NO-GO**.
