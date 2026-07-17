import { safeStr, type ToolEntry } from "./_types";
import { vavGenerateStorefrontDraft } from "@/lib/storefront/vav-client";

export const generateStorefrontDraft: ToolEntry = {
  definition: {
    name: "generate_storefront_draft",
    description:
      "Generate an AI draft for a VAV white-label storefront request. Pass request_id from " +
      "create_storefront_request or list_storefront_queue. Optional guidance steers the design. " +
      "Returns page_id, version, and a private preview_url (token-gated). Never auto-publishes.",
    input_schema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "storefront_requests.id UUID",
        },
        guidance: {
          type: "string",
          description: "Optional design guidance for this generation pass",
        },
      },
      required: ["request_id"],
    },
  },
  async execute(input) {
    const requestId = safeStr(input.request_id, 64);
    if (!requestId) return { ok: false, error: "request_id is required" };
    const guidance = safeStr(input.guidance, 2000) || undefined;

    const result = await vavGenerateStorefrontDraft({
      request_id: requestId,
      guidance,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error + (result.status ? ` (HTTP ${result.status})` : ""),
      };
    }
    return {
      ok: true,
      data: result,
      speak: `Draft page ${result.page_id} v${result.version} ready. Preview: ${result.preview_url}`,
    };
  },
};
