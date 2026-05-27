import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, contactChannels } = schema;

function validateChannelValue(kind: string, value: string): string | null {
  if (kind === "email" && !value.includes("@")) return "Invalid email address";
  if (
    kind === "phone" &&
    !/^[+0-9\s\-().]{6,20}$/.test(value)
  )
    return "Invalid phone number";
  if (
    kind === "whatsapp" &&
    !/^\+?[0-9]{7,15}$/.test(value.replace(/[\s\-().]/g, ""))
  )
    return "Invalid WhatsApp number (use E.164 format, e.g. +14155551234)";
  return null;
}

export const addChannel: ToolEntry = {
  definition: {
    name: "add_channel",
    description:
      "Add a communication channel (email, phone, whatsapp, instagram, domain) to a contact. " +
      "Validates format and rejects exact duplicates.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["email", "phone", "whatsapp", "instagram", "domain"],
        },
        value: {
          type: "string",
          description: "The channel value (email address, phone number, handle, etc.)",
        },
      },
      required: ["contact_id", "kind", "value"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const kind = safeStr(input.kind);
    const value = safeStr(input.value, 300).trim();

    if (!contactId || !kind || !value)
      return { ok: false, error: "contact_id, kind, and value are required" };

    const validErr = validateChannelValue(kind, value);
    if (validErr) return { ok: false, error: validErr };

    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)),
      )
      .limit(1);
    if (!contact) return { ok: false, error: "Contact not found" };

    // Duplicate check
    const [existing] = await db
      .select({ id: contactChannels.id })
      .from(contactChannels)
      .where(
        and(
          eq(contactChannels.contactId, contactId),
          eq(contactChannels.kind, kind as "email" | "phone" | "whatsapp" | "instagram" | "domain"),
          eq(contactChannels.value, value),
        ),
      )
      .limit(1);
    if (existing) return { ok: false, error: `${kind} "${value}" is already on file for this contact` };

    // Is this the first channel of this kind for the contact?
    const [anyOfKind] = await db
      .select({ id: contactChannels.id })
      .from(contactChannels)
      .where(
        and(
          eq(contactChannels.contactId, contactId),
          eq(contactChannels.kind, kind as "email" | "phone" | "whatsapp" | "instagram" | "domain"),
        ),
      )
      .limit(1);
    const isPrimary = !anyOfKind;

    const [row] = await db
      .insert(contactChannels)
      .values({
        contactId,
        kind: kind as "email" | "phone" | "whatsapp" | "instagram" | "domain",
        value,
        isPrimary,
      })
      .returning({ id: contactChannels.id });

    return {
      ok: true,
      data: { id: row.id, isPrimary },
      speak: `Added ${kind} ${value} to ${contact.name}${isPrimary ? " (set as primary)" : ""}.`,
    };
  },
};
