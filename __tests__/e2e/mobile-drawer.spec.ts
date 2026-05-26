import { test, expect } from "@playwright/test";

test.describe("Mobile drawer", () => {
  test("hamburger opens the drawer and a route click closes it", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-hidden", "false");

    await drawer.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator("#mobile-nav-drawer")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("Escape closes the drawer", async ({ page }) => {
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
  });
});
