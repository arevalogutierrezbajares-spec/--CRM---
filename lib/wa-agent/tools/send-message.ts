/**
 * send_message — send a drafted message to a contact via WhatsApp or email.
 *
 * CONFIRMATION-GATED: only call this after the user explicitly says YES.
 * After sending, auto-logs a touch on the contact.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/resend";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, contactChannels, touches } = schema;

export const sendMessage: ToolEntry = {
  definition: {
    name: "send_message",
    description:
      "Send a message to a contact via WhatsApp or email. " +
      "Only call this AFTER the user has explicitly confirmed (said YES). " +
      "Automatically logs a touch on the contact after sending.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        channel: { type: "string", enum: ["whatsapp", "email"] },
        message_body: { type: "string", description: "The final message text to send." },
        subject: { type: "string", description: "Email subject line (required for email channel)." },
      },
      required: ["contact_id", "channel", "message_body"],
    },
  },

  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const channel = safeStr(input.channel) as "whatsapp" | "email";
    const body = safeStr(input.message_body, 4096);
    const subject = safeStr(input.subject, 200);

    if (!contactId) return { ok: false, error: "contact_id is required" };
    if (!channel || !["whatsapp", "email"].includes(channel))
      return { ok: false, error: "channel must be whatsapp or email" };
    if (!body) return { ok: false, error: "message_body is required" };
    if (channel === "email" && !subject)
      return { ok: false, error: "subject is required for email" };

    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)))
      .limit(1);

    if (!contact) return { ok: false, error: "Contact not found" };

    // Resolve the channel address
    const [ch] = await db
      .select({ value: contactChannels.value })
      .from(contactChannels)
      .where(
        and(
          eq(contactChannels.contactId, contactId),
          eq(contactChannels.kind, channel),
        ),
      )
      .limit(1);

    if (!ch) {
      return {
        ok: false,
        error: `No ${channel} address on file for ${contact.name}. Add it with add_channel first.`,
      };
    }

    // Send
    let sendResult: { ok: boolean; error?: string; id?: string };
    if (channel === "whatsapp") {
      sendResult = await sendWhatsAppText({ to: ch.value, body });
    } else {
      sendResult = await sendEmail({ to: ch.value, subject, text: body });
    }

    if (!sendResult.ok) {
      return { ok: false, error: `Send failed: ${sendResult.error}` };
    }

    // Auto-log touch
    const touchChannel = channel === "whatsapp" ? "whatsapp" : "email";
    const [touchRow] = await db
      .insert(touches)
      .values({
        contactId,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        channel: touchChannel,
        body: channel === "email" ? `[Sent email] Subject: ${subject}\n\n${body.slice(0, 500)}` : `[Sent WA] ${body.slice(0, 500)}`,
      })
      .returning({ id: touches.id });

    await db
      .update(contacts)
      .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
      .where(eq(contacts.id, contactId));

    return {
      ok: true,
      data: { messageId: sendResult.id, touchId: touchRow.id, channel, to: ch.value },
      speak: `Sent! ${channel === "whatsapp" ? "WhatsApp" : "Email"} delivered to ${contact.name} and touch logged.`,
    };
  },
};
