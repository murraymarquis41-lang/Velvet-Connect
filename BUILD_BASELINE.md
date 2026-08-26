# VELVET Connect Authoritative Build Baseline

Status recorded: 2026-08-26

## Source of truth

The owner-controlled GitHub repository is now the authoritative source location for Velvet Connect engineering work:

- Repository: `murraymarquis41-lang/Velvet-Connect`
- Authoritative branch: `main`
- Repository owner has confirmed GitHub `push` and `admin` permission.
- Current application baseline inherited from merged commit: `eec33672586a916e2be93958f0aa5cb7cbc89278` (`WP-01C: add Supabase staging authentication and backend flows (#5)`).
- Supabase repository configuration added on 2026-08-26 in commit `d55d6b66bfd923c4bc40de958b332499f7cc260e`.

Scattered ZIP/build artifacts are reference/archive material only unless their contents are deliberately reconciled into this repository and committed to `main` (or merged through an approved pull request).

## Current MVP identity

The current repository implementation is the Build 03 / staging-MVP line, not a certified Build 04 baseline.

The committed source presently includes:

- reproducible npm project metadata and `package-lock.json`
- Vite build configuration
- ESLint, TypeScript, Vitest, and CI quality-gate tooling
- GitHub Pages deployment workflow
- browser application source in `src/app.ts`
- Supabase client integration for staging authentication
- profile creation and persistence
- discovery and likes/swipes flows
- match and chat-facing application flows
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

## Migration completeness warning

GitHub now contains the currently supplied migration file:

- `supabase/migrations/20260825000100_enable_staging_profile_onboarding.sql`

That migration is a follow-up authorization/onboarding migration. By itself it does **not** define the foundational `profiles`, `swipes`, `matches`, or messaging schema from an empty database. Therefore the repository is the authoritative source for the code that is currently available, but the database baseline is not yet fully reconstructable from GitHub alone until the foundational migration set exists in this repository and is tested.

No engineer should claim a clean-database rebuild is reproducible until that foundational migration set exists in this repository and is tested.

## Build 04 status

No repository evidence inspected on 2026-08-26 establishes a distinct completed Build 04 source baseline. Build 04 must receive its own commit/merge identity and pass the required engineering, staging, and release gates before this document is updated to designate it authoritative.

## Baseline rule going forward

1. All application source changes must be committed to this repository.
2. `package-lock.json` must change in the same reviewed change whenever npm dependency resolution changes.
3. Every Supabase schema/RLS/function change must be represented by a committed migration.
4. Supabase configuration must remain committed without secrets.
5. CI must pass the repository's required engineering gates before a new build is declared authoritative.
6. Build labels (Build 03, Build 04, etc.) must map to a specific Git commit or release/tag, not a loose ZIP filename.
7. External build archives are historical evidence or handoff artifacts; they are not the source of truth.
