"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";

const { meetings } = schema;

export type PostMeetingResult =
  | { ok: true; minutesDraft: string; actionItems: string[]; usingFallback: boolean }
  | { ok: false; error: string };

/**
 * AGB-401 — given a meeting whose minutes are sparse, ask Claude to expand
 * the captured notes into structured minutes + extract `[ ] action items`.
 *
 * This is a one-shot draft — the user reviews + saves themselves; we don't
 * write back automatically.
 */
export async function postMeetingDraft(meetingId: string): Promise<PostMeetingResult> {
  const user = await requireUser();
  const [m] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.createdBy, user.id)))
    .limit(1);
  if (!m) return { ok: false, error: "Meeting not found" };

  if (!isAnthropicConfigured()) {
    return {
      ok: true,
      usingFallback: true,
      minutesDraft: m.minutes ?? "(No notes captured yet — start writing here.)",
      actionItems: [],
    };
  }

  const claude = await claudeChat({
    system:
      "You are a chief-of-staff cleaning up post-meeting notes. Output structured minutes followed by a list of action items in the form '[ ] thing to do'. Be concise.",
    prompt: [
      `Title: ${m.title}`,
      `Type: ${m.type}`,
      m.agenda ? `Agenda:\n${m.agenda}` : null,
      `Captured notes / minutes:\n${m.minutes ?? "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 800,
    spend: {
      workspaceId: user.workspaceId,
      userId: user.id,
      direction: "out",
      payload: { route: "brain:post-meeting", meetingId },
      trackUsage: true,
    },
  });

  if (!claude.ok) {
    return {
      ok: true,
      usingFallback: true,
      minutesDraft: m.minutes ?? "",
      actionItems: [],
    };
  }

  const text = claude.text;
  const actionItems = (text.match(/^\s*\[\s\]\s*(.+)$/gm) ?? []).map((s) =>
    s.replace(/^\s*\[\s\]\s*/, "").trim(),
  );

  return { ok: true, usingFallback: false, minutesDraft: text, actionItems };
}
