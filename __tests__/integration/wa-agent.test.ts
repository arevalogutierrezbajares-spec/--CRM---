import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleMessage } from "@/lib/whatsapp-agent";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { contacts, touches, reminders, waConversations, waActivity, users } =
  schema;

const SENDER = "+15551234567";

const base = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY =
    process.env.ANTHROPIC_API_KEY ?? "sk-test-stubbed";
  // The agent looks up users.whatsapp_phone to resolve sender → user → ws.
  await db
    .update(users)
    .set({ whatsappPhone: SENDER })
    .where(eq(users.id, FAKE_USER_ID));
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function scriptClaude(
  responses: Array<{
    stop_reason: "tool_use" | "end_turn";
    content: Array<
      | { type: "text"; text: string }
      | {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        }
    >;
    usage?: { input_tokens: number; output_tokens: number };
  }>,
) {
  let i = 0;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.anthropic.com/v1/messages")) {
      const r = responses[i++];
      if (!r) throw new Error(`Claude stub exhausted (call ${i})`);
      return new Response(
        JSON.stringify({
          id: `msg_${i}`,
          stop_reason: r.stop_reason,
          content: r.content,
          usage: r.usage ?? { input_tokens: 100, output_tokens: 50 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return real(input);
  }) as typeof fetch;
}

describe("[integration] WhatsApp agent loop", () => {
  it("logs a touch when Claude calls find_contact then log_touch then ends", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ ...base, name: "Marta López" })
      .returning();

    scriptClaude([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "find_contact",
            input: { query: "Marta" },
          },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "log_touch",
            input: {
              contact_id: c.id,
              body: "Had coffee, talked funding",
              channel: "manual",
            },
          },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Logged it on Marta." }],
      },
    ]);

    const res = await handleMessage({
      senderPhone: SENDER,
      body: "log: had coffee with Marta, talked funding",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reply).toBe("Logged it on Marta.");
    expect(res.toolCalls).toEqual(["find_contact", "log_touch"]);

    const ts = await db.select().from(touches).where(eq(touches.contactId, c.id));
    expect(ts).toHaveLength(1);
    expect(ts[0].body).toBe("Had coffee, talked funding");

    const [conv] = await db
      .select()
      .from(waConversations)
      .where(eq(waConversations.senderPhone, SENDER));
    expect(conv).toBeTruthy();
    expect(conv.workspaceId).toBe(FAKE_WORKSPACE_ID);
    expect(conv.userId).toBe(FAKE_USER_ID);
    expect((conv.messages as unknown[]).length).toBeGreaterThanOrEqual(2);

    const acts = await db.select().from(waActivity);
    const dirs = acts.map((a) => a.direction);
    expect(dirs).toContain("in");
    expect(dirs).toContain("tool");
    expect(dirs).toContain("out");
  });

  it("schedules a reminder when Claude returns a schedule_reminder tool call", async () => {
    const dueIso = "2026-06-02T13:00:00.000Z";
    scriptClaude([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "r1",
            name: "schedule_reminder",
            input: {
              subject: "Marta's proposal",
              due_at_iso: dueIso,
              recur: "once",
            },
          },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "✓ Will remind you about Marta's proposal." },
        ],
      },
    ]);

    const res = await handleMessage({
      senderPhone: SENDER,
      body: "Remind me Tuesday 9am about Marta's proposal",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reply).toMatch(/proposal/i);

    const rows = await db.select().from(reminders);
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Marta's proposal");
    expect(rows[0].recur).toBe("once");
    expect(rows[0].forUserId).toBe(FAKE_USER_ID);
    expect(rows[0].workspaceId).toBe(FAKE_WORKSPACE_ID);
    expect(rows[0].dueAt.toISOString()).toBe(dueIso);
  });

  it("rejects unknown senders with a polite message", async () => {
    const res = await handleMessage({
      senderPhone: "+19998887777",
      body: "anything",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("unknown-sender");
    expect(res.reply).toMatch(/recognize/i);
  });

  it("returns a friendly error when Claude is unavailable", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.anthropic.com")) {
        return new Response("upstream broke", { status: 500 });
      }
      return realFetch(input);
    }) as typeof fetch;

    const res = await handleMessage({
      senderPhone: SENDER,
      body: "anything",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reply).toMatch(/trouble/i);
  });

  it("status_report tool returns counts of overdue/blocked/stale", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const long_ago = new Date();
    long_ago.setDate(long_ago.getDate() - 120);

    const [lob] = await db
      .insert(schema.linesOfBusiness)
      .values({ ...base, title: "Status LoB" })
      .returning();
    const [proj] = await db
      .insert(schema.projects)
      .values({ ...base, lobId: lob.id, title: "P" })
      .returning();
    await db.insert(schema.milestones).values({
      ...base,
      projectId: proj.id,
      title: "Overdue",
      dueDate: yesterday.toISOString().slice(0, 10),
    });
    await db.insert(schema.projects).values({
      ...base,
      lobId: lob.id,
      title: "Blocked",
      status: "waiting",
      waitingOn: "their signature",
    });
    await db.insert(contacts).values({
      ...base,
      name: "Old Friend",
      relationshipType: "friend",
      lastTouchAt: long_ago,
    });

    scriptClaude([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "s1",
            name: "status_report",
            input: { scope: "all" },
          },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "1 overdue · 1 blocked · 1 stale friend." },
        ],
      },
    ]);

    const res = await handleMessage({ senderPhone: SENDER, body: "status" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.toolCalls).toEqual(["status_report"]);
    const acts = await db.select().from(waActivity);
    const toolAct = acts.find((a) => a.direction === "tool");
    expect(toolAct).toBeTruthy();
    const payload = toolAct!.payload as {
      name: string;
      result: {
        ok: true;
        data: { overdue: unknown[]; blocked: unknown[]; stale: unknown[] };
      };
    };
    expect(payload.name).toBe("status_report");
    expect(payload.result.data.overdue).toHaveLength(1);
    expect(payload.result.data.blocked).toHaveLength(1);
    expect(payload.result.data.stale).toHaveLength(1);
  });
});
