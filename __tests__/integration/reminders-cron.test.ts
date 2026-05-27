import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextOccurrence } from "@/lib/reminders";
import { FAKE_USER_ID } from "./setup";

const { reminders } = schema;

beforeAll(() => {
  process.env.WA_PHONE_NUMBER_ID = "test-phone";
  process.env.WA_ACCESS_TOKEN = "test-token";
  process.env.WA_VERIFY_TOKEN = "test-verify";
  process.env.AGB_WATCHDOG_NOTIFY_PHONE = "+15551234567";
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Stub WA send so the cron's outbound message looks successful.
function stubWASend() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid.stub" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(input);
  }) as typeof fetch;
}

describe("[unit] nextOccurrence", () => {
  it("advances daily reminders to the next day at the same local time", () => {
    const after = new Date("2026-05-26T13:05:00.000Z"); // 9:05 AM EDT
    const next = nextOccurrence({
      after,
      recur: "daily",
      recurDay: null,
      recurTime: "09:00:00",
      tz: "America/New_York",
    });
    expect(next).not.toBeNull();
    // 9 AM EDT next day = 13:00 UTC May 27
    expect(next!.toISOString()).toBe("2026-05-27T13:00:00.000Z");
  });

  it("advances weekly reminders to the next target weekday", () => {
    // Tuesday May 26 2026 → next Monday is June 1
    const tuesday = new Date("2026-05-26T15:00:00.000Z");
    const next = nextOccurrence({
      after: tuesday,
      recur: "weekly",
      recurDay: 1, // Monday
      recurTime: "08:00:00",
      tz: "America/New_York",
    });
    expect(next!.toISOString()).toBe("2026-06-01T12:00:00.000Z"); // 8 AM EDT Mon
  });

  it("returns null for once-off reminders", () => {
    expect(
      nextOccurrence({
        after: new Date(),
        recur: "once",
        recurDay: null,
        recurTime: null,
        tz: "UTC",
      }),
    ).toBeNull();
  });
});

describe("[integration] /api/cron/reminders", () => {
  it("fires due reminders and marks them fired", async () => {
    const past = new Date(Date.now() - 60_000);
    await db.insert(reminders).values({
      ownerId: FAKE_USER_ID,
      subject: "Test ping",
      dueAt: past,
      recur: "once",
    });
    // A future reminder should NOT fire.
    const future = new Date(Date.now() + 60 * 60_000);
    await db.insert(reminders).values({
      ownerId: FAKE_USER_ID,
      subject: "Future ping",
      dueAt: future,
      recur: "once",
    });

    stubWASend();

    const { GET } = await import("@/app/api/cron/reminders/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/cron/reminders");
    const resp = await GET(req);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean; fired: number };
    expect(body.fired).toBe(1);

    const all = await db.select().from(reminders);
    const pastRow = all.find((r) => r.subject === "Test ping")!;
    const futureRow = all.find((r) => r.subject === "Future ping")!;
    expect(pastRow.firedAt).not.toBeNull();
    expect(futureRow.firedAt).toBeNull();
  });

  it("advances recurring reminders to the next occurrence", async () => {
    // Daily at 09:00 NY, due_at 5 min ago → should fire and re-schedule for
    // tomorrow at 09:00 NY.
    const past = new Date(Date.now() - 5 * 60_000);
    const [r] = await db
      .insert(reminders)
      .values({
        ownerId: FAKE_USER_ID,
        subject: "Daily standup",
        dueAt: past,
        recur: "daily",
        recurTime: "09:00:00",
      })
      .returning();

    stubWASend();
    const { GET } = await import("@/app/api/cron/reminders/route");
    const { NextRequest } = await import("next/server");
    await GET(new NextRequest("http://localhost/api/cron/reminders"));

    const [after] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.id, r.id));
    expect(after.firedAt).not.toBeNull();
    // Next due_at should be in the future and aligned to 9 AM local.
    expect(after.dueAt.getTime()).toBeGreaterThan(Date.now());
  });
});
