import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { SITE_URL } from "@/lib/site-url";
import { safeStr } from "./_types";

const { contacts, partnerRooms } = schema;

export { SITE_URL };

/** Public guest-facing link for a freshly minted access token. */
export const partnerAccessUrl = (token: string) => `${SITE_URL}/access/${token}`;

/** Internal admin page for a room (requires CRM login). */
export const roomAdminUrl = (roomId: string) =>
  `${SITE_URL}/partner-access/rooms/${roomId}`;

/** Site-relative asset paths become absolute so the agent can open/verify them. */
export function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${SITE_URL}${url}` : url;
}

/**
 * Parse a YYYY-MM-DD date as end-of-day (server TZ — parity with the app's
 * parseExpiresAt). Returns null for anything unparseable.
 */
export function parseDayEnd(value: string): Date | null {
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Error string when a room can no longer receive content, else null. */
export function roomWriteBlocked(room: PartnerRoomRow): string | null {
  if (room.status === "revoked") {
    return "This room is revoked — revoked rooms are frozen. Create a new room instead.";
  }
  return null;
}

export type PartnerRoomRow = typeof schema.partnerRooms.$inferSelect;

/**
 * Shared JSON-schema fragment: every room tool accepts room_id, or falls back
 * to a contact reference when the contact has exactly one live room.
 */
export const ROOM_REF_PROPS = {
  room_id: {
    type: "string",
    description: "Exact room id (preferred when known)",
  },
  contact_id: {
    type: "string",
    description:
      "Contact id — used when room_id is absent and the contact has exactly one room",
  },
  contact_query: {
    type: "string",
    description:
      "Contact name or organization fragment — used when neither room_id nor contact_id is given",
  },
};

export async function resolveContactRef(
  workspaceId: string,
  input: Record<string, unknown>,
): Promise<
  { ok: true; id: string; name: string } | { ok: false; error: string }
> {
  const contactId = safeStr(input.contact_id, 64);
  const contactQuery = safeStr(input.contact_query, 120);
  if (contactId) {
    const [c] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)))
      .limit(1);
    return c
      ? { ok: true, ...c }
      : { ok: false, error: "No contact with that id in this workspace" };
  }
  if (contactQuery) {
    // archived=false matches find_contact — archived contacts stay unreachable.
    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        organization: contacts.organization,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.archived, false),
          or(
            ilike(contacts.name, `%${contactQuery}%`),
            ilike(contacts.organization, `%${contactQuery}%`),
          ),
        ),
      )
      .limit(3);
    if (rows.length === 0) {
      return {
        ok: false,
        error: `No contact matching "${contactQuery}". Use find_contact to search, or create_contact to add them first.`,
      };
    }
    if (rows.length > 1) {
      const list = rows
        .map(
          (r) =>
            `${r.name}${r.organization ? ` (${r.organization})` : ""} [${r.id}]`,
        )
        .join("; ");
      return {
        ok: false,
        error: `Multiple contacts match "${contactQuery}": ${list} — pass contact_id.`,
      };
    }
    return { ok: true, id: rows[0].id, name: rows[0].name };
  }
  return { ok: false, error: "Provide room_id, contact_id, or contact_query" };
}

/**
 * Resolve a partner room from room_id, or from a contact reference when the
 * contact has exactly one non-revoked room. Ambiguity comes back as an error
 * listing the candidates so the agent can ask instead of guessing.
 */
export async function resolveRoomRef(
  workspaceId: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; room: PartnerRoomRow } | { ok: false; error: string }> {
  const roomId = safeStr(input.room_id, 64);
  if (roomId) {
    const [room] = await db
      .select()
      .from(partnerRooms)
      .where(
        and(eq(partnerRooms.id, roomId), eq(partnerRooms.workspaceId, workspaceId)),
      )
      .limit(1);
    return room
      ? { ok: true, room }
      : { ok: false, error: "No room with that id in this workspace" };
  }

  const contact = await resolveContactRef(workspaceId, input);
  if (!contact.ok) return contact;

  const rooms = await db
    .select()
    .from(partnerRooms)
    .where(
      and(
        eq(partnerRooms.workspaceId, workspaceId),
        eq(partnerRooms.primaryContactId, contact.id),
        ne(partnerRooms.status, "revoked"),
      ),
    )
    .orderBy(desc(partnerRooms.updatedAt))
    .limit(20);

  if (rooms.length === 0) {
    return {
      ok: false,
      error: `${contact.name} has no partner room yet — use create_partner_room first.`,
    };
  }
  if (rooms.length > 1) {
    const list = rooms
      .map((r) => `"${r.name}" (${r.partnerKind}, ${r.status}) [${r.id}]`)
      .join("; ");
    return {
      ok: false,
      error: `${contact.name} has ${rooms.length} rooms: ${list} — pass room_id.`,
    };
  }
  return { ok: true, room: rooms[0] };
}
