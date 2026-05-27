import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nextReq(url: string, init?: any): NextRequest {
  return new NextRequest(url, init);
}

const { contacts, contactChannels, touches, users } = schema;

const SENDER_PHONE = "+15551234567";
const base = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };

beforeAll(() => {
  process.env.POSTMARK_INBOUND_SECRET = "test-secret";
  process.env.AGB_INBOUND_OWNER_USER_ID = FAKE_USER_ID;
  process.env.WA_PHONE_NUMBER_ID = "test-phone-id";
  process.env.WA_ACCESS_TOKEN = "test-wa-token";
  process.env.WA_VERIFY_TOKEN = "test-verify-token";
});

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid.stub" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.anthropic.com")) {
      return new Response("triage skipped", { status: 500 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(async () => {
  // Bind FAKE_USER's WhatsApp number for sender resolution in the WA webhook.
  await db
    .update(users)
    .set({ whatsappPhone: SENDER_PHONE })
    .where(eq(users.id, FAKE_USER_ID));
});

async function seedContactWithEmail(email: string) {
  const [c] = await db
    .insert(contacts)
    .values({ ...base, name: "Marta López" })
    .returning();
  await db.insert(contactChannels).values({
    contactId: c.id,
    kind: "email",
    value: email,
    isPrimary: true,
  });
  return c;
}

describe("[integration] Postmark inbound webhook", () => {
  it("creates an email Touch when sender matches a contact channel", async () => {
    const c = await seedContactWithEmail("marta@example.com");

    const { POST } = await import("@/app/api/postmark/inbound/route");
    const req = nextReq(
      "http://localhost/api/postmark/inbound?secret=test-secret",
      {
        method: "POST",
        body: JSON.stringify({
          FromFull: { Email: "marta@example.com" },
          Subject: "Re: Caney onboarding",
          TextBody: "Sounds good. Let's schedule the demo.",
          MessageID: "msg-001",
        }),
        headers: { "content-type": "application/json" },
      },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean; touchId: string };
    expect(body.ok).toBe(true);

    const rows = await db
      .select()
      .from(touches)
      .where(and(eq(touches.contactId, c.id), eq(touches.channel, "email")));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("Caney onboarding");
    expect(rows[0].body).toContain("schedule the demo");

    const [updated] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, c.id));
    expect(updated.lastTouchAt).toBeInstanceOf(Date);
  });

  it("rejects when the secret query param doesn't match", async () => {
    const { POST } = await import("@/app/api/postmark/inbound/route");
    const req = nextReq(
      "http://localhost/api/postmark/inbound?secret=wrong",
      { method: "POST", body: "{}" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
  });

  it("returns 202 + drops to the triage log when sender doesn't match a contact", async () => {
    const { POST } = await import("@/app/api/postmark/inbound/route");
    const req = nextReq(
      "http://localhost/api/postmark/inbound?secret=test-secret",
      {
        method: "POST",
        body: JSON.stringify({
          FromFull: { Email: "unknown-sender@example.com" },
          Subject: "Cold outreach",
          TextBody: "Hello from a stranger.",
        }),
        headers: { "content-type": "application/json" },
      },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(202);
    const body = (await resp.json()) as {
      ok: boolean;
      reason: string;
      from: string;
    };
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/no matching contact/i);
    expect(body.from).toBe("unknown-sender@example.com");

    const all = await db.select().from(touches);
    expect(all).toHaveLength(0);
  });
});

describe("[integration] WhatsApp webhook", () => {
  it("GET handshake echoes the challenge when verify token matches", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const req = nextReq(
      "http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-123",
    );
    const resp = await GET(req);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toBe("challenge-123");
  });

  it("GET returns 403 when verify_token is wrong", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const req = nextReq(
      "http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x",
    );
    const resp = await GET(req);
    expect(resp.status).toBe(403);
  });

  it("POST /log @marta from a registered sender logs a Touch on the right contact", async () => {
    const [marta] = await db
      .insert(contacts)
      .values({ ...base, name: "Marta López" })
      .returning();

    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const req = nextReq("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      body: JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: SENDER_PHONE,
                      type: "text",
                      text: { body: "/log @marta had coffee, talked funding" },
                    },
                  ],
                  contacts: [{ wa_id: SENDER_PHONE }],
                },
              },
            ],
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);

    await new Promise((r) => setTimeout(r, 10));

    const martaTouches = await db
      .select()
      .from(touches)
      .where(eq(touches.contactId, marta.id));
    expect(martaTouches.length).toBeGreaterThanOrEqual(1);
    expect(martaTouches[0].channel).toBe("whatsapp");
    expect(martaTouches[0].body).toContain("had coffee, talked funding");
  });

  it("POST free-form text matches sender to contact channel and logs on it", async () => {
    // Seed a contact whose whatsapp channel value matches the sender phone.
    const [contact] = await db
      .insert(contacts)
      .values({ ...base, name: "Carlos Pérez" })
      .returning();
    await db.insert(contactChannels).values({
      contactId: contact.id,
      kind: "whatsapp",
      value: SENDER_PHONE,
      isPrimary: true,
    });

    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const req = nextReq("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      body: JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: SENDER_PHONE,
                      type: "text",
                      text: { body: "Hey, free for lunch tomorrow?" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);

    const contactTouches = await db
      .select()
      .from(touches)
      .where(eq(touches.contactId, contact.id));
    expect(contactTouches.length).toBe(1);
    expect(contactTouches[0].channel).toBe("whatsapp");
    expect(contactTouches[0].body).toBe("Hey, free for lunch tomorrow?");
  });
});
