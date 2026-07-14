import {
  PARTNER_KIND_OPTIONS,
  type PartnerKind,
} from "@/lib/partner-access";
import { ROOM_LOCALE_OPTIONS, resolveRoomLocale } from "@/lib/partner-room-i18n";
import { createPartnerRoomForContact, setRoomDemoLink } from "@/db/queries/partner-access";
import { safeStr, type ToolEntry } from "./_types";
import {
  partnerAccessUrl,
  resolveContactRef,
  resolveDemoRef,
  roomAdminUrl,
} from "./_partner-room";

const KIND_VALUES = PARTNER_KIND_OPTIONS.map((o) => o.value);
const KINDS = new Set<string>(KIND_VALUES);
const LOCALE_VALUES = ROOM_LOCALE_OPTIONS.map((o) => o.value);

export const createPartnerRoom: ToolEntry = {
  definition: {
    name: "create_partner_room",
    description:
      "Create a partner room (branded document-sharing microsite) for a contact, or reuse " +
      "the contact's existing room of the same kind. New rooms come back with a shareable " +
      "guest link — save it, since only its hash is stored. After creating, the usual crisp " +
      "setup is: add documents (add_room_documents), a welcome message + summary " +
      "(update_partner_room), next steps (add_room_next_step), then send the guest link. " +
      "Optionally feature a product demo (demo param) so the partner gets a one-tap " +
      '"Demo access" card in the room — use list_demos to see what is available.',
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
        language: {
          type: "string",
          enum: LOCALE_VALUES,
          description:
            "Guest-facing language the room renders in (es = Spanish, en = English); defaults to es",
        },
        name: {
          type: "string",
          description: 'Optional room name; defaults to "<Contact> Room"',
        },
        demo: {
          type: "string",
          description:
            "Optional demo to feature in the room — an exact demo id or a label fragment " +
            '(e.g. "CaneyCloud"). Renders as a "Demo access" card. Use list_demos to browse.',
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
      locale: resolveRoomLocale(safeStr(input.language, 8)),
      name: safeStr(input.name, 200) || null,
    });
    if (!res.ok) return res;

    // Optionally feature a demo. The room is the primary artifact, so a demo
    // that fails to resolve never fails room creation — it comes back as a note
    // the user can act on with feature_room_demo.
    let featuredDemo: { id: string; label: string } | null = null;
    let demoNote: string | null = null;
    const rawDemo = safeStr(input.demo, 120);
    if (rawDemo) {
      const resolved = await resolveDemoRef(ctx.workspaceId, rawDemo);
      if (!resolved.ok) {
        demoNote = `Room created, but the demo was not attached: ${resolved.error}`;
      } else {
        const updated = await setRoomDemoLink({
          workspaceId: ctx.workspaceId,
          roomId: res.room.id,
          demoLinkId: resolved.demo.id,
        });
        if (updated) featuredDemo = { id: resolved.demo.id, label: resolved.demo.label };
        else demoNote = "Room created, but attaching the demo failed — retry with feature_room_demo.";
      }
    }

    const guestUrl = res.accessToken ? partnerAccessUrl(res.accessToken) : null;
    const demoSpeak = featuredDemo
      ? ` Featuring the "${featuredDemo.label}" demo.`
      : demoNote
        ? ` (${demoNote})`
        : "";
    return {
      ok: true,
      data: {
        roomId: res.room.id,
        roomName: res.room.name,
        partnerKind: res.room.partnerKind,
        language: res.room.locale,
        status: res.room.status,
        existed: res.existed,
        guestUrl,
        adminUrl: roomAdminUrl(res.room.id),
        featuredDemo,
        demoNote,
        note: res.existed
          ? "Room already existed — its guest link is not re-displayable; use get_partner_room_link with fresh=true if a new link is needed."
          : "Save the guestUrl now — only its hash is stored, so it cannot be shown again without regenerating.",
      },
      speak: res.existed
        ? `Reusing ${contact.name}'s existing ${partnerKind} room "${res.room.name}".${demoSpeak}`
        : `Created room "${res.room.name}" for ${contact.name}. Guest link (save it — it cannot be re-shown): ${guestUrl}${demoSpeak}`,
    };
  },
};
