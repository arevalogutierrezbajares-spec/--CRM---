/**
 * add_action_item — record a single task/action item for the user.
 *
 * Primary use: a transcribed WhatsApp voice note that lists things to do.
 * The agent calls this once per item. When the inbound message was a voice
 * note, the item links back to the originating voice_notes row via
 * ctx.sourceVoiceNoteId (set by the webhook). Items are standalone — no
 * project/contact link in v1. They surface on the Home dashboard.
 */

import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { actionItems } = schema;

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];

/** Accept only a clean YYYY-MM-DD; anything else → null (no guessing). */
function cleanDueDate(raw: string): string | null {
  const v = safeStr(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export const addActionItem: ToolEntry = {
  definition: {
    name: "add_action_item",
    description:
      "Create one action item / to-do for the user. Call this WHENEVER someone asks to add, " +
      "create, or note a task or action item (or one is extracted from a voice note). Call once " +
      'per distinct task. Keep the title short and imperative ("Call the bank", "Email Marcos the ' +
      'deck"). Items appear on the Home dashboard. This is the right tool for "add an action item".',
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short imperative task. Max 200 chars.",
        },
        description: {
          type: "string",
          description: "Optional extra detail/context. Max 1000 chars.",
        },
        due_date: {
          type: "string",
          description:
            "Optional due date as YYYY-MM-DD. Resolve relative dates (e.g. 'tomorrow') to an absolute date in the user's timezone first.",
        },
        priority: {
          type: "string",
          enum: [...PRIORITIES],
          description: "Optional urgency. Use 'now' only for same-day urgent items.",
        },
      },
      required: ["title"],
    },
  },

  async execute(input, ctx) {
    const title = safeStr(input.title, 200);
    if (!title) return { ok: false, error: "title is required" };

    const description = safeStr(input.description, 1000) || null;
    const dueDate = input.due_date ? cleanDueDate(input.due_date as string) : null;
    const rawPriority = safeStr(input.priority, 12) as Priority;
    const priority = PRIORITIES.includes(rawPriority) ? rawPriority : null;

    const [row] = await db
      .insert(actionItems)
      .values({
        workspaceId: ctx.workspaceId,
        title,
        description,
        dueDate,
        priority,
        voiceNoteId: ctx.sourceVoiceNoteId ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: actionItems.id });

    const due = dueDate ? ` (due ${dueDate})` : "";
    return {
      ok: true,
      data: { id: row.id },
      speak: `Noted: ${title}${due}.`,
    };
  },
};
