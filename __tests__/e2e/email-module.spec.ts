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

test.describe("Email module sandbox", () => {
  test("supports sandbox inbox, triage, settings, and reply flow", async ({ page }) => {
    await ensureSandbox(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);

    await expect(page.getByRole("button", { name: "Sync email" })).toBeVisible();
    await expect(page.getByRole("button", { name: /sales@caneycloud\.com/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /support@caneycloud\.com/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Unread/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sent/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Snoozed/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /CaneyCloud demo|Night audit|Partnership intro/ }).first()).toBeVisible();

    const search = page.getByPlaceholder("Search mail");
    await search.fill("victor@example.com");
    await expect(page.getByRole("button", { name: /Partnership intro/ }).first()).toBeVisible();
    await search.fill("");

    await page.getByRole("button", { name: "Compose" }).click();
    await expect(page.getByRole("heading", { name: /@caneycloud\.com/ })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByLabel("Select all visible threads").check();
    await expect(page.getByRole("button", { name: "Snooze selected" })).toBeVisible();
    await page.getByRole("button", { name: "Mark selected done" }).click();
    await expect(page.getByText("done").first()).toBeVisible();

    await page.getByRole("button", { name: /CaneyCloud demo for Posada La Rosa/ }).click();
    await expect(page.getByLabel("Link email to contact")).toBeVisible();
    await expect(page.getByLabel("Link email to project")).toBeVisible();
    await expect(page.getByLabel("Link email to initiative")).toBeVisible();
    await expect(page.getByLabel("Link email to milestone")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /current-room-rates\.pdf/i }).click();
    expect((await downloadPromise).suggestedFilename()).toContain("current-room-rates.pdf");

    await page.getByRole("button", { name: "Email settings" }).click();
    await expect(page.getByText("Provider health")).toBeVisible();
    await expect(page.getByText("Current grants")).toBeVisible();
    await expect(page.getByText("Mailbox provisioning")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import Microsoft mailboxes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import Zoho mailboxes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export audit CSV" })).toBeVisible();
    await expect(page.getByLabel(/Diego Sales/)).toBeVisible();
    const suffix = Date.now().toString(36);
    const sharedAddress = `admin-${suffix}@caneycloud.com`;
    const teamAddress = `provisioned-${suffix}@caneycloud.com`;
    await page.getByPlaceholder("sales@caneycloud.com").fill(sharedAddress);
    await page.getByRole("textbox", { name: "Sales", exact: true }).fill("Admin E2E");
    await page.getByLabel(/Diego Sales/).check();
    await page.getByRole("button", { name: "Create/request inbox" }).click();
    await expect(page.getByText(sharedAddress)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("completed").first()).toBeVisible();

    await page.getByPlaceholder("Tomas Caney").fill("Provisioned E2E");
    await page.getByPlaceholder("tomas@caneycloud.com").fill(teamAddress);
    await page.getByPlaceholder(/Temporary Microsoft password|Optional provider password/).fill("TemporaryPass123!");
    await page.getByRole("button", { name: "Create/invite member" }).click();
    await expect(page.getByText(teamAddress)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: new RegExp(sharedAddress.replace(".", "\\.")) }).first()).toBeVisible();

    await page.getByRole("button", { name: "Email settings" }).click();
    const summarize = page.getByRole("button", { name: "Summarize" });
    if (await summarize.isEnabled().catch(() => false)) {
      await summarize.click();
      await expect(page.getByText("Open questions")).toBeVisible();
      await page.getByRole("button", { name: "Draft reply" }).click();
      await expect(page.locator("span").filter({ hasText: /^AI draft$/ }).first()).toBeVisible();
      await page.getByLabel("Insert email template").selectOption("intro");
      await page.getByPlaceholder("Write reply...").fill("Thanks. I will follow up from the CRM email module.");
      await expect(page.getByText(/Draft saved|Saving draft/)).toBeVisible({ timeout: 5000 });
      await page.locator('input[type="file"]').setInputFiles({
        name: "v1-note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Attachment smoke"),
      });
      await expect(page.getByRole("button", { name: /v1-note\.txt 1 KB/ })).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText(/Email sent|Already sent|Send is already queued/)).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: /Sent/ }).first().click();
      await expect(page.getByRole("button", { name: /CaneyCloud demo for Posada La Rosa/ }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
    }
  });
});
