import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";
import { withErrorCapture } from "@/lib/instrument";
import { brainKillSwitch, inQuietHours } from "@/lib/silence-rules";
import {
  gatherNudgeCandidates,
  filterDedupedCandidates,
  recordNudgesFired,
} from "@/lib/nudge-engine";

const { users } = schema;

/**
 * Daily nudge cron — gathers overdue/blocked/stale items, dedupes against
 * today's already-fired nudges, picks the top 3, asks Claude to wrap them in
 * a friendly briefing, sends via WhatsApp.
 *
 * Vercel Cron: { "path": "/api/cron/nudges", "schedule": "0 13 * * *" }
 */
export const GET = withErrorCapture(
  "/api/cron/nudges",
  async (req: NextRequest) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (brainKillSwitch() || inQuietHours()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const ownerId = process.env.AGB_INBOUND_OWNER_USER_ID;
    const phone = process.env.AGB_WATCHDOG_NOTIFY_PHONE;
    if (!ownerId || !phone || !isWhatsAppConfigured()) {
      return NextResponse.json(
        { ok: false, reason: "wa or owner not configured" },
        { status: 503 },
      );
    }

    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    if (!owner) {
      return NextResponse.json({ error: "owner missing" }, { status: 500 });
    }

    const all = await gatherNudgeCandidates(ownerId);
    const fresh = (await filterDedupedCandidates(ownerId, all)).slice(0, 3);

    if (fresh.length === 0) {
      return NextResponse.json({ ok: true, fired: 0, reason: "nothing fresh" });
    }

    let message: string;
    if (isAnthropicConfigured()) {
      const claude = await claudeChat({
        system:
          "Write a friendly 2-3 sentence morning nudge from a CRM assistant. " +
          "Mention each item by name. End with: 'Reply done/snooze, or just text me.' " +
          "Plain text, no markdown.",
        prompt: `Items to nudge about today:\n\n${fresh
          .map((c, i) => `${i + 1}. ${c.line}`)
          .join("\n")}`,
        maxTokens: 350,
      });
      message = claude.ok
        ? claude.text.trim()
        : `Heads up:\n\n${fresh.map((c) => `• ${c.line}`).join("\n")}\n\nReply done/snooze.`;
    } else {
      message = `Heads up:\n\n${fresh.map((c) => `• ${c.line}`).join("\n")}\n\nReply done/snooze.`;
    }

    const sendRes = await sendWhatsAppText({ to: phone, body: message });
    if (!sendRes.ok) {
      return NextResponse.json(
        { ok: false, error: sendRes.error },
        { status: 502 },
      );
    }
    await recordNudgesFired(ownerId, fresh);

    return NextResponse.json({
      ok: true,
      fired: fresh.length,
      message,
      signatures: fresh.map((c) => c.signature),
    });
  },
);
