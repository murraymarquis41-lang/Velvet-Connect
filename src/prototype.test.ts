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

    expect(html).toContain("function navigateTo(pageId)");
  });
});
