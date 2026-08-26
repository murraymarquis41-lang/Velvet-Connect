import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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
    expect(app).not.toContain("https://qqintbwoalvoegvqoxlo.supabase.co");
  });
});
