import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/resend";

const { contacts, contactChannels, touches } = schema;

export const sendMessage: ToolEntry = {
  definition: {
    name: "send_message",
    description:
      "Send a drafted message to a contact via whatsapp or email. " +
      "ONLY call this AFTER the user has reviewed and confirmed the draft. " +
      "Auto-logs a touch after sending.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        channel: { type: "string", enum: ["whatsapp", "email"] },
        message_body: { type: "string" },
        subject: {
          type: "string",
          description: "Required for email channel",
        },
      },
      required: ["contact_id", "channel", "message_body"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const channel = safeStr(input.channel) as "whatsapp" | "email";
    const body = safeStr(input.message_body, 4000);
    const subject = safeStr(input.subject, 200);

    if (!contactId || !channel || !body)
      return { ok: false, error: "contact_id, channel, and message_body are required" };
    if (channel === "email" && !subject)
      return { ok: false, error: "subject is required for email" };

    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)),
      )
      .limit(1);
    if (!contact) return { ok: false, error: "Contact not found" };

    const channelKind = channel === "whatsapp" ? "whatsapp" : "email";
    const [channelRow] = await db
      .select({ value: contactChannels.value })
      .from(contactChannels)
      .where(
        and(
          eq(contactChannels.contactId, contactId),
          eq(contactChannels.kind, channelKind),
        ),
      )
      .limit(1);
    if (!channelRow)
      return { ok: false, error: `No ${channel} on file for ${contact.name}` };

    if (channel === "whatsapp") {
      const result = await sendWhatsAppText({ to: channelRow.value, body });
      if (!result.ok) return { ok: false, error: `WhatsApp send failed: ${result.error}` };
    } else {
      const result = await sendEmail({
        to: channelRow.value,
        subject,
        html: body.replace(/\n/g, "<br>"),
        text: body,
      });
      if (!result.ok) return { ok: false, error: `Email send failed: ${result.error}` };
    }

    // Log touch
    await db.insert(touches).values({
      contactId,
      body: channel === "email" ? `[${subject}] ${body.slice(0, 500)}` : body.slice(0, 500),
      channel: channel === "whatsapp" ? "whatsapp" : "email",
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
    });

    await db
      .update(contacts)
      .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
      .where(eq(contacts.id, contactId));

    return {
      ok: true,
      data: { contactId, channel, address: channelRow.value },
      speak: `Sent ${channel} to ${contact.name} at ${channelRow.value}.`,
    };
  },
};
