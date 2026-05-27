"use server";

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";

const { contacts, touches } = schema;

export type ReintroResult =
  | { ok: true; draft: string; usingFallback: boolean }
  | { ok: false; error: string };

/**
 * AGB-403 — re-intro generator.
 * Given a contact, drafts a warm re-intro using the last 5 touches + intro
 * chain context.
 */
export async function generateReintro(contactId: string): Promise<ReintroResult> {
  const user = await requireUser();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!contact) return { ok: false, error: "Contact not found" };

  const recentTouches = await db
    .select({
      channel: touches.channel,
      body: touches.body,
      createdAt: touches.createdAt,
    })
    .from(touches)
    .where(eq(touches.contactId, contactId))
    .orderBy(desc(touches.createdAt))
    .limit(5);

  if (!isAnthropicConfigured()) {
    return {
      ok: true,
      usingFallback: true,
      draft: fallback(contact.name, recentTouches.length),
    };
  }

  const context = recentTouches
    .map(
      (t) =>
        `- (${t.createdAt.toISOString().slice(0, 10)} · ${t.channel}) ${t.body.slice(0, 280)}`,
    )
    .join("\n");

  const claude = await claudeChat({
    system:
      "You are drafting a warm, short, low-pressure re-intro message from the user to a contact they haven't touched recently. Output the message body only — no salutation explainer, no preamble. 2-4 sentences. Reference one specific thing from the recent touches if possible.",
    prompt: [
      `Contact: ${contact.name}${contact.organization ? " (" + contact.organization + ")" : ""}`,
      `Relationship: ${contact.relationshipType}`,
      contact.introChainFromText
        ? `Intro context: ${contact.introChainFromText}`
        : null,
      `Last ${recentTouches.length} touches (newest first):\n${context || "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 400,
  });

  if (!claude.ok) {
    return {
      ok: true,
      usingFallback: true,
      draft: fallback(contact.name, recentTouches.length),
    };
  }
  return { ok: true, usingFallback: false, draft: claude.text.trim() };
}

function fallback(name: string, touchCount: number): string {
  const opener = touchCount > 0
    ? `Hey ${name.split(/\s+/)[0]} — it's been a minute since we last connected.`
    : `Hey ${name.split(/\s+/)[0]} — wanted to reach out and reconnect.`;
  return [
    opener,
    "Anything I can help with on your end this month? Happy to trade notes when you have a few minutes.",
    "(Claude not connected — this is the boilerplate template. Set ANTHROPIC_API_KEY for AI-drafted re-intros.)",
  ].join("\n\n");
}
