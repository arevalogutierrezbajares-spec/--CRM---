import {
  PARTNER_KIND_OPTIONS,
  type PartnerKind,
} from "@/lib/partner-access";
import { createPartnerRoomForContact } from "@/db/queries/partner-access";
import { safeStr, type ToolEntry } from "./_types";
import { partnerAccessUrl, resolveContactRef, roomAdminUrl } from "./_partner-room";

const KIND_VALUES = PARTNER_KIND_OPTIONS.map((o) => o.value);
const KINDS = new Set<string>(KIND_VALUES);

export const createPartnerRoom: ToolEntry = {
  definition: {
    name: "create_partner_room",
    description:
      "Create a partner room (branded document-sharing microsite) for a contact, or reuse " +
      "the contact's existing room of the same kind. New rooms come back with a shareable " +
      "guest link — save it, since only its hash is stored. After creating, the usual crisp " +
      "setup is: add documents (add_room_documents), a welcome message + summary " +
      "(update_partner_room), next steps (add_room_next_step), then send the guest link.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "Exact contact id (preferred)" },
        contact_query: {
          type: "string",
          description: "Contact name/organization fragment, used only if contact_id is absent",
        },
        partner_kind: {
          type: "string",
          enum: KIND_VALUES,
          description: "Relationship type for the room; defaults to client",
        },
        name: {
          type: "string",
          description: 'Optional room name; defaults to "<Contact> Room"',
        },
      },
    },
  },
  async execute(input, ctx) {
    const contact = await resolveContactRef(ctx.workspaceId, input);
    if (!contact.ok) return contact;

    const rawKind = safeStr(input.partner_kind, 40);
    if (rawKind && !KINDS.has(rawKind)) {
      return {
        ok: false,
        error: `Invalid partner_kind "${rawKind}". Options: ${KIND_VALUES.join(", ")}`,
      };
    }
    const partnerKind = (rawKind || "client") as PartnerKind;

    const res = await createPartnerRoomForContact({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      contactId: contact.id,
      partnerKind,
      name: safeStr(input.name, 200) || null,
    });
    if (!res.ok) return res;

    const guestUrl = res.accessToken ? partnerAccessUrl(res.accessToken) : null;
    return {
      ok: true,
      data: {
        roomId: res.room.id,
        roomName: res.room.name,
        partnerKind: res.room.partnerKind,
        status: res.room.status,
        existed: res.existed,
        guestUrl,
        adminUrl: roomAdminUrl(res.room.id),
        note: res.existed
          ? "Room already existed — its guest link is not re-displayable; use get_partner_room_link with fresh=true if a new link is needed."
          : "Save the guestUrl now — only its hash is stored, so it cannot be shown again without regenerating.",
      },
      speak: res.existed
        ? `Reusing ${contact.name}'s existing ${partnerKind} room "${res.room.name}".`
        : `Created room "${res.room.name}" for ${contact.name}. Guest link (save it — it cannot be re-shown): ${guestUrl}`,
    };
  },
};
