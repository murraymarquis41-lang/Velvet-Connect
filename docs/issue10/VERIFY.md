# Verify Issue #10 without touching existing hosted databases

Draft only; freeze a new exact source SHA before recording verification.
Use Supabase CLI 2.119.0, PostgreSQL major 17, synthetic accounts/data only.
Do not link this checkout or use `--linked`, a hosted DB URL or `db push`.

## Disposable full platform

The preparation script requires a NEW absolute directory outside the repo:

```bash
node scripts/issue10/prepare-isolated.mjs /absolute/new/issue10-local
supabase --workdir /absolute/new/issue10-local stack start --help
supabase --workdir /absolute/new/issue10-local stack start --runtime native --eager --exclude studio,functions,analytics,pooler,mail
supabase --workdir /absolute/new/issue10-local db reset --help
supabase --workdir /absolute/new/issue10-local db reset --local --no-seed
```

CLI `stack` is experimental. Consult its installed help before execution.
On root-only Linux runtimes, use a supported existing non-root account through
`SUPABASE_NATIVE_POSTGRES_USER`; Postgres cannot initialize as root or nobody.
Scope `SUPABASE_HOME` to the disposable workspace. Do not print or retain local
secret keys in the founder packet. Record archive download failures or runtime
incompatibilities rather than substituting platform stand-ins as a full pass.

The separate config disables normal/email signup and anonymous sign-in, uses a
local site URL/project identity and PostgreSQL 17. The original hosted-oriented
config and all existing environments remain unchanged. Record the exact actual
engine version. Provision synthetic logins only inside this disposable local
stack via its local administrative API, with signup still disabled.

Retain full migration logs, catalog/effective grants, advisor dispositions and
actual JWT/API tests for matching/messaging/blocking/reporting/roles. Verify
Storage upload/read/update/delete/upsert, eligibility, blocks, wrong-folder and
anonymous denial, MIME/size limits through the real Storage API. Clean up only
the disposable local stack with its recorded identity. No paid branch/service.

## Policy compatibility fallback

Install pinned `@electric-sql/pglite@0.5.8` into a separate scratch tools folder,
then point `ISSUE10_PGLITE_MODULE` at its absolute `dist/index.js` path:

```bash
ISSUE10_PGLITE_MODULE=/absolute/tools/node_modules/@electric-sql/pglite/dist/index.js node scripts/issue10/replay.mjs /absolute/evidence-output
```

The fixtures declare reduced Auth/Storage platform fields solely to exercise
SQL policies. Every application object comes from repository migrations.
`auth.uid()` and `storage.foldername(text)` definitions were captured from
staging. These tests do not implement real Auth/Storage services or certify
PostgreSQL 17. Nonzero exit means at least one migration/check failed.

Full platform limitations, original diagnostics provenance, platform default
ACLs and any other release findings remain explicit blockers in the founder
packet. All existing PRs remain draft/unmerged, enrollment zero, build-03 fixed.

Sources: [native runtime](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes),
[local stacks](https://supabase.com/docs/guides/local-development/running-multiple-local-projects),
[Storage access](https://supabase.com/docs/guides/storage/security/access-control).
