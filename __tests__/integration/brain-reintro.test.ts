import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { generateReintro } from "@/app/(app)/brain/actions";
import { FAKE_USER_ID } from "./setup";

const { contacts, touches } = schema;

/**
 * Stub the global fetch so any call to api.anthropic.com returns the recorded
 * shape of a real Messages API response. This proves the full re-intro flow
 * (lookup contact → lookup last touches → format prompt → parse response →
 * return draft) without burning Anthropic quota.
 */
function stubAnthropic(textContent: string) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.anthropic.com/v1/messages")) {
      // Verify the request shape so we know our client is sending the right
      // payload (model + system + messages).
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.model).toMatch(/claude-/);
      expect(typeof body.system).toBe("string");
      expect(body.messages?.[0]?.role).toBe("user");
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: textContent }],
          stop_reason: "end_turn",
          usage: { input_tokens: 42, output_tokens: 12 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return real(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

describe("[integration] re-intro brain surface", () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY =
      process.env.ANTHROPIC_API_KEY ?? "sk-test-stubbed";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drafts a re-intro using last touches as context (Claude OK)", async () => {
    const [c] = await db
      .insert(contacts)
      .values({
        name: "Marta López",
        type: "person",
        relationshipType: "friend",
        organization: "Posada La Rosa",
        ownerId: FAKE_USER_ID,
        introChainFromText: "Met at IDB dinner via Carlos",
      })
      .returning();

    // Seed two recent touches as context.
    await db.insert(touches).values([
      {
        contactId: c.id,
        channel: "manual",
        body: "Discussed Caney onboarding next steps",
        createdBy: FAKE_USER_ID,
      },
      {
        contactId: c.id,
        channel: "whatsapp",
        body: "Confirmed she's interested in the partnership",
        createdBy: FAKE_USER_ID,
      },
    ]);

    const expectedDraft =
      "Hey Marta — wanted to circle back on the partnership idea we discussed " +
      "at the Caney call. Free for a quick chat next week?";
    const restore = stubAnthropic(expectedDraft);
    try {
      const res = await generateReintro(c.id);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.usingFallback).toBe(false);
      expect(res.draft).toBe(expectedDraft);
    } finally {
      restore();
    }
  });

  it("falls back to the deterministic template when Claude returns an error", async () => {
    const [c] = await db
      .insert(contacts)
      .values({
        name: "Carlos Pérez",
        ownerId: FAKE_USER_ID,
      })
      .returning();

    // Stub returns a 500 → claudeChat returns ok:false → we expect fallback.
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.anthropic.com")) {
        return new Response("upstream broke", { status: 500 });
      }
      return real(input);
    }) as typeof fetch;

    try {
      const res = await generateReintro(c.id);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.usingFallback).toBe(true);
      // First-name greeting in the boilerplate.
      expect(res.draft).toMatch(/Carlos/);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("returns ok:false when the contact doesn't exist or doesn't belong to the caller", async () => {
    const res = await generateReintro(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });
});
