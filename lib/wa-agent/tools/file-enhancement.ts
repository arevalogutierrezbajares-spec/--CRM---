/**
 * file_enhancement — add an enhancement/feature idea to a product's Tech Board
 * (CaneyCloud / VAV / CaneyAcademy / CRM). The MCP-facing equivalent of typing
 * #CCfunc/#VAVfunc/#CCAfunc/#CRMfunc elsewhere on the platform. Lands in the
 * board's Idea column with an "MCP" source badge.
 */

import { db, schema } from "@/db";
import { isProductId } from "@/lib/products";
import { safeStr, type ToolEntry } from "./_types";

const { enhancements } = schema;

const PRODUCT_ALIASES: Record<string, string> = {
  caney: "caney", caneycloud: "caney", cc: "caney",
  vav: "vav", vamosavenezuela: "vav",
  cca: "cca", caneyacademy: "cca", academy: "cca",
  crm: "crm", "agb-crm": "crm",
};

export const fileEnhancement: ToolEntry = {
  definition: {
    name: "file_enhancement",
    description:
      "Add an enhancement / feature idea to a product's Tech Board. Use when someone asks to " +
      "log, file, or note a product improvement, feature request, or enhancement for CaneyCloud, " +
      "VAV (Vamos A Venezuela), CaneyAcademy, or the CRM. It lands in that product's Ideas column.",
    input_schema: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description:
            "Which product: 'caney' (CaneyCloud), 'vav' (Vamos A Venezuela), 'cca' (CaneyAcademy), or 'crm'.",
        },
        title: { type: "string", description: "Short enhancement title. Max 280 chars." },
        detail: { type: "string", description: "Optional extra detail/context. Max 1000 chars." },
      },
      required: ["product", "title"],
    },
  },

  async execute(input, ctx) {
    const raw = safeStr(input.product, 20).toLowerCase();
    const product = PRODUCT_ALIASES[raw] ?? raw;
    if (!isProductId(product)) {
      return { ok: false, error: "product must be one of: caney, vav, cca, crm" };
    }
    const title = safeStr(input.title, 280);
    if (!title) return { ok: false, error: "title is required" };
    const detail = safeStr(input.detail, 1000) || null;

    const [row] = await db
      .insert(enhancements)
      .values({
        workspaceId: ctx.workspaceId,
        product,
        title,
        detail,
        status: "idea",
        priority: "next",
        source: "mcp",
        sourceLabel: "Filed via MCP",
        createdBy: ctx.userId,
      })
      .returning({ id: enhancements.id });

    return {
      ok: true,
      data: { id: row.id, product },
      speak: `Filed enhancement for ${product}: ${title}.`,
    };
  },
};
