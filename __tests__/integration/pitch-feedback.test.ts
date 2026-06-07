import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createPitchFeedbackInvite,
  getPitchFeedbackInviteDetail,
  getPublicPitchFeedbackInviteByToken,
  listPitchFeedbackForContact,
  markPitchFeedbackInviteSent,
  recordPublicPitchFeedbackOpen,
  savePublicPitchFeedback,
} from "@/db/queries/pitch-feedback";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

process.env.ANTHROPIC_API_KEY = "";

const { contacts, pitchFeedbackDeliveryAttempts, pitchFeedbackEvents, pitchFeedbackInvites } =
  schema;

async function createContact(name = "Marta Feedback") {
  const [contact] = await db
    .insert(contacts)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      name,
      organization: "AGB Circle",
      relationshipType: "friend",
    })
    .returning();
  return contact;
}

async function countRows(tableName: string, whereSql: ReturnType<typeof sql>) {
  const [row] = await db.execute<{ value: number }>(
    sql`select count(*)::int as value from ${sql.identifier(tableName)} where ${whereSql}`,
  );
  return row.value;
}

describe("[integration] pitch feedback", () => {
  it("generates unique contact-linked private links without storing raw tokens", async () => {
    const marta = await createContact("Marta F&F");
    const carlos = await createContact("Carlos Advisor");

    const martaInvite = await createPitchFeedbackInvite({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      contactId: marta.id,
      channel: "link",
    });
    const carlosInvite = await createPitchFeedbackInvite({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      contactId: carlos.id,
      channel: "link",
    });

    if (!martaInvite.ok) throw new Error(martaInvite.error);
    if (!carlosInvite.ok) throw new Error(carlosInvite.error);

    expect(martaInvite.token).not.toBe(carlosInvite.token);
    expect(martaInvite.invite.contactId).toBe(marta.id);
    expect(carlosInvite.invite.contactId).toBe(carlos.id);

    const [stored] = await db
      .select()
      .from(pitchFeedbackInvites)
      .where(eq(pitchFeedbackInvites.id, martaInvite.invite.id));
    expect(stored.tokenHash).toBeTruthy();
    expect(stored.tokenHash).not.toBe(martaInvite.token);
    expect(stored.tokenHash).toHaveLength(64);

    const publicInvite = await getPublicPitchFeedbackInviteByToken({
      token: martaInvite.token,
    });
    expect(publicInvite?.contact.name).toBe("Marta F&F");
    expect(publicInvite?.invite.tokenHash).toBe(stored.tokenHash);

    const denied = await getPublicPitchFeedbackInviteByToken({
      token: "not-a-real-token-value",
    });
    expect(denied).toBeNull();
  });

  it("marks delivery idempotently for repeated copy/send attempts", async () => {
    const contact = await createContact("Idempotent Sender");
    const created = await createPitchFeedbackInvite({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      contactId: contact.id,
      channel: "link",
    });
    if (!created.ok) throw new Error(created.error);

    const message = "Private feedback link for you:";
    const first = await markPitchFeedbackInviteSent({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      inviteId: created.invite.id,
      channel: "link",
      message,
    });
    const second = await markPitchFeedbackInviteSent({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      inviteId: created.invite.id,
      channel: "link",
      message,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const deliveryCount = await countRows(
      "pitch_feedback_delivery_attempts",
      sql`${pitchFeedbackDeliveryAttempts.inviteId} = ${created.invite.id}`,
    );
    const copyEventCount = await countRows(
      "pitch_feedback_events",
      sql`${pitchFeedbackEvents.inviteId} = ${created.invite.id} and ${pitchFeedbackEvents.eventType} = 'invite_copied'`,
    );
    expect(deliveryCount).toBe(1);
    expect(copyEventCount).toBe(1);

    const overview = await listPitchFeedbackForContact({
      workspaceId: FAKE_WORKSPACE_ID,
      contactId: contact.id,
    });
    expect(overview.invites[0].status).toBe("sent");
    expect(overview.invites[0].sentAt).toBeTruthy();
  });

  it("records public opens, saves idempotent feedback, completes, and creates AI insight", async () => {
    const contact = await createContact("Public Reviewer");
    const created = await createPitchFeedbackInvite({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      contactId: contact.id,
      channel: "link",
    });
    if (!created.ok) throw new Error(created.error);

    const opened = await recordPublicPitchFeedbackOpen({
      token: created.token,
      userAgent: "vitest-agent",
      ip: "127.0.0.1",
      referrer: "https://example.test/fnf",
    });
    expect(opened?.session.id).toBeTruthy();
    expect(opened?.invite.viewCount).toBe(1);
    expect(opened?.invite.firstOpenedAt).toBeTruthy();

    const sessionId = opened!.session.id;
    const partial = await savePublicPitchFeedback({
      token: created.token,
      sessionId,
      sectionKey: "problem",
      currentSectionKey: "solution",
      progressPercent: 50,
      responses: [
        {
          promptKey: "problem-clarity",
          responseType: "score",
          value: { score: 8 },
        },
        {
          promptKey: "problem-gap",
          responseType: "objection",
          value: { text: "The tracking boundary could feel excessive if not explained." },
        },
      ],
    });
    expect(partial.ok).toBe(true);

    const retry = await savePublicPitchFeedback({
      token: created.token,
      sessionId,
      sectionKey: "problem",
      currentSectionKey: "solution",
      progressPercent: 50,
      responses: [
        {
          promptKey: "problem-gap",
          responseType: "objection",
          value: { text: "The tracking boundary needs a clear trust disclosure." },
        },
      ],
    });
    expect(retry.ok).toBe(true);

    const completed = await savePublicPitchFeedback({
      token: created.token,
      sessionId,
      sectionKey: "ask",
      currentSectionKey: "ask",
      progressPercent: 100,
      completed: true,
      responses: [
        {
          promptKey: "final-confidence",
          responseType: "score",
          value: { score: 9 },
        },
        {
          promptKey: "final-feedback",
          responseType: "final",
          value: {
            text: "This is useful and clear, but lead with the privacy promise.",
          },
        },
      ],
    });
    expect(completed.ok).toBe(true);

    const detail = await getPitchFeedbackInviteDetail({
      workspaceId: FAKE_WORKSPACE_ID,
      inviteId: created.invite.id,
    });
    expect(detail?.invite.status).toBe("completed");
    expect(detail?.invite.completionPercent).toBe(100);
    expect(detail?.responses).toHaveLength(4);
    expect(
      detail?.responses.find((response) => response.promptKey === "problem-gap")?.value,
    ).toEqual({ text: "The tracking boundary needs a clear trust disclosure." });
    expect(detail?.latestInsight?.model).toBe("heuristic");
    expect(detail?.latestInsight?.summary).toContain("Feedback captured");

    const eventCount = await countRows(
      "pitch_feedback_events",
      sql`${pitchFeedbackEvents.inviteId} = ${created.invite.id} and ${pitchFeedbackEvents.eventType} = 'invite_completed'`,
    );
    expect(eventCount).toBe(1);
  });

  it("fails closed for expired links", async () => {
    const contact = await createContact("Expired Reviewer");
    const created = await createPitchFeedbackInvite({
      workspaceId: FAKE_WORKSPACE_ID,
      actorId: FAKE_USER_ID,
      contactId: contact.id,
      channel: "link",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    if (!created.ok) throw new Error(created.error);

    const publicInvite = await getPublicPitchFeedbackInviteByToken({
      token: created.token,
    });
    const opened = await recordPublicPitchFeedbackOpen({ token: created.token });

    expect(publicInvite).toBeNull();
    expect(opened).toBeNull();

    const [stored] = await db
      .select()
      .from(pitchFeedbackInvites)
      .where(
        and(
          eq(pitchFeedbackInvites.id, created.invite.id),
          eq(pitchFeedbackInvites.status, "link_generated"),
        ),
      );
    expect(stored).toBeTruthy();
  });
});
