/**
 * add_channel — add a phone, email, WhatsApp, Instagram, or domain to a contact.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, contactChannels } = schema;

type Kind = "email" | "phone" | "whatsapp" | "instagram" | "domain";

function validateChannelValue(kind: Kind, value: string): string | null {
  if (kind === "email" && !value.includes("@")) return "Invalid email address";
  if (kind === "phone" && !/^[+0-9\s\-().]{6,20}$/.test(value)) return "Invalid phone number";
  if (kind === "whatsapp" && !/^\+?[0-9]{7,15}$/.test(value.replace(/[\s\-().]/g, "")))
    return "Invalid WhatsApp number (use E.164 format, e.g. +14155551234)";
  return null;
}

export const addChannel: ToolEntry = {
  definition: {
    name: "add_channel",
    description:
      "Add a phone number, email, WhatsApp, Instagram handle, or domain to a contact. " +
      "Checks for duplicates before inserting. Sets isPrimary if it's the first channel of that kind.",
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
          description: "The value to add, e.g. +14155551234 or oscar@laguaquira.com.",
        },
      },
      required: ["contact_id", "kind", "value"],
    },
  },

  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const kind = safeStr(input.kind) as Kind;
    const value = safeStr(input.value, 500).trim();

    if (!contactId) return { ok: false, error: "contact_id is required" };
    if (!kind || !["email", "phone", "whatsapp", "instagram", "domain"].includes(kind))
      return { ok: false, error: "Invalid kind" };
    if (!value) return { ok: false, error: "value is required" };

    const validationError = validateChannelValue(kind, value);
    if (validationError) return { ok: false, error: validationError };

    // Verify contact belongs to workspace
    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)))
      .limit(1);

    if (!contact) return { ok: false, error: "Contact not found" };

    // Check for exact duplicate
    const existing = await db
      .select({ id: contactChannels.id, kind: contactChannels.kind, value: contactChannels.value })
      .from(contactChannels)
      .where(eq(contactChannels.contactId, contactId));

    const duplicate = existing.find(
      (c) => c.kind === kind && c.value.toLowerCase() === value.toLowerCase(),
    );
    if (duplicate) {
      return {
        ok: false,
        error: `${contact.name} already has that ${kind} on file: ${value}`,
      };
    }

    // First of this kind → isPrimary
    const isPrimary = !existing.some((c) => c.kind === kind);

    const [row] = await db
      .insert(contactChannels)
      .values({ contactId, kind, value, isPrimary })
      .returning({ id: contactChannels.id });

    return {
      ok: true,
      data: { id: row.id, kind, value, isPrimary },
      speak: `Added ${kind} ${value} to ${contact.name}${isPrimary ? " (set as primary)" : ""}.`,
    };
  },
};
