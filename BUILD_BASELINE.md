# VELVET Connect Authoritative Build Baseline

Status updated: 2026-08-31

## Source of truth

The owner-controlled GitHub repository is now the authoritative source location for Velvet Connect engineering work:

- Repository: `murraymarquis41-lang/Velvet-Connect`
- Authoritative branch: `main`
- Repository owner has confirmed GitHub `push` and `admin` permission.
- The immutable baseline identifier is the full commit SHA of the commit containing this record. GitHub `main` may advance, so release and verification work must use that SHA rather than the branch name.
- The certified predecessor is commit `16f82792a94cb6d6b1e46ac3c2d0aa9ce78b9860`.

Scattered ZIP/build artifacts are reference/archive material only unless their contents are deliberately reconciled into this repository and committed to `main` (or merged through an approved pull request).

## Certified predecessor and Build 03 identity

Commit `16f82792a94cb6d6b1e46ac3c2d0aa9ce78b9860` is the certified predecessor used for the legitimate Build 03 milestone delta. It is not relabeled by the new work.

Build 03 is assigned only to the new direct-child commit carrying `BUILD_03_DELTA.md` and the immutable `build-03` Git tag. The tag, rather than a loose ZIP filename or a moving branch, is the human-readable build identity.

The Build 03 source includes:

- reproducible npm project metadata and `package-lock.json`
- Vite build configuration
- ESLint, TypeScript, Vitest, and CI quality-gate tooling
- GitHub Pages deployment workflow
- browser application source in `src/app.ts`
- Supabase client integration for staging authentication
- profile creation and persistence
- discovery and likes/swipes flows
- match and chat-facing application flows
- adults-only enrollment and policy-consent controls
- a role-gated human moderation queue with immutable action logs
- authenticated complete account deletion
- Supabase migration material under `supabase/migrations/`
- Supabase CLI/project configuration under `supabase/config.toml`

The Build 01 archive remains historical and must not replace or redefine this baseline.

## Supabase project identity

- Staging project reference: `qqintbwoalvoegvqoxlo`
- Public staging URL used by the committed client: `https://qqintbwoalvoegvqoxlo.supabase.co`
- Client uses a Supabase publishable key only; service-role/admin secrets must never be committed.
- Repository configuration: `supabase/config.toml`

## Production verification identity

- Production project reference: `rrtxdzwfudlqbcticmlp`
- Production public API URL: `https://rrtxdzwfudlqbcticmlp.supabase.co`
- GitHub Pages production builds receive the production URL and publishable key through explicit Vite build variables.
- Public enrollment remains fail-closed through `VITE_ENABLE_ENROLLMENT=false` until the remaining release gates are verified. The production verification build may identify the production environment and allow existing authorized users to sign in, but it must not open new-user enrollment while the gate is false.
- Staging and production project identities must never be hard-coded interchangeably in browser source.

## Migration completeness

GitHub contains the recovered foundational schema, the follow-up onboarding migration, and the Build 03 milestone migration:

- `supabase/migrations/20260813004637_build_03_recovered_live_schema.sql`
- `supabase/migrations/20260825000100_enable_staging_profile_onboarding.sql`
- `supabase/migrations/20260831000100_build_03_moderation_enrollment_deletion.sql`

The foundational migration defines the committed profiles, profile photos, swipes, matches, messages, blocks, reports, supporting functions/triggers, grants, and row-level-security policies. A clean-database reconstruction still requires an independent migration replay against a disposable Supabase project before reconstruction can be certified.

## Build 04 status

No repository or supplied-archive evidence inspected on 2026-08-29 establishes a distinct completed Build 04 source baseline. The supplied archive is Build 01-era source and does not contain a dependency lockfile, Supabase migrations/configuration, or deployment workflow, so it remains historical evidence only. Build 04 must receive its own commit/merge identity and pass the required engineering, staging, and release gates before this document is updated to designate it authoritative.

## Verification at baseline creation

The baseline was prepared from a clean clone and checked with Node 24.19.0 and npm 11.9.0 using:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

Passing these local engineering gates establishes repository build reproducibility. It does not by itself certify live Supabase behavior, deployment completion, clean-database reconstruction, Build 04 completion, or production release authorization; those remain governed by their dedicated workflows and approval gates.

## Baseline rule going forward

1. All application source changes must be committed to this repository.
2. `package-lock.json` must change in the same reviewed change whenever npm dependency resolution changes.
3. Every Supabase schema/RLS/function change must be represented by a committed migration.
4. Supabase configuration must remain committed without secrets.
5. CI must pass the repository's required engineering gates before a new build is declared authoritative.
6. Build labels (Build 03, Build 04, etc.) must map to a specific Git commit or release/tag, not a loose ZIP filename.
7. External build archives are historical evidence or handoff artifacts; they are not the source of truth.
