import { safeStr, type ToolEntry } from "./_types";
import { vavListStorefrontQueue } from "@/lib/storefront/vav-client";

/**
 * Phase 0 stub: list the VAV storefront design queue for Tomas.
 */
export const listStorefrontQueue: ToolEntry = {
  definition: {
    name: "list_storefront_queue",
    description:
      "List white-label storefront requests on Vamos a Venezuela (the design queue). " +
      "Optional status filter: requested|in_design|in_review|changes_requested|approved|published|cancelled. " +
      "Default returns open work items (excludes published + cancelled). Phase 0 read-only.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Optional status filter (requested, in_design, in_review, changes_requested, approved, published, cancelled)",
        },
      },
    },
  },
  async execute(input) {
    const status = safeStr(input.status, 40) || undefined;
    const result = await vavListStorefrontQueue(status);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error + (result.status ? ` (HTTP ${result.status})` : ""),
      };
    }
    return {
      ok: true,
      data: {
        count: result.items.length,
        items: result.items,
      },
      speak:
        result.items.length === 0
          ? "Storefront queue is empty."
          : `Storefront queue: ${result.items.length} request(s).`,
    };
  },
};
