import { NextRequest, NextResponse } from "next/server";
import {
  listDueThisWeek,
  listBlockedProjects,
  listStaleFriends,
} from "@/db/queries/this-week";
import { sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp";
import { withErrorCapture } from "@/lib/instrument";

/**
 * AGB-400 — daily watchdog.
 *
 * Trigger via Vercel Cron:
 *   { "path": "/api/cron/watchdogs", "schedule": "0 12 * * *" }   // 12:00 UTC daily
 *
 * Auth: matches the `Authorization: Bearer ${CRON_SECRET}` header that Vercel
 * Cron sends. (Vercel sets CRON_SECRET automatically on production cron
 * invocations; you can also override it via env.)
 *
 * Behavior:
 *   1. Pull Due-this-week + Blocked-overdue + Stale lists for the owner.
 *   2. Compose a compact digest.
 *   3. If WhatsApp configured + AGB_WATCHDOG_NOTIFY_PHONE set, send via WA.
 *   4. Always return JSON of what we found (for log inspection).
 */
export const GET = withErrorCapture("/api/cron/watchdogs", async (req: NextRequest) => {
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

  const overdueDue = due.filter((d) => d.isOverdue);
  const overdueBlocked = blocked.filter((b) => b.isOverdue);

  const lines: string[] = [];
  if (overdueDue.length > 0) {
    lines.push(`📅 *${overdueDue.length} overdue milestone${overdueDue.length === 1 ? "" : "s"}*`);
    for (const d of overdueDue.slice(0, 5)) {
      lines.push(`• ${d.title} — ${d.projectTitle}`);
    }
  }
  if (overdueBlocked.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `🚧 *${overdueBlocked.length} blocker${overdueBlocked.length === 1 ? "" : "s"} past expected unblock*`,
    );
    for (const b of overdueBlocked.slice(0, 5)) {
      lines.push(`• ${b.title} — waiting on ${b.waitingOn}`);
    }
  }
  if (stale.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `🧊 *${stale.length} stale friend${stale.length === 1 ? "" : "s"}* (60+ days no touch)`,
    );
    for (const s of stale.slice(0, 5)) {
      lines.push(`• ${s.name} — ${s.daysSince ?? "never"}d ago`);
    }
  }

  const summary = lines.length > 0 ? lines.join("\n") : "All clear today. ✅";

  let waResult: unknown = null;
  const phone = process.env.AGB_WATCHDOG_NOTIFY_PHONE;
  if (isWhatsAppConfigured() && phone && lines.length > 0) {
    waResult = await sendWhatsAppText({ to: phone, body: summary });
  }

  return NextResponse.json({
    ok: true,
    counts: {
      due: due.length,
      overdueDue: overdueDue.length,
      blocked: blocked.length,
      overdueBlocked: overdueBlocked.length,
      stale: stale.length,
    },
    summary,
    notified: waResult,
  });
});
