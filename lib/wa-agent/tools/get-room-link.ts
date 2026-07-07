import { regeneratePartnerRoomAccessToken } from "@/db/queries/partner-access";
import type { ToolEntry } from "./_types";
import { ROOM_REF_PROPS, partnerAccessUrl, resolveRoomRef } from "./_partner-room";

export const getRoomLink: ToolEntry = {
  definition: {
    name: "get_partner_room_link",
    description:
      "Get the shareable guest link for a partner room. Tokens are stored hashed, so an " +
      "already-issued link can never be re-displayed: if the room has one and fresh is not " +
      "set, this reports that instead of returning a URL. Pass fresh=true to mint a new " +
      "link — that INVALIDATES any previously sent link, so confirm with the user first. " +
      "If the room has never issued a link, one is minted automatically.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        fresh: {
          type: "boolean",
          description: "Mint a new link, killing the old one (default false)",
        },
      },
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const { room } = ref;

    if (room.status === "revoked") {
      return { ok: false, error: "This room is revoked — revoked rooms cannot issue links" };
    }

    const hasToken = Boolean(room.publicAccessTokenHash);
    const expired = Boolean(room.expiresAt && room.expiresAt.getTime() < ctx.now.getTime());

    if (hasToken && input.fresh !== true) {
      return {
        ok: true,
        data: {
          roomId: room.id,
          roomName: room.name,
          guestUrl: null,
          linkIssuedAt: room.publicAccessTokenCreatedAt,
          lastViewedAt: room.publicAccessLastViewedAt,
          status: room.status,
          expired,
          note:
            "A guest link was already issued and only its hash is stored, so it cannot be shown again. " +
            "If the user still has it (e.g. in WhatsApp history) they can reuse it; otherwise call " +
            "get_partner_room_link with fresh=true to mint a new one — after confirming, since that " +
            "invalidates the old link.",
        },
      };
    }

    const res = await regeneratePartnerRoomAccessToken({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      roomId: room.id,
    });
    if (!res.ok) return res;

    const warnings: string[] = [];
    if (hasToken) warnings.push("The previously issued link is now invalid.");
    if (res.room.status !== "active") {
      warnings.push(`Room status is "${res.room.status}" — the link won't open until it is active.`);
    }
    if (expired) {
      warnings.push("The room's expiry date has passed — update expires_at or the link won't open.");
    }

    const guestUrl = partnerAccessUrl(res.accessToken);
    return {
      ok: true,
      data: {
        roomId: room.id,
        roomName: room.name,
        guestUrl,
        status: res.room.status,
        passcodeSet: Boolean(res.room.passcodeHash),
        warnings,
      },
      speak: `Guest link for "${room.name}": ${guestUrl}`,
    };
  },
};
