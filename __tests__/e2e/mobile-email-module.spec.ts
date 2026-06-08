import { expect, test } from "@playwright/test";

async function ensureSandbox(page: import("@playwright/test").Page) {
  await page.goto("/email");
  if (await page.getByRole("heading", { name: "404" }).isVisible().catch(() => false)) {
    await page.waitForTimeout(500);
    await page.goto("/email");
  }
  const loadSandbox = page.getByRole("button", { name: /load sandbox/i });
  if (await loadSandbox.isVisible().catch(() => false)) {
    await loadSandbox.click();
    await expect(page.getByRole("button", { name: /sales@caneycloud\.com/ }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

test.describe("Email module · mobile", () => {
  test("keeps core inbox and settings reachable without horizontal overflow", async ({ page }) => {
    await ensureSandbox(page);

    await expect(page.getByRole("button", { name: "Sync email" })).toBeVisible();
    await expect(page.getByRole("button", { name: /All accessible/ }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);

    await page.getByRole("button", { name: "Email settings" }).click();
    await expect(page.getByText("Provider health")).toBeVisible();
    await expect(page.getByText("Current grants")).toBeVisible();
    await expect(page.getByText("Mailbox provisioning")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  });
});
