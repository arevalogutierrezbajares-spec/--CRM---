import { listPresentations } from "@/db/queries/presentations";
import { SITE_URL } from "@/lib/site-url";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Browse the workspace's presentations (native slide decks AND uploaded HTML
 * decks) so a specific one can be linked with get_presentation_link. Never
 * returns htmlUrl (a Storage object path) or the raw shareToken — only
 * metadata + the internal, login-gated href.
 */
export const listPresentationsTool: ToolEntry = {
  definition: {
    name: "list_presentations",
    description:
      "List the workspace's presentations — both native slide decks (kind=structured) and " +
      "uploaded HTML decks (kind=html). Returns each deck's id, title, kind, visibility, " +
      "slide count, and internal link. Use get_presentation_link afterward for the full " +
      "link set (and public link, if the deck is shared). Optionally filter by a " +
      "title/subtitle fragment.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional title/subtitle fragment to filter by (case-insensitive)",
        },
      },
    },
  },
  async execute(input, ctx) {
    const query = safeStr(input.query, 120).toLowerCase();
    const all = await listPresentations({ workspaceId: ctx.workspaceId });
    const rows = query
      ? all.filter(
          (p) =>
            p.title.toLowerCase().includes(query) ||
            (p.subtitle ?? "").toLowerCase().includes(query),
        )
      : all;

    const presentations = rows.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      kind: p.kind,
      visibility: p.visibility,
      slideCount: p.kind === "structured" ? p.slides.length : p.slideMap.length,
      shareEnabled: p.shareEnabled,
      // Both gates (visibility='public' AND shareEnabled AND an issued
      // token) must hold for /p/[token] to actually serve the deck — see
      // get_presentation_link for the resolved public URL.
      publiclyReachable: p.visibility === "public" && p.shareEnabled && Boolean(p.shareToken),
      href: `${SITE_URL}/presentations/${p.id}`,
      updatedAt: p.updatedAt,
    }));

    return {
      ok: true,
      data: { count: presentations.length, presentations },
      speak: presentations.length
        ? `${presentations.length} presentation${presentations.length === 1 ? "" : "s"}: ${presentations
            .slice(0, 5)
            .map((p) => `"${p.title}"`)
            .join(", ")}${presentations.length > 5 ? ", …" : ""}.`
        : query
          ? `No presentations match "${query}".`
          : "No presentations yet.",
    };
  },
};
