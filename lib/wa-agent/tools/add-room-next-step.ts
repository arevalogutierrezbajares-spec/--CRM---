import { createPartnerNextStep } from "@/db/queries/partner-next-steps";
import { safeStr, type ToolEntry } from "./_types";
import {
  ROOM_REF_PROPS,
  parseDayEnd,
  resolveRoomRef,
  roomWriteBlocked,
} from "./_partner-room";

const ASSIGNEES = ["owner", "partner", "both"] as const;

export const addRoomNextStep: ToolEntry = {
  definition: {
    name: "add_room_next_step",
    description:
      "Add a next-step item to a partner room so the partner sees a clear action plan " +
      '("owner" = our side, "partner" = their side, "both" = shared).',
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        text: { type: "string", description: "The action, phrased for the partner to read" },
        assigned_to: {
          type: "string",
          enum: [...ASSIGNEES],
          description: "Who owns it; defaults to partner",
        },
        due_date: { type: "string", description: "Optional due date YYYY-MM-DD" },
      },
      required: ["text"],
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const { room } = ref;
    const blocked = roomWriteBlocked(room);
    if (blocked) return { ok: false, error: blocked };

    const text = safeStr(input.text, 500);
    if (!text) return { ok: false, error: "Text is required" };

    const rawAssignee = safeStr(input.assigned_to, 10);
    if (rawAssignee && !(ASSIGNEES as readonly string[]).includes(rawAssignee)) {
      return {
        ok: false,
        error: `Invalid assigned_to "${rawAssignee}". Options: ${ASSIGNEES.join(", ")} (owner = our side)`,
      };
    }
    const assignedTo = rawAssignee || "partner";

    let dueAt: Date | null = null;
    const rawDue = safeStr(input.due_date, 20);
    if (rawDue) {
      dueAt = parseDayEnd(rawDue);
      if (!dueAt) return { ok: false, error: "due_date must be YYYY-MM-DD" };
    }

    const step = await createPartnerNextStep({
      workspaceId: ctx.workspaceId,
      roomId: room.id,
      text,
      assignedTo,
      dueAt,
      sortOrder: 0,
      createdByUser: ctx.userId,
    });

    return {
      ok: true,
      data: { stepId: step.id, roomId: room.id, text, assignedTo, dueAt },
      speak: `Added next step to "${room.name}": ${text} (${assignedTo}).`,
    };
  },
};
