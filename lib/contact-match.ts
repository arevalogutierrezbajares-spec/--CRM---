import { and, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts, contactChannels } = schema;

/**
 * Match an inbound communication (email address, phone number, WhatsApp ID)
 * to a contact owned by the given user. Returns the contact id or null.
 */
export async function findContactByChannel(opts: {
  workspaceId: string;
  kind: "email" | "phone" | "whatsapp" | "instagram" | "domain";
  value: string;
}): Promise<string | null> {
  const normalized = opts.value.trim().toLowerCase();
  if (!normalized) return null;

  const [row] = await db
    .select({ contactId: contacts.id })
    .from(contactChannels)
    .innerJoin(contacts, eq(contacts.id, contactChannels.contactId))
    .where(
      and(
        eq(contacts.workspaceId, opts.workspaceId),
        eq(contactChannels.kind, opts.kind),
        ilike(contactChannels.value, normalized),
      ),
    )
    .limit(1);
  return row?.contactId ?? null;
}

/**
 * For an email, also try matching by the bare local part or the org domain
 * (helps when someone emails from a new address but the org matches).
 */
export async function findContactByEmail(opts: {
  workspaceId: string;
  email: string;
}): Promise<string | null> {
  const exact = await findContactByChannel({
    workspaceId: opts.workspaceId,
    kind: "email",
    value: opts.email,
  });
  if (exact) return exact;

  const domain = opts.email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  const [row] = await db
    .select({ contactId: contacts.id })
    .from(contactChannels)
    .innerJoin(contacts, eq(contacts.id, contactChannels.contactId))
    .where(
      and(
        eq(contacts.workspaceId, opts.workspaceId),
        or(
          and(
            eq(contactChannels.kind, "domain"),
            ilike(contactChannels.value, domain),
          ),
          and(
            eq(contactChannels.kind, "email"),
            ilike(contactChannels.value, `%@${domain}`),
          ),
        ),
      ),
    )
    .limit(1);
  return row?.contactId ?? null;
}
