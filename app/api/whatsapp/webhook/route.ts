import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { findContactByChannel } from "@/lib/contact-match";
import {
  parseCommand,
  sendWhatsAppText,
  isWhatsAppConfigured,
  verifyMetaSignature,
} from "@/lib/whatsapp";
import { withErrorCapture } from "@/lib/instrument";
import {
  handleMessage as agentHandle,
  resolveSender,
} from "@/lib/whatsapp-agent";
import { checkRateLimit } from "@/lib/wa-rate-limit";

const { touches, contacts } = schema;

// GET — Meta webhook verification handshake.
export const GET = withErrorCapture(
  "/api/whatsapp/webhook GET",
  async (req: NextRequest) => {
    const verifyToken = process.env.WA_VERIFY_TOKEN;
    if (!verifyToken) {
      return NextResponse.json(
        { error: "WA_VERIFY_TOKEN not set" },
        { status: 503 },
      );
    }
    const mode = req.nextUrl.searchParams.get("hub.mode");
    const token = req.nextUrl.searchParams.get("hub.verify_token");
    const challenge = req.nextUrl.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  },
);

// POST — inbound message webhook.
export const POST = withErrorCapture(
  "/api/whatsapp/webhook POST",
  async (req: NextRequest) => {
    if (!isWhatsAppConfigured()) {
      return NextResponse.json({ error: "WA not configured" }, { status: 503 });
    }

    const rawBody = await req.text();
    const signatureOK = await verifyMetaSignature({
      header: req.headers.get("x-hub-signature-256"),
      rawBody,
    });
    if (!signatureOK) {
      return NextResponse.json({ error: "bad signature" }, { status: 403 });
    }

    let payload: {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from?: string;
              text?: { body?: string };
              type?: string;
            }>;
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          };
        }>;
      }>;
    } | null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const useAgent = process.env.AGB_WA_AGENT === "1";

    const responses: { to: string; body: string }[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.type !== "text" || !msg.text?.body || !msg.from) continue;

          const verdict = await checkRateLimit(msg.from);
          if (!verdict.allowed) {
            responses.push({
              to: msg.from,
              body: `Slow down — try again in ${verdict.retryAfterSeconds}s.`,
            });
            continue;
          }

          if (useAgent) {
            const r = await agentHandle({
              senderPhone: msg.from,
              body: msg.text.body,
            });
            responses.push({ to: msg.from, body: r.reply });
            continue;
          }

          // Legacy slash-command path — also workspace-aware via resolveSender.
          const resolved = await resolveSender(msg.from);
          if (!resolved) {
            responses.push({
              to: msg.from,
              body:
                "I don't recognize this number. Add it in /profile → WhatsApp.",
            });
            continue;
          }
          const reply = await handleCommand({
            from: msg.from,
            body: msg.text.body,
            workspaceId: resolved.workspaceId,
            userId: resolved.userId,
          });
          responses.push({ to: msg.from, body: reply });
        }
      }
    }

    await Promise.allSettled(
      responses.map((r) => sendWhatsAppText({ to: r.to, body: r.body })),
    );

    return NextResponse.json({ ok: true });
  },
);

async function handleCommand(opts: {
  from: string;
  body: string;
  workspaceId: string;
  userId: string;
}): Promise<string> {
  const cmd = parseCommand(opts.body);

  if (cmd.kind === "help") {
    return [
      "AGB CRM commands:",
      "/log @hint body — log a touch on the matched contact",
      "/note tag: body — log a touch on the most recent contact tagged",
      "/find query — find a contact by name",
      "/help — this message",
    ].join("\n");
  }

  if (cmd.kind === "find") {
    if (!cmd.query) return "Usage: /find <name fragment>";
    const matches = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, opts.workspaceId),
          eq(contacts.archived, false),
          ilike(contacts.name, `%${cmd.query}%`),
        ),
      )
      .limit(5);
    if (matches.length === 0) return `No matches for "${cmd.query}".`;
    return matches.map((m) => `• ${m.name}`).join("\n");
  }

  if (cmd.kind === "log") {
    if (!cmd.targetHint || !cmd.body)
      return "Usage: /log @<name> <what happened>";
    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, opts.workspaceId),
          eq(contacts.archived, false),
          or(
            ilike(contacts.name, `%${cmd.targetHint}%`),
            ilike(contacts.name, cmd.targetHint),
          ),
        ),
      )
      .limit(1);
    if (!contact) return `No contact matched @${cmd.targetHint}.`;
    const [row] = await db
      .insert(touches)
      .values({
        contactId: contact.id,
        channel: "whatsapp",
        body: cmd.body,
        workspaceId: opts.workspaceId,
        createdBy: opts.userId,
      })
      .returning({ id: touches.id });
    await db
      .update(contacts)
      .set({ lastTouchAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, contact.id));
    return `Logged touch on ${contact.name}. (#${row.id.slice(0, 8)})`;
  }

  if (cmd.kind === "note") {
    return "Note logging not wired yet — coming in AGB-305.";
  }

  // Free-form: try to match the sender's WA number to a contact and log it.
  const senderContactId = await findContactByChannel({
    workspaceId: opts.workspaceId,
    kind: "whatsapp",
    value: opts.from,
  });
  if (senderContactId) {
    await db.insert(touches).values({
      contactId: senderContactId,
      channel: "whatsapp",
      body: opts.body,
      workspaceId: opts.workspaceId,
      createdBy: opts.userId,
    });
    await db
      .update(contacts)
      .set({ lastTouchAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, senderContactId));
    return "✓ logged";
  }

  return "Couldn't match you to a contact. Try /help.";
}
