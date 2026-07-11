import { listDemoLinks } from "@/db/queries/demo-links";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Browse the workspace's product demos (Platform Management → Demo links) so a
 * demo can be featured on a partner room. Returns each demo's id + label so
 * create_partner_room / feature_room_demo can attach one by id.
 */
export const listDemos: ToolEntry = {
  definition: {
    name: "list_demos",
    description:
      "List the workspace's product demos (demo deep links + demo-account credentials, from " +
      "Platform Management → Demo links). Use this to find a demo to feature on a partner room " +
      "with create_partner_room (demo param) or feature_room_demo. Optionally filter by a " +
      "label/platform fragment.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional label or platform fragment to filter by (case-insensitive)",
        },
      },
    },
  },
  async execute(input, ctx) {
    const query = safeStr(input.query, 120).toLowerCase();
    const all = await listDemoLinks(ctx.workspaceId);
    const rows = query
      ? all.filter(
          (d) =>
            d.label.toLowerCase().includes(query) ||
            d.platformId.toLowerCase().includes(query),
        )
      : all;

    const demos = rows.map((d) => ({
      id: d.id,
      label: d.label,
      platform: d.platformId,
      hasCredentials: Boolean(d.username || d.password),
      hasUrl: Boolean(d.url),
      publiclyShared: Boolean(d.publicAccessToken),
    }));

    return {
      ok: true,
      data: { count: demos.length, demos },
      speak: demos.length
        ? `${demos.length} demo${demos.length === 1 ? "" : "s"} available: ${demos
            .map((d) => `"${d.label}"`)
            .join(", ")}.`
        : query
          ? `No demos match "${query}".`
          : "No demos yet — add one in Platform Management → Demo links.",
    };
  },
};
