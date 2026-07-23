import { resolvePresentationComment } from "@/db/queries/presentations";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Mark (or unmark) a single presentation comment resolved. Mirrors
 * resolveCommentAction's exact WHERE (commentId + workspaceId) via the
 * shared resolvePresentationComment query helper — presentation_comments.id
 * is a random uuid, so the workspaceId scope is what stops one workspace
 * from resolving another workspace's comment by id (IDOR).
 */
export const resolvePresentationCommentTool: ToolEntry = {
  definition: {
    name: "resolve_presentation_comment",
    description:
      "Mark a presentation comment as resolved (addressed), or unresolve it by passing " +
      "resolved=false. Use after confirming with the user which comment they mean — call " +
      "list_presentation_comments first if you only have a slide/topic, not a comment id.",
    input_schema: {
      type: "object",
      properties: {
        comment_id: {
          type: "string",
          description: "The comment's id (uuid), from list_presentation_comments.",
        },
        resolved: {
          type: "boolean",
          description: "true to resolve (default), false to reopen.",
        },
      },
      required: ["comment_id"],
    },
  },
  async execute(input, ctx) {
    const commentId = safeStr(input.comment_id, 200);
    if (!commentId) return { ok: false, error: "comment_id is required" };
    const resolved = input.resolved === false ? false : true;

    const row = await resolvePresentationComment({
      commentId,
      workspaceId: ctx.workspaceId,
      resolved,
    });
    if (!row) return { ok: false, error: "Comment not found" };

    return {
      ok: true,
      data: {
        id: row.id,
        presentationId: row.presentationId,
        resolvedAt: row.resolvedAt,
      },
      speak: resolved ? "Comment marked resolved." : "Comment reopened.",
    };
  },
};
