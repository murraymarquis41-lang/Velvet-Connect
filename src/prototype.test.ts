import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isAtLeast18 } from "./enrollment";

const expectedScreens = [
  "welcomePage",
  "signupPage",
  "loginPage",
  "verifyPage",
  "profileSetupPage",
  "dashboardPage",
  "matchPage",
  "chatPage",
  "settingsPage",
  "adminPage",
];

describe("authoritative static prototype", () => {
  it("contains the expected prototype screens and navigation", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    for (const screen of expectedScreens) {
      expect(html).toContain(`id="${screen}"`);
    }

    expect(html).toContain('src="./src/app.ts"');
    expect(html).toContain('id="environmentBanner"');
    expect(html).toContain('id="signupEntryButton"');
    expect(html).not.toContain("password:'123456'");
  });

  it("uses environment-scoped live authentication without local credential storage", async () => {
    const app = await readFile(new URL("./app.ts", import.meta.url), "utf8");

    expect(app).toContain("supabase.auth.signUp");
    expect(app).toContain("supabase.auth.signInWithPassword");
    expect(app).toContain('.from("profiles")');
    expect(app).not.toContain("localStorage");
    expect(app).not.toContain("service_role");
    expect(app).not.toContain("sb_secret_");
    expect(app).toContain("VITE_SUPABASE_URL");
    expect(app).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(app).toContain("VITE_ENABLE_ENROLLMENT");
    expect(app).toContain('rpc("delete_own_account"');
    expect(app).toContain('rpc("moderate_case"');
    expect(app).toContain('rpc("review_moderation_appeal"');
    expect(app).toContain('rpc("submit_moderation_appeal"');
    expect(app).toContain('.from("reports").insert');
    expect(app).not.toContain("https://qqintbwoalvoegvqoxlo.supabase.co");
  });

  it("enforces the 18+ enrollment boundary", () => {
    const now = new Date("2026-08-31T12:00:00Z");

    expect(isAtLeast18("2008-08-31", now)).toBe(true);
    expect(isAtLeast18("2008-09-01", now)).toBe(false);
    expect(isAtLeast18("2027-01-01", now)).toBe(false);
    expect(isAtLeast18("not-a-date", now)).toBe(false);
  });

  it("commits the Build 03 safety and deletion migration", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260831000100_build_03_moderation_enrollment_deletion.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("profiles_adult_enrollment_check");
    expect(migration).toContain("moderation_actions_immutable");
    expect(migration).toContain("CEO authorization required for permanent action");
    expect(migration).toContain("Appeal requires a reviewer other than the original case assignee");
    expect(migration).toContain("delete from auth.sessions where user_id = account_id");
    expect(migration).toContain("delete from auth.users where id = account_id");
    expect(migration).not.toContain("delete from storage.objects");
    expect(migration).toContain("alter table public.moderation_cases force row level security");
  });
});
