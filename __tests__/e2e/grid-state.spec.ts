import { test, expect } from "@playwright/test";

test.describe("Grid state (URL-driven filter + group)", () => {
  test("filter dropdown writes ?filter=relationship=lead", async ({ page }) => {
    await page.goto("/contacts");
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole("option", { name: "Lead", exact: true }).click();
    await expect(page).toHaveURL(/filter=relationship%3Dlead/);
  });

  test("Clear button resets filters + group", async ({ page }) => {
    await page.goto("/contacts?filter=relationship%3Dlead&group=type");
    await page.getByRole("button", { name: /^Clear$/ }).click();
    await expect(page).not.toHaveURL(/filter=/);
    await expect(page).not.toHaveURL(/group=/);
  });

  test("Active/Archived toggle preserves the rest of the URL state", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await expect(page).toHaveURL(/archived=true/);
  });
});

test.describe("Saved views (localStorage)", () => {
  test("save current view persists to localStorage and updates the count badge", async ({
    page,
  }) => {
    await page.goto("/contacts?filter=relationship%3Dlead");
    const viewsButton = page.getByTestId("saved-views-trigger");

    // Pre-condition: no badge.
    await expect(viewsButton).not.toContainText(/^Views\s*\d/);

    await viewsButton.click();
    await page.getByRole("menuitem", { name: /Save current as view/ }).click();
    await page.getByLabel("Name").fill("Hot leads");
    await page.getByRole("button", { name: /^Save view$/ }).click();

    // The dialog closes + the trigger button shows a count badge.
    await expect(viewsButton).toContainText("1");

    // The view body is persisted to localStorage under the namespace key.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("agb.savedViews.contacts"),
    );
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored ?? "[]") as Array<{
      name: string;
      query: string;
    }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Hot leads");
    expect(parsed[0].query).toContain("filter=relationship%3Dlead");
  });
});
