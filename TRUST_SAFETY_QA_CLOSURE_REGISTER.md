# Velvet Connect Trust & Safety QA Closure Register

Status: ACTIVE — beta enrollment approval must not be requested yet
PR: #15 (must remain draft)
Enrollment: CLOSED to real users

## Closure sprint authorization

Authorized scope:
1. Correct the reporting flow.
2. Prepare age-assurance vendor requirements.
3. Run expanded authenticated QA.
4. Provision the CEO moderator account and complete authenticated human-role QA.
5. Obtain independent human security and privacy review.
6. Complete exact-SHA deployment verification.
7. Return the complete evidence packet to the CEO before requesting beta enrollment approval.

## Evidence register

| Gate | Current status | Evidence / next action |
|---|---|---|
| PR #15 remains draft | PASS | GitHub PR metadata shows draft=true. |
| Real-user enrollment closed | PASS / CONTROL | Production-verification build sets enrollment paused; no beta authorization granted. |
| Report creates human-review case | PASS | Database trigger queues a moderation case after report insert. |
| Report immediately disconnects pair | PASS | Database trigger creates a block; RLS prevents further discovery/match/message access. |
| Reporter-private report | PASS | Authenticated synthetic E2E verifies reported member cannot read reporter-private report. |
| Ordinary member cannot moderate | PASS | Authenticated synthetic E2E verifies unauthorized moderation RPC is rejected. |
| CEO-only permanent enforcement boundary | PASS (synthetic) | Authenticated synthetic E2E verifies safety-admin attempt at permanent action is rejected. |
| Independent appeal reviewer | PASS (synthetic) | Original case assignee cannot review appeal; separate safety reviewer can. |
| Immutable moderation audit | PASS (synthetic) | Update attempt against moderation audit is rejected. |
| Self-service deletion | PASS (synthetic) | Auth identity and profile deletion are verified by E2E. |
| Full two-sided safety statement/evidence workflow | OPEN | Current product supports reporter details and a later appellant statement, but not a complete pre-decision two-sided statement/evidence collection flow. Must be corrected/evidenced before beta. Secure screenshot/evidence storage is not currently enabled. |
| Age-assurance vendor requirements | COMPLETE (requirements only) | See `AGE_ASSURANCE_VENDOR_REQUIREMENTS.md`. No vendor is approved or integrated yet. |
| Expanded authenticated QA | PARTIAL PASS | Existing 12-step authenticated synthetic E2E passes. Add/report evidence for the corrected two-sided reporting flow and human CEO-role session before closure. |
| CEO moderator account provisioned | BLOCKED | Staging Supabase currently contains zero Auth users; there is no CEO Auth identity to grant `moderator_roles.role='ceo'`. Create CEO staging identity through Supabase Auth first; do not insert an Auth row directly in SQL. |
| CEO moderator authenticated human-role QA | BLOCKED | Depends on CEO staging Auth account provisioning. |
| Supabase security advisor | OPEN — HUMAN REVIEW REQUIRED | Four `authenticated_security_definer_function_executable` warnings remain for `delete_own_account`, `moderate_case`, `review_moderation_appeal`, and `submit_moderation_appeal`. These are deliberately privilege-checking RPCs but require independent human security/privacy acceptance or remediation. |
| Supabase performance advisor | INFO ONLY | Current findings are unused-index informational notices. Re-evaluate with representative traffic before removing indexes. |
| Independent human security review | OPEN | Reviewer must inspect exact final SHA, RLS, grants, privileged RPCs, admin-role provisioning, reporting/evidence flow, deletion, and deployment configuration. |
| Independent privacy review | OPEN | Reviewer must inspect data minimization, report/evidence retention, age-assurance data flow, deletion, logging, and vendor requirements. |
| GitHub Pages exact-SHA deployment | FAILING | Verify/build/artifact steps pass; deploy-to-Pages step fails. Release blocker tracked in issue #16. |
| Public exact-SHA release smoke | BLOCKED/FAILING | Public URL returns 404 while Pages deploy is unsuccessful. Smoke must verify final SHA and enrollment-paused metadata after deployment succeeds. |
| Build identity/tag reconciliation | OPEN | Final sprint changes move PR head beyond prior source-certification SHA. Reconcile the final Build 03 certification identity and `build-03` tag only after closure changes stop moving the head. |
| Beta enrollment approval | NOT REQUESTED | Must remain withheld until every required closure gate is evidenced and CEO receives the final packet. |

## Reporting-flow correction acceptance criteria

The corrected safety-reporting flow must preserve the controls that already pass and add the missing evidence/statement workflow without exposing reporter-private information.

1. Report submission immediately disconnects both accounts and blocks new discovery/match/message access.
2. Report is private to the reporter and authorized safety personnel.
3. Reporter can provide a structured statement and, once secure evidence storage is implemented, supporting screenshots/evidence.
4. Reported member can provide an independent statement through a neutral case-response flow without receiving the reporter's private statement or identity unless policy/legal review explicitly permits it.
5. A moderator can see both permitted statements/evidence in the review queue.
6. Automated severity/routing may prioritize cases but cannot impose permanent enforcement.
7. Every human moderation action requires a reason and remains auditable.
8. Appeals remain independently reviewed by someone other than the original case assignee.
9. Retention/deletion rules for report evidence are documented and privacy-reviewed.
10. Authenticated QA demonstrates the complete flow under RLS with synthetic data.

## Independent security/privacy review packet — minimum questions

### Security
- Can any ordinary authenticated user read moderation cases, actions, appeals, roles, or another member's private report?
- Can any ordinary authenticated user invoke privileged RPC behavior beyond what the function's internal authorization permits?
- Are the four SECURITY DEFINER RPCs narrowly scoped, search-path hardened, authorization checked, and safe against parameter abuse/replay?
- Are moderator and CEO role grants least-privilege and auditable?
- Does report-and-disconnect remain effective across discovery, matches, and messages?
- Are deletion and audit de-identification behaviors consistent and non-bypassable?

### Privacy
- Are report statements/evidence minimized and access-controlled?
- Are evidence retention and deletion periods justified and documented?
- Does account deletion remove or de-identify data according to the approved policy while preserving only justified immutable safety/audit records?
- Does age assurance return/store only the minimum eligibility assertion and audit metadata?
- Are age-assurance documents/biometrics prohibited from secondary use and deleted promptly under the vendor contract?
- Are logs free from unnecessary sensitive identity, report, biometric, or document data?

## Closure rule

Do not mark Build 03 release-certified, merge PR #15, open real-user enrollment, or request beta enrollment approval until the final exact SHA has: passing engineering/authenticated QA; completed reporting-flow correction; CEO-role human QA; accepted independent security/privacy review; successful exact-SHA deployment and public smoke; and reconciled build identity/tag evidence.
