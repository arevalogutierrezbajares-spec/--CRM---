/**
 * draft_message — generate an outreach message for a contact.
 *
 * Does NOT write to the DB or send anything. Returns the draft text for the
 * user to review. Pair with send_message after confirmation.
 *
 * The agent uses its own LLM context (persona, relationship type, recent
 * touches) to write the draft. This tool just assembles the context so the
 * agent has the right data in one call.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, contactChannels, touches } = schema;

type Channel = "whatsapp" | "email";
type Tone = "formal" | "friendly" | "neutral";

export const draftMessage: ToolEntry = {
  definition: {
    name: "draft_message",
    description:
      "Look up a contact's details and recent touches so you can draft an outreach message. " +
      "Returns the contact's name, relationship type, available channels, and last 3 touch excerpts. " +
      "After calling this tool, write the draft in your reply text. " +
      "The user will confirm before sending. Pair with send_message.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "UUID of the contact to message." },
        channel: {
          type: "string",
          enum: ["whatsapp", "email"],
          description: "Channel to draft for (affects tone and format).",
        },
        purpose: {
          type: "string",
          description: "What this message is for, e.g. 'schedule a site visit', 'intro to Joe'.",
        },
        tone: {
          type: "string",
          enum: ["formal", "friendly", "neutral"],
          description: "Desired tone. Default: neutral.",
        },
      },
      required: ["contact_id", "channel", "purpose"],
    },
  },

  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const channel = (safeStr(input.channel) || "whatsapp") as Channel;
    const purpose = safeStr(input.purpose, 500);
    const tone = (safeStr(input.tone) || "neutral") as Tone;

    if (!contactId) return { ok: false, error: "contact_id is required" };
    if (!purpose) return { ok: false, error: "purpose is required" };

    const [contact] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        type: contacts.type,
        organization: contacts.organization,
        relationshipType: contacts.relationshipType,
        introChainFromText: contacts.introChainFromText,
      })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)))
      .limit(1);

    if (!contact) return { ok: false, error: "Contact not found" };

    // Available send channels for this contact
    const channels = await db
      .select({ kind: contactChannels.kind, value: contactChannels.value, isPrimary: contactChannels.isPrimary })
      .from(contactChannels)
      .where(eq(contactChannels.contactId, contactId));

    const hasChannel = channels.some((c) => c.kind === channel);
    if (!hasChannel) {
      const available = channels.map((c) => c.kind).join(", ") || "none";
      return {
        ok: false,
        error: `No ${channel} channel on file for ${contact.name}. Available: ${available}. Use add_channel first.`,
      };
    }

    // Last 3 touches for context
    const recentTouches = await db
      .select({ body: touches.body, channel: touches.channel, createdAt: touches.createdAt })
      .from(touches)
      .where(and(eq(touches.contactId, contactId), eq(touches.workspaceId, ctx.workspaceId)))
      .orderBy(desc(touches.createdAt))
      .limit(3);

    const channelAddr = channels.find((c) => c.kind === channel && c.isPrimary)?.value
      ?? channels.find((c) => c.kind === channel)?.value
      ?? "";

    return {
      ok: true,
      data: {
        contact: {
          id: contact.id,
          name: contact.name,
          organization: contact.organization,
          relationshipType: contact.relationshipType,
          introContext: contact.introChainFromText,
        },
        channel,
        channelAddress: channelAddr,
        tone,
        purpose,
        recentTouches: recentTouches.map((t) => ({
          channel: t.channel,
          when: t.createdAt,
          excerpt: t.body.slice(0, 120),
        })),
        instruction:
          `Now write a ${tone} ${channel === "whatsapp" ? "WhatsApp message" : "email"} to ${contact.name} ` +
          `for the purpose: "${purpose}". Keep it brief. ` +
          `${channel === "whatsapp" ? "No markdown. Plain text only. Max 200 words." : "Include a subject line prefixed with SUBJECT:"}. ` +
          `Present it to the user and ask: "Send this to ${contact.name}? (YES / NO)"`,
      },
      speak: `Ready to draft. Composing ${tone} ${channel} to ${contact.name}...`,
    };
  },
};
