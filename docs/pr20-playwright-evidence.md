# PR #20 reproducibility and evidence register

Status: draft-only working paper. This browser check does not certify a release or authorize enrollment.

## Clean local checkout

Use Node 22 and npm 11.9.0, as declared in `package.json`. `package-lock.json` is committed; use `npm ci`, not an unlocked `npm install`. The manifest range `@playwright/test: ^1.55.1` resolves to `1.63.0` in the current lockfile, along with `playwright` and `playwright-core` at `1.63.0`. Browser binaries and system libraries are installed separately.

```sh
npm ci
npm run test:e2e:install
VITE_APP_ENV=staging VITE_ENABLE_ENROLLMENT=false \
  VITE_SUPABASE_URL=https://example.invalid \
  VITE_SUPABASE_PUBLISHABLE_KEY=local-preview-only-key \
  npm run test:e2e:account -- --grep "enrollment paused"
```

The Playwright web server first runs `npm run build`, then `vite preview` on `127.0.0.1:4173`. The local base URL is `http://127.0.0.1:4173/Velvet-Connect/`, matching `vite.config.ts`. The nonfunctional public configuration above is for the unauthenticated, enrollment-paused cases only; it cannot prove staging authentication. A separate manual build, if desired, must set `VITE_APP_ENV=staging` and `VITE_ENABLE_ENROLLMENT=false` before `npm run build`, because Vite embeds these values in the output.

The PR workflow checks out the exact PR head, uses Node 22, runs `npm ci`, installs Chromium and WebKit, records versions, and runs only the five enrollment-paused cases on both configured projects. It stores the HTML report and failure traces for 14 days. Record the resulting run URL, SHA, passed/failed/skipped counts, and defects here after it completes.

## Evidence boundaries

| Evidence item | Status | What remains |
| --- | --- | --- |
| Manifest and lockfile | Present at original head `c174bc3547aea3b57f685cbce1cd7320a5ec4444` | Verify `npm ci` on the updated exact SHA. |
| Local enrollment-paused browser run | Pending on updated SHA | Capture commands, build environment, browser versions, results, logs, and defects. |
| Authenticated staging login | Open | Pre-provision synthetic adult credentials, run against named staging deployment and exact source/build SHA, retain results. |
| Synthetic signup | Gated off | Separate authorization and isolation are required before any temporary synthetic-only enablement; no real users. |
| Age assurance and broader safety flows | Open | The draft spec documents missing age control. Complete authenticated safety-flow and independent review evidence separately. |
| Release-gate closure | Open | The 18-item evidence package and founder decision remain separate. A passing local browser run does not close them. |

PR #20, PR #15, and PR #19 remain draft. Enrollment is zero. The `build-03` tag is unchanged. No merge, beta, production, deployment, or certification is authorized by this working paper.
