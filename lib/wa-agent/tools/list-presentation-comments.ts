import {
  getPresentationById,
  listPresentationComments,
} from "@/db/queries/presentations";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Read-only surface over presentation_comments for programmatic agent
 * pickup (e.g. "any open feedback on the LATAM deck?"). Works identically
 * for kind='structured' (slideId like "s3") and kind='html' (slideId like
 * "slide-2" / "full") — presentation_comments.slide_id already accepts
 * either, no schema branching needed here.
 */
export const listPresentationCommentsTool: ToolEntry = {
  definition: {
    name: "list_presentation_comments",
    description:
      "List comments pinned to a presentation's slides, so you can summarize open feedback " +
      "or find what still needs addressing. Returns slideId, position, text, author, and " +
      "resolvedAt for each comment. Defaults to open (unresolved) comments only — pass " +
      "status='all' or status='resolved' to see the rest.",
    input_schema: {
      type: "object",
      properties: {
        presentation_id: {
          type: "string",
          description: "The presentation's id (uuid).",
        },
        slide_id: {
          type: "string",
          description:
            "Optional: restrict to comments on one slide (e.g. \"s3\", \"slide-2\", \"full\").",
        },
        status: {
          type: "string",
          enum: ["open", "resolved", "all"],
          description: "Filter by resolution state. Defaults to 'open'.",
        },
      },
      required: ["presentation_id"],
    },
  },
  async execute(input, ctx) {
    const presentationId = safeStr(input.presentation_id, 200);
    if (!presentationId) return { ok: false, error: "presentation_id is required" };

    const presentation = await getPresentationById({
      id: presentationId,
      workspaceId: ctx.workspaceId,
    });
    if (!presentation) return { ok: false, error: "Presentation not found" };

    const slideId = safeStr(input.slide_id, 100);
    const status = (safeStr(input.status, 20) || "open") as "open" | "resolved" | "all";

    const all = await listPresentationComments({ presentationId });
    const filtered = all
      .filter((c) => (slideId ? c.slideId === slideId : true))
      .filter((c) => {
        if (status === "all") return true;
        if (status === "resolved") return c.resolvedAt !== null;
        return c.resolvedAt === null; // "open" (default)
      });

    return {
      ok: true,
      data: {
        presentationId: presentation.id,
        presentationTitle: presentation.title,
        status,
        comments: filtered.map((c) => ({
          id: c.id,
          slideId: c.slideId,
          position: { xPct: c.xPct, yPct: c.yPct },
          text: c.body,
          authorName: c.authorName,
          resolvedAt: c.resolvedAt,
          createdAt: c.createdAt,
        })),
      },
      speak:
        filtered.length === 0
          ? `No ${status === "all" ? "" : status + " "}comments on "${presentation.title}".`
          : `${filtered.length} ${status === "all" ? "" : status + " "}comment${filtered.length === 1 ? "" : "s"} on "${presentation.title}".`,
    };
  },
};
