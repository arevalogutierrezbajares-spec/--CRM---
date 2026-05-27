import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, contactChannels, touches } = schema;

export const draftMessage: ToolEntry = {
  definition: {
    name: "draft_message",
    description:
      "Gather context needed to draft a message to a contact. Returns the contact's " +
      "channels, recent touches, and a ready-to-draft prompt. The agent should then " +
      "compose the message and show it to the user for review before calling send_message.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        channel: {
          type: "string",
          enum: ["whatsapp", "email"],
        },
        purpose: {
          type: "string",
          description: "What the message should accomplish (e.g. 'follow up on our call')",
        },
        tone: {
          type: "string",
          description: "Desired tone: friendly, formal, casual, urgent",
        },
      },
      required: ["contact_id", "channel", "purpose"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const channel = safeStr(input.channel) as "whatsapp" | "email";
    const purpose = safeStr(input.purpose, 300);
    const tone = safeStr(input.tone, 60) || "friendly";

    if (!contactId || !channel || !purpose)
      return { ok: false, error: "contact_id, channel, and purpose are required" };

    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name, org: contacts.organization })
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
      return {
        ok: false,
        error: `No ${channel} on file for ${contact.name}. Add one with add_channel first.`,
      };

    const recentTouches = await db
      .select({ body: touches.body, channel: touches.channel, createdAt: touches.createdAt })
      .from(touches)
      .where(
        and(eq(touches.contactId, contactId), eq(touches.workspaceId, ctx.workspaceId)),
      )
      .orderBy(desc(touches.createdAt))
      .limit(3);

    const context = [
      `Contact: ${contact.name}${contact.org ? ` (${contact.org})` : ""}`,
      `Channel: ${channel} — ${channelRow.value}`,
      `Purpose: ${purpose}`,
      `Tone: ${tone}`,
      recentTouches.length
        ? `Recent history:\n${recentTouches
            .map((t) => `  [${t.channel}] ${t.body.slice(0, 120)}`)
            .join("\n")}`
        : "No prior touches on record.",
    ].join("\n");

    return {
      ok: true,
      data: {
        contactId,
        contactName: contact.name,
        channelAddress: channelRow.value,
        channel,
        context,
      },
      speak:
        `Ready to draft. Composing ${tone} ${channel} to ${contact.name}...`,
    };
  },
};
