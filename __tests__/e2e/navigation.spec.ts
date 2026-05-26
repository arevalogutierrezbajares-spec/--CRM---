import { test, expect } from "@playwright/test";

test.describe("Navigation shell · desktop", () => {
  test("desktop sidebar shows every primary surface", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This Week" })).toBeVisible();

    for (const label of [
      "This Week",
      "Contacts",
      "Projects",
      "Meetings",
      "Pipeline",
      "Network",
      "Profile",
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("active sidebar link reflects the current route", async ({ page }) => {
    await page.goto("/contacts");
    const link = page.getByRole("link", { name: "Contacts", exact: true }).first();
    await expect(link).toHaveAttribute("aria-current", "page");
  });

  test("skip-to-content link is reachable from keyboard", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
  });
});
