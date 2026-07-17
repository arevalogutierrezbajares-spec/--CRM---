import { safeStr, type ToolEntry } from "./_types";
import { vavCreateStorefrontRequest } from "@/lib/storefront/vav-client";

/**
 * Phase 0 stub: create a white-label storefront request on VAV for a provider.
 * Tomas (via AGB MCP) files the brief; AI design + approval ship in later phases.
 */
export const createStorefrontRequest: ToolEntry = {
  definition: {
    name: "create_storefront_request",
    description:
      "Create a white-label storefront request on Vamos a Venezuela for a lodging provider. " +
      "Pass the VAV providers.id (UUID) and an optional brief (goals, audience, tone, brand colors). " +
      "Returns request_id + status. Phase 0: does not generate AI design or publish — only enqueues " +
      "the request for Tomas to work from the storefront queue.",
    input_schema: {
      type: "object",
      properties: {
        provider_id: {
          type: "string",
          description: "VAV providers.id UUID (subject of the storefront)",
        },
        subject_id: {
          type: "string",
          description: "Alias for provider_id (or agent id when subject_type=agent)",
        },
        subject_type: {
          type: "string",
          enum: ["provider", "agent"],
          description: "Defaults to provider",
        },
        brief: {
          type: "object",
          description:
            "Design brief JSON: goals, audience, reference_sites[], brand_colors, logo_url, photos[], tone, sections_wanted[]",
        },
        goals: {
          type: "string",
          description: "Shortcut: put goals into brief.goals when brief is omitted",
        },
        tone: {
          type: "string",
          description: "Shortcut: put tone into brief.tone when brief is omitted",
        },
      },
      required: [],
    },
  },
  async execute(input, ctx) {
    const subjectId =
      safeStr(input.provider_id, 64) || safeStr(input.subject_id, 64);
    if (!subjectId) {
      return { ok: false, error: "provider_id (or subject_id) is required" };
    }

    const subjectType =
      safeStr(input.subject_type, 16) === "agent" ? "agent" : "provider";

    let brief: Record<string, unknown> =
      input.brief && typeof input.brief === "object" && !Array.isArray(input.brief)
        ? { ...(input.brief as Record<string, unknown>) }
        : {};
    const goals = safeStr(input.goals, 500);
    const tone = safeStr(input.tone, 120);
    if (goals) brief = { ...brief, goals };
    if (tone) brief = { ...brief, tone };

    const result = await vavCreateStorefrontRequest({
      subject_type: subjectType,
      subject_id: subjectId,
      brief,
      requested_by: ctx.userId,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error + (result.status ? ` (HTTP ${result.status})` : ""),
      };
    }

    return {
      ok: true,
      data: {
        request_id: result.request_id,
        status: result.status,
        subject_type: subjectType,
        subject_id: subjectId,
      },
      speak: `Storefront request ${result.request_id} created (${result.status}).`,
    };
  },
};
