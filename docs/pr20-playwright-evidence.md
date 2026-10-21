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

The PR workflow checks out the exact PR head, uses Node 22 and npm 11.9.0, runs `npm ci`, installs Chromium and WebKit, records versions, and runs only the five enrollment-paused cases on both configured projects. It stores the HTML report and failure traces for 14 days.

## Observed PR check on `8dad9c7234c339a54c644c2b8bc9a2678cfa8b4c`

- [GitHub Actions run 36315809153](https://github.com/murraymarquis41-lang/Velvet-Connect/actions/runs/36315809153), [HTML report artifact](https://github.com/murraymarquis41-lang/Velvet-Connect/actions/runs/36315809153/artifacts/10930029820), retained 14 days.
- Exact checkout SHA: `8dad9c7234c339a54c644c2b8bc9a2678cfa8b4c`. Ubuntu 24.04, Node v22.23.2, npm 11.9.0, Playwright 1.63.0; Chrome for Testing 153.0.8010.12 (Chromium revision 1243) and WebKit 26.6 (revision 2359).
- Commands: `npm ci`; `npm run test:e2e:install`; `npx playwright --version`; `npm run test:e2e:account -- --grep "enrollment paused"`. The Playwright web server performed `npm run build` then `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
- Build environment: `VITE_APP_ENV=staging`, `VITE_ENABLE_ENROLLMENT=false`, `VITE_SUPABASE_URL=https://example.invalid`, and `VITE_SUPABASE_PUBLISHABLE_KEY=local-preview-only-key`. This check made no staging account request or real-user signup.
- Results: 10 passed, 0 failed, 0 skipped among selected tests (five cases each in Chromium desktop and WebKit mobile). No test defect surfaced in this run. The earlier draft assertion on canceled form submission and incorrect root navigation were corrected before this run.
- Local workspace: `npm ci`, lint, typecheck, two Vitest tests, and staging-disabled Vite build passed. Local browser installation did not complete because system-package permissions and browser download were restricted; the GitHub Actions browser result above is the browser evidence.

## Evidence boundaries

| Evidence item | Status | What remains |
| --- | --- | --- |
| Manifest and lockfile | Present at original head `c174bc3547aea3b57f685cbce1cd7320a5ec4444` | Verify `npm ci` on the updated exact SHA. |
| Enrollment-paused browser run | Done for the limited local-preview scope on `8dad9c7234c339a54c644c2b8bc9a2678cfa8b4c` | The evidence register itself is a later documentation commit; verify checks on its final SHA. This does not cover authenticated staging. |
| Authenticated staging login | Open | Pre-provision synthetic adult credentials, run against named staging deployment and exact source/build SHA, retain results. |
| Synthetic signup | Gated off | Separate authorization and isolation are required before any temporary synthetic-only enablement; no real users. |
| Age assurance and broader safety flows | Open | The draft spec documents missing age control. Complete authenticated safety-flow and independent review evidence separately. |
| Release-gate closure | Open | The 18-item evidence package and founder decision remain separate. A passing local browser run does not close them. |

PR #20, PR #15, and PR #19 remain draft. Enrollment is zero. The `build-03` tag is unchanged. No merge, beta, production, deployment, or certification is authorized by this working paper.
