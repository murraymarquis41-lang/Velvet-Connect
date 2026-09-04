# Velvet Connect Build 03 Delta

Build 03 is the commit containing this document. Its direct parent must be the
certified baseline `16f82792a94cb6d6b1e46ac3c2d0aa9ce78b9860`. The immutable
Git tag `build-03` is the human-readable identity for that commit.

## Authorized scope

This delta implements only the approved milestone work:

1. moderation and administrator tooling;
2. adults-only enrollment controls; and
3. complete authenticated self-service account deletion.

VIP/subscription work is intentionally excluded.

## Product changes

- Enrollment collects date of birth, an explicit 18+ attestation, and policy
  consent. The browser rejects a date that has not reached the exact 18-year
  boundary.
- Newly onboarded profiles must carry a qualifying birth date and consent
  timestamps. Profiles predating this migration are grandfathered so the
  migration does not make the existing certified staging accounts invalid.
- Members can report and immediately disconnect from the visible profile.
- A role-gated moderation page exposes open cases only to active moderators.
- Moderation actions require a reason. Temporary suspension is available to
  moderators, reactivation requires safety-admin or CEO authority, and
  permanent suspension requires the CEO role.
- Affected members can submit an appeal. A safety administrator or CEO who was
  not the original case assignee must independently uphold or overturn it.
- Settings contains typed-confirmation account deletion.

## Database and security changes

Migration `20260831000100_build_03_moderation_enrollment_deletion.sql` adds:

- adult-enrollment fields and a database constraint;
- account safety status enforced in discovery, matches, and messaging RLS;
- moderator roles, moderation cases, immutable actions, and appeals;
- automatic human-review queue creation and immediate reporter-side blocking;
- explicit moderator access to case subjects and report details;
- `moderate_case`, `submit_moderation_appeal`, and `delete_own_account` RPCs;
- CEO-only permanent enforcement; and
- revocation of refresh sessions followed by deletion of the Auth user, which
  cascades through the existing user-owned application schema.

Moderation audit entries remain immutable but are de-identified on account
deletion: foreign keys to the removed report, subject, or staff account become
null while the non-user-owned action record remains available for governance.

Photo Storage upload is not enabled in this release slice. When physical upload
is activated, deletion must be extended through the Supabase Storage API (or a
privileged server endpoint that calls it); direct SQL deletion from
`storage.objects` is intentionally prohibited because it would orphan files.

No service-role or other secret is committed.

## Verification contract

Before the `build-03` tag is assigned, the candidate must pass from a clean
dependency install:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build` with staging public environment variables
6. `npm audit --audit-level=high`
7. `git diff --check`
8. direct-parent verification against the certified baseline

These checks certify the repository delta and reproducible browser build. They
do not claim that the new migration has been deployed, that live staging E2E
has passed, or that the public production-verification site has been updated.
Those remain separate deployment gates.
