# Issue 17 implementation and proof matrix

Draft implementation only. NO-GO. PR15 remains draft/unmerged; real-user enrollment closed; build-03 unchanged. Source identity must be the exact 40-character runtime SHA in the retained result/workflow record. No earlier PR head certifies this candidate.

| Control | Implementation on this branch | Local SQL evidence | Still required |
|---|---|---|---|
| Reporter privacy / immediate disconnect | Existing report trigger/block preserved; neutral own-case listing excludes reporter identity/report text | Report isolation, match removal, rejected messages, disconnect after statement/evidence | Hosted JWT reconnect and full browser regression |
| Reported-member statement | Assigned human moderator opens neutral response in Settings; own statement editor; party/open-case checks; no cross-party visibility | Invitation-before-submission, both sides, unrelated-member rejection, finalized-case rejection, direct writes denied | Apply approved migration; authenticated full-flow + human UI evidence |
| Evidence attachments | Private bucket configuration proposed; case/author reservations; 5 files, 5 MiB, PNG/JPEG; no upsert; metadata match at finalization; authenticated downloads; signed links denied | Author/case mismatch, bad type/size, random key, cross-party read, overwrite, anon RPC, quota | Create private bucket after approval; verify actual Storage API enforcement and file metadata; human security review |
| Moderator review | Active assigned moderator or assigned independent appeal reviewer sees permitted material; queue metadata separate from sensitive text | Two-party visibility, unassigned/inactive denial, independent reviewer access | Hosted role/JWT tests and human moderator interface QA |
| Retention/deletion | 30-day expiry (privacy-approved by Rashaad Murray 2026-10-31 3:18:58 PM EDT); edits preserve first timestamps; expired/requested files unreadable; author/party deletion queues keys; service-only API purger | Expiry denial, author deletion queue survival, member purge denial | Hosted migration/bucket done on staging; cleanup schedule live (alerts email-only); physical Storage deletion proof, backup/audit decisions |
| Human disposition | Existing human moderation and CEO-only permanent RPC guards retained | Non-CEO permanent denial and immutable audit | Hosted regression; severity-prioritization-only review |
| Independent appeals / other sanctions | Immutable appealed actor/action mapping; independent claim; action-specific sanction ledger; no global reset | Reassignment self-review denied; independent reviewer allowed; unrelated permanent sanction preserved | Hosted migration/QA, historical pending-appeal reconciliation, independent review |

## Current validation

- Local PostgreSQL 17.5 WASM (PGlite 0.3.14): 14 role/RLS/SQL scenarios passed. Minimal Auth/Storage tables and auth.uid()/operation fixtures are used. They do not prove actual Auth tokens, Storage service semantics, physical object deletion, hosted advisors, or browser interaction.
- Cleanup worker contract tests: 3 passed with API fixtures (due/orphan deletion, preserve live evidence, do not acknowledge failed byte deletion, and preserve orphans on metadata lookup failure). These do not replace hosted byte-deletion proof.
- Existing Vitest: 4 passed. Lint/typecheck and enrollment-paused Vite build passed. Dependency audit: 0 vulnerabilities after compatible transitive lockfile updates.
- Local browser attempt: Chromium download returned a truncated archive; browser QA is NOT passed. No screenshot or human UI result is invented.
- Read-only staging: target verified ACTIVE_HEALTHY, PostgreSQL17.6. Statements exist; moderation_evidence does not. No hosted changes were made.
- The full live suite is fail-closed until separate hosted activation approval, exact source SHA, and encrypted staging service credential are present. It seeds only synthetic users and exercises member requests via authenticated publishable clients, then removes synthetic accounts/files.
- `Issue 17 draft proof` workflow records local SQL proof and the existing authenticated baseline on a draft PR. The baseline tests existing staging controls only. Complete hosted proof is a separate approved manual job. A successful baseline does not close the new two-sided attachment flow.

## Review packet

See [hosted-change-approval.md](hosted-change-approval.md) for exact target, migration, private bucket settings, draft retention decision, staged activation, cleanup, and forward rollback/containment. Approval of this packet would not authorize deployment, merge, issue closure, tag movement, beta enrollment, production, or certification.
