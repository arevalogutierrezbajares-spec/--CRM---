import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { findContactByEmail } from "@/lib/contact-match";
import { triageInbound } from "@/lib/inbound-triage";
import { withErrorCapture } from "@/lib/instrument";

const { touches, contacts, users } = schema;

/**
 * Postmark inbound webhook. Configure the Inbound Server to POST here.
 * Auth: shared secret in URL query (`?secret=…`) matched against
 * POSTMARK_INBOUND_SECRET. Postmark doesn't sign payloads, so a URL secret +
 * IP allowlist on Vercel is the supported pattern.
 *
 * Requires:
 *   - POSTMARK_INBOUND_SECRET (URL secret)
 *   - AGB_INBOUND_OWNER_USER_ID (the user.id who owns inbound mail — single-user
 *     today; later this could route by To: address)
 */
export const POST = withErrorCapture("/api/postmark/inbound", async (req: NextRequest) => {
  const expected = process.env.POSTMARK_INBOUND_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "POSTMARK_INBOUND_SECRET not configured" },
      { status: 503 },
    );
  }
  const provided = req.nextUrl.searchParams.get("secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerIdEnv = process.env.AGB_INBOUND_OWNER_USER_ID;
  if (!ownerIdEnv) {
    return NextResponse.json(
      { error: "AGB_INBOUND_OWNER_USER_ID not configured" },
      { status: 503 },
    );
  }

  // Resolve owner's current workspace.
  const [owner] = await db
    .select({ id: users.id, workspaceId: users.currentWorkspaceId })
    .from(users)
    .where(eq(users.id, ownerIdEnv))
    .limit(1);
  if (!owner) {
    return NextResponse.json(
      { error: "Inbound owner not in users table" },
      { status: 500 },
    );
  }
  if (!owner.workspaceId) {
    return NextResponse.json(
      { error: "Inbound owner has no current workspace" },
      { status: 500 },
    );
  }
  const workspaceId = owner.workspaceId;

  const payload = (await req.json().catch(() => null)) as
    | { FromFull?: { Email?: string }; From?: string; Subject?: string; TextBody?: string; StrippedTextReply?: string; MessageID?: string }
    | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromEmail =
    payload.FromFull?.Email ??
    (payload.From?.match(/<(.+?)>/)?.[1] || payload.From) ??
    null;
  if (!fromEmail) {
    return NextResponse.json({ error: "No sender" }, { status: 400 });
  }

  const contactId = await findContactByEmail({
    workspaceId,
    email: fromEmail,
  });
  if (!contactId) {
    // AGB-700 — run AI triage on the unmatched sender before dropping.
    const verdict = await triageInbound({
      from: fromEmail,
      subject: payload.Subject,
      body: payload.StrippedTextReply ?? payload.TextBody ?? "",
    });
    // Append the triage decision to a JSONL log so the user can review and
    // selectively promote senders into contacts later.
    const logPath =
      process.env.INBOUND_TRIAGE_LOG_PATH ??
      path.join("/tmp", "agb-inbound-triage.jsonl");
    try {
      await fs.appendFile(
        logPath,
        JSON.stringify({
          ts: new Date().toISOString(),
          from: fromEmail,
          subject: payload.Subject ?? null,
          messageId: payload.MessageID ?? null,
          verdict,
        }) + "\n",
      );
    } catch {
      // ignore log write errors
    }
    return NextResponse.json(
      {
        ok: false,
        reason: "no matching contact",
        from: fromEmail,
        triage: verdict,
      },
      { status: 202 },
    );
  }

  const body = [
    payload.Subject ? `Subject: ${payload.Subject}` : null,
    "",
    payload.StrippedTextReply ?? payload.TextBody ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const [row] = await db
    .insert(touches)
    .values({
      contactId,
      channel: "email",
      body: body.slice(0, 8000),
      workspaceId,
      createdBy: ownerIdEnv,
    })
    .returning({ id: touches.id });

  await db
    .update(contacts)
    .set({ lastTouchAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  return NextResponse.json({ ok: true, touchId: row.id, contactId });
});
