import { searchDocuments } from "@/db/queries/presentations";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Unified search across project_links (notes/links/files) and both
 * presentation kinds (structured + html). Thin wrapper — all the querying
 * (workspace scoping, ilike matching, exclusion of htmlUrl/storage paths
 * from results) lives in db/queries/presentations.ts's searchDocuments, so
 * this stays a pass-through with input validation only.
 */
export const searchDocumentsTool: ToolEntry = {
  definition: {
    name: "search_documents",
    description:
      "Search this workspace's documents by title/label fragment — covers project links/notes/files " +
      "AND presentations (both structured slide decks and uploaded HTML decks). Returns up to `limit` " +
      "matches (default 20) with an internal, login-gated link to open each — never a raw storage URL.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text fragment to match against titles/labels/descriptions.",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20, capped at 50).",
        },
      },
      required: ["query"],
    },
  },
  async execute(input, ctx) {
    const q = safeStr(input.query, 200);
    if (!q) return { ok: false, error: "query is required" };

    const limitRaw = Number(input.limit ?? 20);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
      : 20;

    const results = await searchDocuments({
      workspaceId: ctx.workspaceId,
      q,
      limit,
    });

    return {
      ok: true,
      data: {
        count: results.length,
        results,
      },
    };
  },
};
