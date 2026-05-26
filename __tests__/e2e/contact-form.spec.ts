import { test, expect } from "@playwright/test";

test.describe("Contact create form", () => {
  test("renders all required fields + channel row", async ({ page }) => {
    await page.goto("/contacts/new");
    await expect(page.getByRole("heading", { name: "New contact" })).toBeVisible();

    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Type")).toBeVisible();
    await expect(page.getByLabel("Relationship")).toBeVisible();
    await expect(page.getByLabel("Organization")).toBeVisible();
    await expect(page.getByLabel("Intro chain (free text)")).toBeVisible();
    await expect(page.getByLabel("Obsidian notes path")).toBeVisible();

    await expect(page.getByText("Channels", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Add channel/ }).click();
    const channelInputs = page.locator('input[placeholder="marta@example.com"]');
    await expect(channelInputs).toHaveCount(2);
  });

  test("blocks submission when name is empty (HTML required)", async ({
    page,
  }) => {
    await page.goto("/contacts/new");
    await page.getByRole("button", { name: /Create contact/ }).click();
    await expect(page).toHaveURL(/\/contacts\/new/);
    await expect(page.getByLabel("Name")).toBeFocused();
  });

  test("Back link returns to contacts list", async ({ page }) => {
    await page.goto("/contacts/new");
    await page.getByRole("link", { name: /Back to contacts/ }).click();
    await expect(page).toHaveURL(/\/contacts$/);
  });
});
