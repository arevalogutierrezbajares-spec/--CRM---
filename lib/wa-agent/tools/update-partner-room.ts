import {
  setPartnerRoomPasscode,
  setPartnerRoomSeatLimit,
  updatePartnerRoomDetails,
  updatePartnerRoomStatus,
} from "@/db/queries/partner-access";
import {
  PARTNER_KIND_OPTIONS,
  PARTNER_ROOM_STATUS_OPTIONS,
  type PartnerKind,
  type PartnerRoomStatus,
} from "@/lib/partner-access";
import { isValidPartnerPasscode } from "@/lib/partner-room-gate.server";
import { safeStr, type ToolEntry } from "./_types";
import { ROOM_REF_PROPS, parseDayEnd, resolveRoomRef } from "./_partner-room";

const KIND_VALUES = PARTNER_KIND_OPTIONS.map((o) => o.value);
const STATUS_VALUES = PARTNER_ROOM_STATUS_OPTIONS.map((o) => o.value);
const KINDS = new Set<string>(KIND_VALUES);
const STATUSES = new Set<string>(STATUS_VALUES);

const SUMMARY_MAX = 1000;
const WELCOME_MAX = 4000;

export const updatePartnerRoom: ToolEntry = {
  definition: {
    name: "update_partner_room",
    description:
      "Update a partner room's presentation and access settings. Only the fields provided " +
      "change; every field is validated before anything is written. Covers: name, " +
      "partner_kind, summary (short pitch under the room title), welcome_message (greeting " +
      "the partner reads on arrival), status (draft/active/paused/revoked — only active " +
      "rooms are viewable), expires_at, seat_limit, and a 4-digit passcode gate. " +
      'Pass "clear" to remove summary/welcome/passcode/expiry. Revoking permanently kills ' +
      "all shares and needs confirm_revoke=true after the user explicitly agrees.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        name: { type: "string", description: "New room name" },
        partner_kind: { type: "string", enum: KIND_VALUES },
        summary: {
          type: "string",
          description: `Short description under the room title (max ${SUMMARY_MAX} chars); "clear" or empty removes it`,
        },
        welcome_message: {
          type: "string",
          description: `Greeting shown to the partner (max ${WELCOME_MAX} chars); "clear" or empty removes it`,
        },
        status: {
          type: "string",
          enum: STATUS_VALUES,
          description: "revoked is permanent and kills all shares — requires confirm_revoke",
        },
        confirm_revoke: {
          type: "boolean",
          description: "Must be true to set status revoked; only after the user explicitly confirmed",
        },
        expires_at: {
          type: "string",
          description: 'Link expiry date YYYY-MM-DD, or "clear"/"never" to remove',
        },
        passcode: {
          type: "string",
          description: 'Exactly 4 digits to gate the room, or "clear" to remove',
        },
        seat_limit: {
          type: "integer",
          description: "Max distinct guests who may claim a seat (1-1000); 0 = unlimited",
        },
      },
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    let room = ref.room;

    // ── Validate every provided field BEFORE any write, so a bad field can
    // never leave the room half-updated.
    const name = safeStr(input.name, 200);
    const rawKind = safeStr(input.partner_kind, 40);
    if (rawKind && !KINDS.has(rawKind)) {
      return { ok: false, error: `Invalid partner_kind: ${rawKind}. Options: ${KIND_VALUES.join(", ")}` };
    }

    const isClear = (v: string) => v.toLowerCase() === "clear";

    const hasSummary = typeof input.summary === "string";
    if (hasSummary && (input.summary as string).length > SUMMARY_MAX) {
      return { ok: false, error: `summary is too long (max ${SUMMARY_MAX} characters)` };
    }
    const hasWelcome = typeof input.welcome_message === "string";
    if (hasWelcome && (input.welcome_message as string).length > WELCOME_MAX) {
      return { ok: false, error: `welcome_message is too long (max ${WELCOME_MAX} characters)` };
    }

    const rawExpires = safeStr(input.expires_at, 20);
    let expiresAt = room.expiresAt;
    if (rawExpires) {
      if (isClear(rawExpires) || rawExpires.toLowerCase() === "never") {
        expiresAt = null;
      } else {
        const parsed = parseDayEnd(rawExpires);
        if (!parsed) {
          return { ok: false, error: 'expires_at must be YYYY-MM-DD, "clear", or "never"' };
        }
        expiresAt = parsed;
      }
    }

    const rawStatus = safeStr(input.status, 20);
    if (rawStatus && !STATUSES.has(rawStatus)) {
      return { ok: false, error: `Invalid status: ${rawStatus}. Options: ${STATUS_VALUES.join(", ")}` };
    }
    if (rawStatus === "revoked" && input.confirm_revoke !== true) {
      return {
        ok: false,
        error:
          "Revoking permanently kills every share in the room. Confirm with the user, then retry with confirm_revoke: true.",
      };
    }

    const rawPasscode = safeStr(input.passcode, 10);
    const clearPasscode = rawPasscode ? isClear(rawPasscode) : false;
    if (rawPasscode && !clearPasscode && !isValidPartnerPasscode(rawPasscode)) {
      return { ok: false, error: 'The passcode must be exactly 4 digits (or "clear" to remove)' };
    }

    let seatLimit: number | null | undefined;
    if (input.seat_limit !== undefined && input.seat_limit !== null) {
      const n = Number(input.seat_limit);
      if (!Number.isInteger(n) || n < 0 || n > 1000) {
        return { ok: false, error: "seat_limit must be an integer 0-1000 (0 = unlimited)" };
      }
      seatLimit = n === 0 ? null : n;
    }

    // ── Apply.
    const changed: string[] = [];

    if (name || rawKind || hasSummary || hasWelcome || rawExpires) {
      const summaryIn = hasSummary ? safeStr(input.summary, SUMMARY_MAX) : "";
      const welcomeIn = hasWelcome ? safeStr(input.welcome_message, WELCOME_MAX) : "";
      const res = await updatePartnerRoomDetails({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        roomId: room.id,
        name: name || room.name,
        partnerKind: (rawKind || room.partnerKind) as PartnerKind,
        summary: hasSummary ? (isClear(summaryIn) ? null : summaryIn || null) : room.summary,
        welcomeMessage: hasWelcome
          ? isClear(welcomeIn)
            ? null
            : welcomeIn || null
          : room.welcomeMessage,
        expiresAt,
      });
      if (!res.ok) return res;
      room = res.room;
      if (name) changed.push("name");
      if (rawKind) changed.push("partner_kind");
      if (hasSummary) changed.push("summary");
      if (hasWelcome) changed.push("welcome_message");
      if (rawExpires) changed.push("expires_at");
    }

    if (rawStatus) {
      const res = await updatePartnerRoomStatus({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        roomId: room.id,
        status: rawStatus as PartnerRoomStatus,
      });
      if (!res.ok) return res;
      room = res.room;
      changed.push("status");
    }

    if (rawPasscode) {
      const res = await setPartnerRoomPasscode({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        roomId: room.id,
        passcode: clearPasscode ? null : rawPasscode,
      });
      if (!res.ok) return res;
      changed.push(clearPasscode ? "passcode (cleared)" : "passcode");
    }

    if (seatLimit !== undefined) {
      const updated = await setPartnerRoomSeatLimit({
        workspaceId: ctx.workspaceId,
        roomId: room.id,
        seatLimit,
      });
      if (!updated) return { ok: false, error: "Room not found" };
      changed.push(seatLimit === null ? "seat_limit (unlimited)" : `seat_limit (${seatLimit})`);
    }

    if (changed.length === 0) {
      return { ok: false, error: "No fields to update — provide at least one" };
    }
    return {
      ok: true,
      data: {
        roomId: room.id,
        roomName: room.name,
        status: room.status,
        changed,
      },
      speak: `Updated "${room.name}": ${changed.join(", ")}.`,
    };
  },
};
