"use server";

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";

const { contacts, touches } = schema;

/**
 * AGB-404 — rolling conversation memory.
 *
 * Pulls the last 20 touches and asks Claude for a 3-bullet "what you should
 * remember about this person." Not cached (yet) — every call is fresh.
 * A future enhancement is to store summaries in a `contact_summaries` table
 * keyed by `(contact_id, touch_high_water)` so we only re-summarize when new
 * touches arrive.
 */
export async function conversationSummary(contactId: string) {
  const user = await requireUser();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!contact) return { ok: false as const, error: "Contact not found" };

  const recent = await db
    .select({ channel: touches.channel, body: touches.body, createdAt: touches.createdAt })
    .from(touches)
    .where(eq(touches.contactId, contactId))
    .orderBy(desc(touches.createdAt))
    .limit(20);

  if (recent.length === 0) {
    return {
      ok: true as const,
      summary: "No touches yet — nothing to summarize.",
      usingFallback: true,
    };
  }
  if (!isAnthropicConfigured()) {
    return {
      ok: true as const,
      summary: `Last touch was ${recent[0].createdAt.toISOString().slice(0, 10)} via ${recent[0].channel}. (Connect ANTHROPIC_API_KEY for a rolling summary.)`,
      usingFallback: true,
    };
  }

  const claude = await claudeChat({
    system:
      "You write a 3-bullet 'what should I remember about this person' summary from a list of touches. Bullets must be terse, specific, and avoid platitudes.",
    prompt: recent
      .map(
        (t) =>
          `- (${t.createdAt.toISOString().slice(0, 10)} · ${t.channel}) ${t.body.slice(0, 400)}`,
      )
      .join("\n"),
    maxTokens: 400,
    model: "claude-haiku-4-5",
    spend: {
      workspaceId: user.workspaceId,
      userId: user.id,
      direction: "out",
      payload: { route: "brain:conversation-memory", contactId },
      trackUsage: true,
    },
  });
  if (!claude.ok) {
    return { ok: false as const, error: claude.error };
  }
  return { ok: true as const, summary: claude.text.trim(), usingFallback: false };
}
