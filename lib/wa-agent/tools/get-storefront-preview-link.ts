import { safeStr, type ToolEntry } from "./_types";
import { vavGetStorefrontPreviewLink } from "@/lib/storefront/vav-client";

export const getStorefrontPreviewLink: ToolEntry = {
  definition: {
    name: "get_storefront_preview_link",
    description:
      "Get the private tokenized preview URL for a VAV storefront draft page (page_id from " +
      "generate_storefront_draft). Does not publish.",
    input_schema: {
      type: "object",
      properties: {
        page_id: {
          type: "string",
          description: "storefront_pages.id UUID",
        },
      },
      required: ["page_id"],
    },
  },
  async execute(input) {
    const pageId = safeStr(input.page_id, 64);
    if (!pageId) return { ok: false, error: "page_id is required" };

    const result = await vavGetStorefrontPreviewLink(pageId);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error + (result.status ? ` (HTTP ${result.status})` : ""),
      };
    }
    return {
      ok: true,
      data: result,
      speak: `Preview link: ${result.preview_url}`,
    };
  },
};
