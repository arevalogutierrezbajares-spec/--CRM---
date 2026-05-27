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
import { downloadWaMedia } from "@/lib/wa-agent/media/download";
import { transcribeVoice, isTranscriptionConfigured } from "@/lib/wa-agent/media/transcribe";
import { storeMedia, isStorageConfigured } from "@/lib/wa-agent/media/store";
import { parseWaContacts, contactCardSummary } from "@/lib/wa-agent/media/vcard";
import { extractLinks } from "@/lib/wa-agent/media/links";

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

    type WaMessage = {
      from?: string;
      type?: string;
      // text
      text?: { body?: string };
      // audio / voice
      audio?: { id?: string; mime_type?: string; voice?: boolean };
      // image
      image?: { id?: string; mime_type?: string; caption?: string };
      // document
      document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
      // video
      video?: { id?: string; mime_type?: string; caption?: string };
      // shared contacts (vCard)
      contacts?: Array<{
        name?: { formatted_name?: string; first_name?: string; last_name?: string };
        phones?: Array<{ phone?: string; type?: string; wa_id?: string }>;
        emails?: Array<{ email?: string; type?: string }>;
        org?: { company?: string };
      }>;
    };
    let payload: {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messaging_product?: string;
            metadata?: { phone_number_id?: string; display_phone_number?: string };
            messages?: WaMessage[];
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

    // Multiple test numbers under one Meta app share the same webhook URL.
    // Only handle messages destined for OUR phone_number_id; forward the rest
    // to a sibling agent's webhook (if configured) so we don't black-hole it.
    const ourPnid = process.env.WA_PHONE_NUMBER_ID;
    const forwardUrl = process.env.WA_FORWARD_OTHER_PNIDS_URL || null;

    const useAgent = process.env.AGB_WA_AGENT === "1";

    const responses: { to: string; body: string }[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const inboundPnid = change.value?.metadata?.phone_number_id;
        if (ourPnid && inboundPnid && inboundPnid !== ourPnid) {
          // Not our number. Optionally forward to the sibling webhook.
          if (forwardUrl) {
            // Fire-and-forget; we still 200 back to Meta on our own.
            void fetch(forwardUrl, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                // Pass Meta's signature so the downstream can verify if it wants to.
                "x-hub-signature-256":
                  req.headers.get("x-hub-signature-256") ?? "",
              },
              body: JSON.stringify({ entry: [{ changes: [change] }] }),
            }).catch(() => {});
          }
          continue;
        }

        for (const msg of change.value?.messages ?? []) {
          if (!msg.from) continue;

          const verdict = await checkRateLimit(msg.from);
          if (!verdict.allowed) {
            responses.push({
              to: msg.from,
              body: `Slow down — try again in ${verdict.retryAfterSeconds}s.`,
            });
            continue;
          }

          // ── Resolve the inbound body + metadata for all message types ──
          let body = "";
          let mediaContext: { source: "voice" | "image" | "document" | "vcard" | "link" | "text"; transcribedLang?: string } =
            { source: "text" };

          if (msg.type === "text" && msg.text?.body) {
            body = msg.text.body;
            // Enrich with link note if URLs present
            const links = extractLinks(body);
            if (links.length > 0) {
              mediaContext = { source: "link" };
            }

          } else if (msg.type === "audio" && msg.audio?.id) {
            // Voice note — download + transcribe
            const dl = await downloadWaMedia(msg.audio.id);
            if (!dl.ok) {
              responses.push({ to: msg.from, body: "Couldn't download your voice note. Try again." });
              continue;
            }
            if (!isTranscriptionConfigured()) {
              responses.push({ to: msg.from, body: "Voice transcription isn't configured yet. Send a text message instead." });
              continue;
            }
            const tx = await transcribeVoice(dl.buffer, dl.filename);
            if (!tx.ok) {
              responses.push({ to: msg.from, body: `Couldn't transcribe voice note: ${tx.error}` });
              continue;
            }
            body = tx.text;
            mediaContext = { source: "voice", transcribedLang: tx.language };

            // Store original audio (best-effort)
            if (isStorageConfigured() && useAgent) {
              const resolved = await resolveSender(msg.from);
              if (resolved) {
                void storeMedia({
                  workspaceId: resolved.workspaceId,
                  buffer: dl.buffer,
                  mimeType: dl.mimeType,
                  originalFilename: dl.filename,
                }).catch(() => {});
              }
            }

          } else if ((msg.type === "image" || msg.type === "video") && (msg.image?.id || msg.video?.id)) {
            const mediaId = (msg.image?.id ?? msg.video?.id)!;
            const caption = msg.image?.caption ?? msg.video?.caption ?? "";
            const dl = await downloadWaMedia(mediaId);
            if (dl.ok && isStorageConfigured()) {
              const resolved = await resolveSender(msg.from);
              if (resolved) {
                const stored = await storeMedia({
                  workspaceId: resolved.workspaceId,
                  buffer: dl.buffer,
                  mimeType: dl.mimeType,
                  originalFilename: dl.filename,
                });
                if (stored.ok) {
                  body = `[${msg.type === "image" ? "Image" : "Video"} shared] ${caption ? caption + " — " : ""}Stored at: ${stored.signedUrl}`;
                  mediaContext = { source: "image" };
                }
              }
            }
            if (!body) {
              body = `[${msg.type === "image" ? "Image" : "Video"} shared]${caption ? " " + caption : ""}`;
              mediaContext = { source: "image" };
            }

          } else if (msg.type === "document" && msg.document?.id) {
            const caption = msg.document.caption ?? "";
            const filename = msg.document.filename ?? "document";
            const dl = await downloadWaMedia(msg.document.id);
            if (dl.ok && isStorageConfigured()) {
              const resolved = await resolveSender(msg.from);
              if (resolved) {
                const stored = await storeMedia({
                  workspaceId: resolved.workspaceId,
                  buffer: dl.buffer,
                  mimeType: dl.mimeType,
                  originalFilename: filename,
                });
                if (stored.ok) {
                  body = `[Document shared: ${filename}] ${caption ? caption + " — " : ""}Stored at: ${stored.signedUrl}`;
                  mediaContext = { source: "document" };
                }
              }
            }
            if (!body) {
              body = `[Document shared: ${filename}]${caption ? " " + caption : ""}`;
              mediaContext = { source: "document" };
            }

          } else if (msg.type === "contacts" && msg.contacts?.length) {
            // Shared contact cards (vCards)
            const parsed = parseWaContacts({ contacts: msg.contacts });
            const summaries = parsed.map(contactCardSummary).join("\n");
            body = `[Contact card shared]\n${summaries}\n\nShould I add ${parsed.map((c) => c.formattedName).join(", ")} to the CRM?`;
            mediaContext = { source: "vcard" };

          } else {
            // Unsupported type (location, sticker, reaction, etc.) — skip silently
            continue;
          }

          if (!body) continue;

          if (useAgent) {
            // Inject media context supplement for voice notes (always-confirm gate)
            const agentBody = mediaContext.source === "voice"
              ? `[Voice Note${mediaContext.transcribedLang ? ` – detected language: ${mediaContext.transcribedLang}` : ""}]\nTranscription: "${body}"\n\nIMPORTANT: Start your reply with "I heard: '${body.slice(0, 80)}...' — " then state what you plan to do and ask YES/NO before taking any action.`
              : body;

            const r = await agentHandle({ senderPhone: msg.from, body: agentBody });
            responses.push({ to: msg.from, body: r.reply });
            continue;
          }

          // Legacy slash-command path
          if (msg.type !== "text") {
            responses.push({ to: msg.from, body: "Media handling requires the AI agent (AGB_WA_AGENT=1)." });
            continue;
          }
          const resolved = await resolveSender(msg.from);
          if (!resolved) {
            responses.push({ to: msg.from, body: "I don't recognize this number. Add it in /profile → WhatsApp." });
            continue;
          }
          const reply = await handleCommand({
            from: msg.from,
            body,
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
