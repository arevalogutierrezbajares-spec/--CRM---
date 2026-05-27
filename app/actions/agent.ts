"use server";

import { requireUser } from "@/lib/current-user";
import { handleMessageForUser } from "@/lib/wa-agent/loop";

export type AgentTurnResult =
  | {
      ok: true;
      reply: string;
      toolCalls: string[];
      tokensIn: number;
      tokensOut: number;
    }
  | { ok: false; reply: string; error: string };

/**
 * Server action invoked from the in-CRM agent chat panel. Resolves the
 * session user, hands off to the shared WA agent core under a `web:<userId>`
 * sender key so the web thread persists independently from any WhatsApp
 * conversation the same user might have.
 */
export async function requestAgentTurn(text: string): Promise<AgentTurnResult> {
  const body = (text ?? "").trim();
  if (!body) {
    return { ok: false, reply: "", error: "empty-body" };
  }
  if (body.length > 4000) {
    return {
      ok: false,
      reply: "That message is too long. Trim it under 4000 characters and resend.",
      error: "body-too-long",
    };
  }

  const user = await requireUser();
  const result = await handleMessageForUser({ userId: user.id, body });

  if (result.ok) {
    return {
      ok: true,
      reply: result.reply,
      toolCalls: result.toolCalls,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  }
  return { ok: false, reply: result.reply, error: result.error };
}

/**
 * Reset the web conversation buffer for the current user. Doesn't touch
 * their WhatsApp thread.
 */
export async function clearAgentConversation(): Promise<{ ok: true }> {
  const user = await requireUser();
  const { db, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  await db
    .delete(schema.waConversations)
    .where(eq(schema.waConversations.senderPhone, `web:${user.id}`));
  return { ok: true };
}
