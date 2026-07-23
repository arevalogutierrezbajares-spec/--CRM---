import {
  getPresentationById,
  listPresentations,
  type PresentationRow,
} from "@/db/queries/presentations";
import { SITE_URL } from "@/lib/site-url";
import { safeStr, type ToolEntry } from "./_types";

/**
 * Read-only link lookup for a single presentation.
 *
 * Internal link: always returned for any workspace presentation, regardless
 * of visibility — internal access is gated by workspace membership (the
 * login-gated /presentations/[id] route), not by the visibility column.
 *
 * Public link: returned ONLY when visibility='public' AND shareEnabled=true
 * AND a shareToken has been issued — all three are an AND-gate, matching the
 * tightened getPresentationByShareToken query. This tool never mints a token
 * or flips visibility itself (deliberately read-only); making a deck public
 * is a separate, deliberate write action in the app.
 */
export const getPresentationLink: ToolEntry = {
  definition: {
    name: "get_presentation_link",
    description:
      "Get the shareable link(s) for one presentation. Always returns the internal, " +
      "login-gated team link. Also returns a public_url, but ONLY when the deck is " +
      "visibility=\"public\" AND sharing is enabled AND a link has been issued — " +
      "otherwise public_url is null with a note explaining why. Read-only: it never " +
      "makes a deck public or mints a link itself. Pass presentation_id if known, or a " +
      "title fragment via query (use list_presentations first if unsure which one).",
    input_schema: {
      type: "object",
      properties: {
        presentation_id: { type: "string", description: "Presentation UUID" },
        query: {
          type: "string",
          description:
            "Title/subtitle fragment to search for when presentation_id is unknown",
        },
      },
    },
  },
  async execute(input, ctx) {
    const presentationId = safeStr(input.presentation_id, 64);
    const query = safeStr(input.query, 120);

    let presentation: PresentationRow | null = null;

    if (presentationId) {
      presentation = await getPresentationById({
        id: presentationId,
        workspaceId: ctx.workspaceId,
      });
      if (!presentation) {
        return {
          ok: false,
          error: `No presentation found with id "${presentationId}" in this workspace.`,
        };
      }
    } else if (query) {
      const q = query.toLowerCase();
      const all = await listPresentations({ workspaceId: ctx.workspaceId });
      const matches = all.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || (p.subtitle ?? "").toLowerCase().includes(q),
      );
      if (matches.length === 0) {
        return { ok: false, error: `No presentations match "${query}".` };
      }
      if (matches.length > 1) {
        return {
          ok: true,
          data: {
            ambiguous: true,
            matches: matches.map((p) => ({ id: p.id, title: p.title, kind: p.kind })),
          },
          speak: `${matches.length} presentations match "${query}" — which one did you mean: ${matches
            .map((p) => `"${p.title}"`)
            .join(", ")}?`,
        };
      }
      presentation = matches[0];
    } else {
      return { ok: false, error: "Pass either presentation_id or query." };
    }

    const internalUrl = `${SITE_URL}/presentations/${presentation.id}`;
    const publiclyReachable =
      presentation.visibility === "public" &&
      presentation.shareEnabled &&
      Boolean(presentation.shareToken);
    const publicUrl = publiclyReachable ? `${SITE_URL}/p/${presentation.shareToken}` : null;

    let note: string | undefined;
    if (!publiclyReachable) {
      if (presentation.visibility !== "public") {
        note =
          'This deck is team-only (visibility="team") — only the internal link works. ' +
          "Making it public is a deliberate action in the app, not something this tool does.";
      } else if (!presentation.shareEnabled) {
        note =
          "This deck is marked public but sharing is currently off, so it has no live public link yet.";
      } else {
        note = "This deck is public and sharing is on, but no share link has been issued yet.";
      }
    }

    return {
      ok: true,
      data: {
        id: presentation.id,
        title: presentation.title,
        kind: presentation.kind,
        visibility: presentation.visibility,
        internalUrl,
        publicUrl,
        ...(note ? { note } : {}),
      },
      speak: publicUrl
        ? `"${presentation.title}" — internal: ${internalUrl} | public: ${publicUrl}`
        : `"${presentation.title}" — internal link: ${internalUrl}.${note ? ` ${note}` : ""}`,
    };
  },
};
