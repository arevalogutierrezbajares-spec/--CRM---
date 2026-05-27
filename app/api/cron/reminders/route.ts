import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp";
import { nextOccurrence, type Recur } from "@/lib/reminders";
import { withErrorCapture } from "@/lib/instrument";

const { reminders, users } = schema;

/**
 * Fires due reminders. Schedule via Vercel Cron at `*​/5 * * * *`.
 *
 *   { "path": "/api/cron/reminders", "schedule": "*​/5 * * * *" }
 *
 * For each due reminder:
 *   - look up the for_user's WhatsApp phone
 *   - send a WhatsApp ping
 *   - one-shot: set fired_at = now()
 *   - recurring: set fired_at = now() AND due_at = nextOccurrence(...)
 *
 * Auth: Bearer $CRON_SECRET.
 */
export const GET = withErrorCapture(
  "/api/cron/reminders",
  async (req: NextRequest) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { ok: false, reason: "wa not configured" },
        { status: 503 },
      );
    }

    const now = new Date();
    const due = await db
      .select()
      .from(reminders)
      .where(and(isNull(reminders.firedAt), lte(reminders.dueAt, now)))
      .limit(100);

    if (due.length === 0) {
      return NextResponse.json({ ok: true, fired: 0 });
    }

    const userIds = Array.from(new Set(due.map((r) => r.forUserId)));
    const userRows = await db
      .select({
        id: users.id,
        timezone: users.timezone,
        phone: users.whatsappPhone,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    const byUser = Object.fromEntries(userRows.map((u) => [u.id, u]));

    let fired = 0;
    const failures: Array<{ id: string; error: string }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const r of due) {
      const u = byUser[r.forUserId];
      const tz = u?.timezone ?? "America/New_York";
      const phone = u?.phone ?? null;

      if (!phone) {
        skipped.push({ id: r.id, reason: "user has no whatsapp_phone" });
        continue;
      }

      const sendRes = await sendWhatsAppText({
        to: phone,
        body: `🔔 ${r.subject}`,
      });
      if (!sendRes.ok) {
        failures.push({ id: r.id, error: sendRes.error });
        continue;
      }

      const nextDue =
        r.recur === "once"
          ? null
          : nextOccurrence({
              after: now,
              recur: r.recur as Recur,
              recurDay: r.recurDay,
              recurTime: r.recurTime,
              tz,
            });

      if (nextDue) {
        await db
          .update(reminders)
          .set({ firedAt: now, dueAt: nextDue })
          .where(eq(reminders.id, r.id));
      } else {
        await db
          .update(reminders)
          .set({ firedAt: now })
          .where(eq(reminders.id, r.id));
      }
      fired++;
    }

    return NextResponse.json({ ok: true, fired, failures, skipped });
  },
);
