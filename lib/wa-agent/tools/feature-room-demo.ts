import { setRoomDemoLink } from "@/db/queries/partner-access";
import { safeStr, type ToolEntry } from "./_types";
import {
  ROOM_REF_PROPS,
  resolveDemoRef,
  resolveRoomRef,
  roomWriteBlocked,
} from "./_partner-room";

/**
 * Feature (or clear) a product demo on an existing partner room. The demo shows
 * up as a one-tap "Demo access" card on the room's guest page. Attaching a
 * second demo replaces the first — a room features at most one demo.
 */
export const featureRoomDemo: ToolEntry = {
  definition: {
    name: "feature_room_demo",
    description:
      'Feature a product demo on an existing partner room (renders as a "Demo access" card ' +
      "on the guest page), or clear the current one. Identify the room by room_id or a " +
      "contact reference, and the demo by exact id or a label fragment. Pass demo:\"clear\" " +
      "to remove the featured demo. Use list_demos to see what is available.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        demo: {
          type: "string",
          description:
            'Demo to feature — exact demo id or a label fragment (e.g. "CaneyCloud"). ' +
            'Pass "clear" to remove the room\'s featured demo.',
        },
      },
      required: ["demo"],
    },
  },
  async execute(input, ctx) {
    const rawDemo = safeStr(input.demo, 120);
    if (!rawDemo) return { ok: false, error: 'Provide a demo id/label, or "clear" to remove.' };

    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const blocked = roomWriteBlocked(ref.room);
    if (blocked) return { ok: false, error: blocked };

    // Clear path.
    if (rawDemo.toLowerCase() === "clear") {
      const updated = await setRoomDemoLink({
        workspaceId: ctx.workspaceId,
        roomId: ref.room.id,
        demoLinkId: null,
      });
      if (!updated) return { ok: false, error: "Room not found" };
      return {
        ok: true,
        data: { roomId: ref.room.id, roomName: ref.room.name, featuredDemo: null },
        speak: `Removed the featured demo from "${ref.room.name}".`,
      };
    }

    const resolved = await resolveDemoRef(ctx.workspaceId, rawDemo);
    if (!resolved.ok) return resolved;

    const updated = await setRoomDemoLink({
      workspaceId: ctx.workspaceId,
      roomId: ref.room.id,
      demoLinkId: resolved.demo.id,
    });
    if (!updated) return { ok: false, error: "Room not found" };

    return {
      ok: true,
      data: {
        roomId: ref.room.id,
        roomName: ref.room.name,
        featuredDemo: { id: resolved.demo.id, label: resolved.demo.label },
      },
      speak: `Featured the "${resolved.demo.label}" demo in "${ref.room.name}".`,
    };
  },
};
