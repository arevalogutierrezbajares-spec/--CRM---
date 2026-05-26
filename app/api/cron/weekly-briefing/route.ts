import { NextRequest, NextResponse } from "next/server";
import {
  listDueThisWeek,
  listBlockedProjects,
  listStaleFriends,
} from "@/db/queries/this-week";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import { withErrorCapture } from "@/lib/instrument";

/**
 * AGB-402 — weekly briefing.
 *
 * Vercel Cron:
 *   { "path": "/api/cron/weekly-briefing", "schedule": "0 13 * * MON" }
 *
 * Pulls Due/Blocked/Stale + asks Claude to write a short 5-bullet briefing.
 * Sends via Resend if configured; otherwise returns the rendered text.
 */
export const GET = withErrorCapture("/api/cron/weekly-briefing", async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  const ownerId = process.env.AGB_INBOUND_OWNER_USER_ID;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!ownerId) {
    return NextResponse.json(
      { error: "AGB_INBOUND_OWNER_USER_ID not set" },
      { status: 503 },
    );
  }

  const [due, blocked, stale] = await Promise.all([
    listDueThisWeek(ownerId),
    listBlockedProjects(ownerId),
    listStaleFriends(ownerId),
  ]);

  const facts = JSON.stringify(
    {
      due: due.map((d) => ({
        title: d.title,
        project: d.projectTitle,
        dueDate: d.dueDate,
        overdue: d.isOverdue,
      })),
      blocked: blocked.map((b) => ({
        title: b.title,
        waitingOn: b.waitingOn,
        expectedUnblock: b.expectedUnblockDate,
        overdue: b.isOverdue,
      })),
      stale: stale.map((s) => ({ name: s.name, daysSince: s.daysSince })),
    },
    null,
    2,
  );

  let briefingText: string;
  if (isAnthropicConfigured()) {
    const claude = await claudeChat({
      system:
        "You are a chief-of-staff writing a weekly briefing email for a busy founder. Output exactly 5 markdown bullets, each starting with **One word**. Be direct, no fluff, no preamble.",
      prompt: `Write the Monday briefing. Here are the facts in JSON:\n\n${facts}\n\nIf a list is empty, fold it into another bullet rather than saying "none." End with the single most important next step.`,
      maxTokens: 600,
    });
    briefingText = claude.ok
      ? claude.text
      : fallbackBriefing(due.length, blocked.length, stale.length);
  } else {
    briefingText = fallbackBriefing(due.length, blocked.length, stale.length);
  }

  let sendResult: unknown = null;
  const to = process.env.AGB_BRIEFING_RECIPIENT;
  if (isResendConfigured() && to) {
    sendResult = await sendEmail({
      to,
      subject: `AGB CRM — weekly briefing · ${new Date().toISOString().slice(0, 10)}`,
      text: briefingText,
    });
  }

  return NextResponse.json({
    ok: true,
    briefing: briefingText,
    sent: sendResult,
  });
});

function fallbackBriefing(due: number, blocked: number, stale: number): string {
  return [
    `**Due** — ${due} milestone${due === 1 ? "" : "s"} on the next 7 days.`,
    `**Blocked** — ${blocked} project${blocked === 1 ? "" : "s"} waiting on something.`,
    `**Stale** — ${stale} friend${stale === 1 ? "" : "s"} you haven't touched in 60+ days.`,
    `**Brain** — Claude not connected; this is the boilerplate summary.`,
    `**Next** — open /this-week and pick the top three to do today.`,
  ].join("\n");
}
