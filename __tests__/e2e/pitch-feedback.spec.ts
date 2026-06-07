import { expect, test } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000aa";

async function ensureFakeWorkspace() {
  await db
    .insert(schema.users)
    .values({
      id: FAKE_USER_ID,
      email: "test@local",
      displayName: "Test Founder",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaces)
    .values({
      id: FAKE_WORKSPACE_ID,
      name: "Test Workspace",
      createdBy: FAKE_USER_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      userId: FAKE_USER_ID,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .update(schema.users)
    .set({ currentWorkspaceId: FAKE_WORKSPACE_ID })
    .where(eq(schema.users.id, FAKE_USER_ID));
}

async function seedContact() {
  await ensureFakeWorkspace();
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      name: `Pitch Reviewer ${Date.now()}`,
      organization: "F&F Circle",
      relationshipType: "friend",
    })
    .returning();
  return contact;
}

test.describe("Pitch Feedback E2E", () => {
  test.setTimeout(90_000);

  test("creates unique contact links and completes the public walkthrough", async ({
    page,
    context,
  }) => {
    const contact = await seedContact();

    await page.goto(`/contacts/${contact.id}`);
    await expect(
      page.getByRole("main").getByText("Pitch Feedback", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Create link/ }).click();
    await expect(page.getByRole("dialog", { name: /Create private review link/ })).toBeVisible();

    const generate = page.getByRole("button", { name: /Generate private link/ });
    await generate.click();
    await expect(page.getByText("Unique link ready")).toBeVisible();
    const linkInput = page.locator('input[readonly]').last();
    const firstUrl = await linkInput.inputValue();
    expect(firstUrl).toContain("/f/");

    await generate.click();
    await expect
      .poll(() => linkInput.inputValue(), { timeout: 10_000 })
      .not.toBe(firstUrl);
    const secondUrl = await linkInput.inputValue();
    expect(secondUrl).toContain("/f/");

    await context.grantPermissions(["clipboard-write"], {
      origin: new URL(page.url()).origin,
    });
    await page.getByRole("button", { name: /Copy \+ track/ }).click();
    await expect(page.getByText(/Link copied and tracked|Invite marked sent/)).toBeVisible();

    const publicPage = await context.newPage();
    await publicPage.goto(secondUrl);
    await expect(publicPage.getByText("Private silent review")).toBeVisible();
    await expect(publicPage.getByRole("heading", { name: /AGB F&F Private Review/ })).toBeVisible();

    await publicPage.getByRole("button", { name: "clear" }).click();
    await publicPage.getByRole("button", { name: /Continue/ }).click();

    await publicPage.locator("textarea").fill("The privacy boundary needs to be explicit.");
    await publicPage.getByRole("button", { name: /Continue/ }).click();

    await publicPage.getByRole("button", { name: "useful" }).click();
    await publicPage.locator("textarea").fill("This would be useful if it stays contact-first.");
    await publicPage.getByRole("button", { name: /Continue/ }).click();

    await publicPage.locator('input[type="range"]').fill("8");
    await publicPage.locator("textarea").fill("AI should draft, not send.");
    await publicPage.getByRole("button", { name: /Continue/ }).click();

    await publicPage.getByRole("button", { name: "clear" }).click();
    await publicPage.locator("textarea").fill("Progress tracking is fine with disclosure.");
    await publicPage.getByRole("button", { name: /Continue/ }).click();

    await publicPage.locator('input[type="range"]').fill("9");
    await publicPage
      .locator("textarea")
      .first()
      .fill("Lead with the trust promise and then show the AI summary.");
    await publicPage.getByRole("button", { name: /Submit feedback/ }).click();
    await expect(publicPage.getByRole("heading", { name: "Feedback received" })).toBeVisible({
      timeout: 20_000,
    });

    const invites = await db
      .select()
      .from(schema.pitchFeedbackInvites)
      .where(eq(schema.pitchFeedbackInvites.contactId, contact.id))
      .orderBy(desc(schema.pitchFeedbackInvites.updatedAt));
    expect(invites).toHaveLength(2);
    expect(new Set(invites.map((invite) => invite.tokenHash)).size).toBe(2);

    const completedInvite = invites.find((invite) => invite.status === "completed");
    expect(completedInvite?.completionPercent).toBe(100);
    expect(completedInvite?.firstOpenedAt).toBeTruthy();
    expect(completedInvite?.viewCount).toBeGreaterThan(0);

    const responses = await db
      .select()
      .from(schema.pitchFeedbackResponses)
      .where(eq(schema.pitchFeedbackResponses.inviteId, completedInvite!.id));
    expect(responses.length).toBeGreaterThanOrEqual(6);
  });
});
