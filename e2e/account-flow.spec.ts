/**
 * Velvet Connect — Playwright draft for account flow
 * Status: evidence-closure draft only. Does not authorize Early Access.
 *
 * Target: Velvet Connect Staging, synthetic adults only.
 * Known product behavior on current main:
 *   - VITE_ENABLE_ENROLLMENT !== "true" disables #signupEntryButton and #signupButton
 *   - Signup heading becomes "Create a staging account"
 *   - Banner reads "STAGING · SYNTHETIC TEST ACCOUNTS ONLY"
 *   - Create Account is therefore expected to be non-submittable while enrollment is paused
 *
 * These specs must run against a frozen SHA only after that SHA is named.
 * Do not point this file at production. Do not invite real users.
 *
 * Companion config: playwright.config.ts (repo root)
 *   VC_E2E_BASE_URL                 optional staging URL; default local preview :4173
 *   VC_SYNTHETIC_EMAIL/PASSWORD     pre-provisioned staging adult (never commit)
 *   VC_ALLOW_SYNTHETIC_SIGNUP=true  required before enrollment flag may be on
 *   VC_ALLOW_PRODUCTION_VERIFY=true only for an explicit production-verify slice
 */
import { expect, test, type Page } from "@playwright/test";

const STAGING_BANNER = "STAGING · SYNTHETIC TEST ACCOUNTS ONLY";
const ENROLLMENT_PAUSED = "Enrollment remains paused pending release-gate verification.";

const synthetic = {
  email: process.env.VC_SYNTHETIC_EMAIL ?? "",
  password: process.env.VC_SYNTHETIC_PASSWORD ?? "",
  displayName: process.env.VC_SYNTHETIC_NAME ?? "Staging Member A",
};

function requireSyntheticCreds() {
  if (!synthetic.email || !synthetic.password) {
    test.skip(true, "VC_SYNTHETIC_EMAIL and VC_SYNTHETIC_PASSWORD are required for authenticated specs.");
  }
}

async function expectPageActive(page: Page, pageId: string) {
  await expect(page.locator(`#${pageId}`)).toHaveClass(/active/);
}

test.describe("Account flow — enrollment paused (current authorized mode)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("staging banner is visible and production copy is absent", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#environmentBanner")).toHaveText(STAGING_BANNER);
    await expect(page.locator("#environmentBanner")).not.toContainText("PRODUCTION");
  });

  test("welcome Create Account control is disabled while enrollment is paused", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#signupEntryButton");
    await expect(entry).toBeDisabled();
    await expect(entry).toHaveAttribute(
      "title",
      "Enrollment remains paused pending release-gate verification.",
    );
  });

  test("signup form cannot be submitted while enrollment is paused", async ({ page }) => {
    await page.goto("/");
    await page.locator("#signupEntryButton").evaluate((button: HTMLButtonElement) => {
      button.disabled = false;
      button.click();
    });

    await expectPageActive(page, "signupPage");
    await expect(page.locator("#signupHeading")).toHaveText("Create a staging account");
    await expect(page.locator("#signupButton")).toBeDisabled();
    await expect(page.locator("#signupStatus")).toHaveText(ENROLLMENT_PAUSED);

    await page.locator("#signupName").fill("Should Not Enroll");
    await page.locator("#signupEmail").fill("blocked@example.test");
    await page.locator("#signupPassword").fill("NotARealUser1!");

    const submitted = await page.locator("#signupForm").evaluate((form) => {
      const event = new Event("submit", { cancelable: true, bubbles: true });
      return form.dispatchEvent(event);
    });
    expect(submitted).toBeTruthy();
    await expect(page.locator("#signupStatus")).toHaveText(ENROLLMENT_PAUSED);
    await expect(page.locator("#verifyPage")).not.toHaveClass(/active/);
    await expect(page.locator("#profileSetupPage")).not.toHaveClass(/active/);
  });

  test("Sign In remains available from welcome", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expectPageActive(page, "loginPage");
    await expect(page.locator("#loginButton")).toBeEnabled();
  });

  test("protected pages redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      (window as unknown as { navigateTo: (id: string) => void }).navigateTo("dashboardPage");
    });
    await expectPageActive(page, "loginPage");
    await expect(page.locator("#loginStatus")).toContainText("Sign in to access this staging feature.");
  });
});

test.describe("Account flow — synthetic login (pre-provisioned staging user)", () => {
  test.beforeEach(() => requireSyntheticCreds());

  test("pre-provisioned synthetic adult can sign in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.locator("#loginEmail").fill(synthetic.email);
    await page.locator("#loginPassword").fill(synthetic.password);
    await page.locator("#loginButton").click();

    await expect(page.locator("#loginStatus")).toHaveText("Signed in.", { timeout: 15_000 });
    const landed = page.locator("#dashboardPage.active, #profileSetupPage.active");
    await expect(landed).toBeVisible();
    await expect(page.locator("#bottomNav")).toBeVisible();
  });

  test("wrong password stays on login and shows an error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.locator("#loginEmail").fill(synthetic.email);
    await page.locator("#loginPassword").fill("IncorrectPassword!999");
    await page.locator("#loginButton").click();

    await expect(page.locator("#loginStatus")).not.toHaveText("Signed in.");
    await expectPageActive(page, "loginPage");
    await expect(page.locator("#bottomNav")).toBeHidden();
  });

  test("sign out returns to welcome and hides member navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.locator("#loginEmail").fill(synthetic.email);
    await page.locator("#loginPassword").fill(synthetic.password);
    await page.locator("#loginButton").click();
    await expect(page.locator("#bottomNav")).toBeVisible({ timeout: 15_000 });

    await page.locator('.nav-item[data-page="settingsPage"]').click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await expectPageActive(page, "welcomePage");
    await expect(page.locator("#bottomNav")).toBeHidden();
  });
});

/**
 * Gated suite — run only when a founder-authorized staging slice
 * temporarily sets VITE_ENABLE_ENROLLMENT=true for synthetic accounts.
 * Default CI must leave this off. Participant count remains 0.
 */
test.describe("Account flow — synthetic signup (enrollment flag ON, synthetic only)", () => {
  test.skip(
    process.env.VITE_ENABLE_ENROLLMENT !== "true" || process.env.VC_ALLOW_SYNTHETIC_SIGNUP !== "true",
    "Synthetic signup suite stays skipped while Early Access enrollment is paused.",
  );

  test("staging signup reaches verify or profile setup for a unique synthetic email", async ({ page }) => {
    const stamp = Date.now();
    const email = `velvet.synthetic.${stamp}@example.test`;

    await page.goto("/");
    await expect(page.locator("#signupEntryButton")).toBeEnabled();
    await page.locator("#signupEntryButton").click();

    await page.locator("#signupName").fill(`Synthetic ${stamp}`);
    await page.locator("#signupEmail").fill(email);
    await page.locator("#signupPassword").fill("SyntheticPass1!");
    await page.locator("#signupButton").click();

    await expect(page.locator("#signupStatus")).not.toHaveText(ENROLLMENT_PAUSED);
    const next = page.locator("#verifyPage.active, #profileSetupPage.active");
    await expect(next).toBeVisible({ timeout: 20_000 });
  });

  test("signup rejects an invalid email without leaving the form", async ({ page }) => {
    await page.goto("/");
    await page.locator("#signupEntryButton").click();
    await page.locator("#signupName").fill("Invalid Email Case");
    await page.locator("#signupEmail").fill("not-an-email");
    await page.locator("#signupPassword").fill("SyntheticPass1!");
    await page.locator("#signupButton").click();
    await expectPageActive(page, "signupPage");
  });
});

test.describe("Account flow — evidence gaps to keep open", () => {
  test("age-assurance control is not present on the current signup form", async ({ page }) => {
    await page.goto("/");
    await page.locator("#signupEntryButton").evaluate((button: HTMLButtonElement) => {
      button.disabled = false;
      button.click();
    });
    await expect(page.locator("#signupForm")).toBeVisible();
    await expect(page.locator("#signupForm")).not.toContainText(/date of birth|age|18/i);
    test.info().annotations.push({
      type: "blocker",
      description: "Early Access requires age confirmation. Current prototype has no DOB field.",
    });
  });

  test("client source does not embed the staging project URL or a service-role key", async ({ request }) => {
    const source = await request.get("/src/app.ts").then((res) => res.text());
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("sb_secret_");
    expect(source).not.toContain("qqintbwoalvoegvqoxlo.supabase.co");
  });
});
