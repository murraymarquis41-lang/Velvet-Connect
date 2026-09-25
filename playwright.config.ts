/**
 * Velvet Connect — Playwright config draft
 * Status: evidence-closure draft only. Does not authorize Early Access.
 *
 * Home in the application repo: playwright.config.ts at repo root.
 * Added to working branch chore/playwright-evidence-drafts only.
 * PR #15 remains draft. Enrollment remains off.
 *
 * Constraints:
 *   - Default baseURL is staging / local preview only.
 *   - Production URL is rejected unless VC_ALLOW_PRODUCTION_VERIFY=true
 *     and the run is an explicit verification slice (still not enrollment).
 *   - VITE_ENABLE_ENROLLMENT stays false unless VC_ALLOW_SYNTHETIC_SIGNUP=true.
 *   - No real-user accounts. No App Store. No merge of PR #15.
 */
import { defineConfig, devices } from "@playwright/test";

const LOCAL_PREVIEW = "http://127.0.0.1:4173";
const requestedBaseURL = process.env.VC_E2E_BASE_URL ?? LOCAL_PREVIEW;
const allowProductionVerify = process.env.VC_ALLOW_PRODUCTION_VERIFY === "true";

function assertNonProductionBaseURL(url: string): string {
  const productionLike =
    /govelvet\.co/i.test(url) ||
    /velvetconnect\.app/i.test(url) ||
    /production/i.test(url);

  if (productionLike && !allowProductionVerify) {
    throw new Error(
      "Playwright refused a production-like VC_E2E_BASE_URL. Early Access enrollment is closed. Use local preview or Velvet Connect Staging.",
    );
  }
  return url;
}

const baseURL = assertNonProductionBaseURL(requestedBaseURL);
const enrollmentEnabled = process.env.VITE_ENABLE_ENROLLMENT === "true";
const allowSyntheticSignup = process.env.VC_ALLOW_SYNTHETIC_SIGNUP === "true";

if (enrollmentEnabled && !allowSyntheticSignup) {
  throw new Error(
    "VITE_ENABLE_ENROLLMENT=true is blocked unless VC_ALLOW_SYNTHETIC_SIGNUP=true. Real-user enrollment remains 0.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }], ["list"]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    timezoneId: "America/New_York",
    locale: "en-US",
    colorScheme: "dark",
    ignoreHTTPSErrors: false,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  webServer: process.env.VC_E2E_BASE_URL
    ? undefined
    : {
        command: "npx vite preview --host 127.0.0.1 --port 4173",
        url: LOCAL_PREVIEW,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          VITE_APP_ENV: "staging",
          VITE_ENABLE_ENROLLMENT: allowSyntheticSignup ? "true" : "false",
        },
      },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],

  metadata: {
    project: "Velvet Connect",
    program: "Early Access evidence closure",
    enrollment: "0",
    recommendation: "NO-GO",
    environment: "staging-or-local-preview",
  },
});
