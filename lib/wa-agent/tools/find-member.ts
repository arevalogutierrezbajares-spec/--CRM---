/**
 * find_member — resolve a teammate's name to their user id, so the agent can
 * assign an action item or task (edit_action_item / edit_task) to a person the
 * user named in chat. Returns matches; on multiple, the agent asks which one.
 */
import { findMembers } from "@/db/queries/team";
import { safeStr, type ToolEntry } from "./_types";

export const findMember: ToolEntry = {
  definition: {
    name: "find_member",
    description:
      "Find a workspace teammate by name and get their user id — use this to " +
      "resolve an assignee before assigning an action item or task (e.g. the " +
      "user says 'assign it to Charles'). If multiple people match, return the " +
      "candidates and ask which one.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Part of the teammate's name (e.g. 'charles').",
        },
      },
      required: ["query"],
    },
  },

  async execute(input, ctx) {
    const q = safeStr(input.query, 80);
    if (!q) return { ok: false, error: "Provide a name to search." };
    const matches = await findMembers({ workspaceId: ctx.workspaceId, query: q, limit: 6 });
    if (matches.length === 0) {
      return { ok: false, error: `No teammate matches "${q}".` };
    }
    return {
      ok: true,
      data: { members: matches },
      speak:
        matches.length === 1
          ? `Found ${matches[0].displayName}.`
          : `Several teammates match "${q}": ${matches.map((m) => m.displayName).join(", ")}. Which one?`,
    };
  },
};
