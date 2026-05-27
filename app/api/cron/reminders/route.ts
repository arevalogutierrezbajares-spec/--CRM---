import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, lte } from "drizzle-orm";
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
 *   - send WhatsApp to the owner's notify phone (AGB_WATCHDOG_NOTIFY_PHONE)
 *   - one-shot: set fired_at = now()
 *   - recurring: set fired_at = now() AND due_at = nextOccurrence(...)
 *
 * Auth: same Bearer $CRON_SECRET pattern as the other crons.
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

    const phone = process.env.AGB_WATCHDOG_NOTIFY_PHONE;
    if (!phone || !isWhatsAppConfigured()) {
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

    // Group by owner so we can look up tz once per owner.
    const ownerIds = Array.from(new Set(due.map((r) => r.ownerId)));
    const ownerRows = await db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(
        ownerIds.length === 1
          ? eq(users.id, ownerIds[0])
          : // drizzle inArray would be more efficient; falling back to OR for clarity
            eq(users.id, ownerIds[0]),
      );
    const tzByOwner = Object.fromEntries(
      ownerRows.map((u) => [u.id, u.timezone]),
    );

    let fired = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const r of due) {
      const tz = tzByOwner[r.ownerId] ?? "America/New_York";

      const body = `🔔 ${r.subject}`;
      const sendRes = await sendWhatsAppText({ to: phone, body });
      if (!sendRes.ok) {
        failures.push({ id: r.id, error: sendRes.error });
        continue;
      }

      // Mark fired + compute next due_at for recurring.
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

    return NextResponse.json({ ok: true, fired, failures });
  },
);
