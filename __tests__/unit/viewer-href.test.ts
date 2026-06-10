import { describe, expect, it } from "vitest";
import { previewKind, viewerHref } from "@/lib/project-files/allowed-types";

/**
 * Regression guard for the HTML-deck viewing bug (June 2026): Supabase Storage
 * force-serves stored HTML as text/plain + nosniff + a deny-all CSP, so a
 * signed URL can NEVER render an HTML deck — any surface that displays a file
 * (preview iframe, "Open in new tab", present mode) must resolve its URL
 * through viewerHref(), which routes HTML through /api/materials/[id]/view.
 */
describe("viewerHref", () => {
  const SIGNED = "https://xyz.supabase.co/storage/v1/object/sign/agb-project-files/a/b/c.html?token=t";
  const LINK_ID = "6c82dae1-cdd1-477e-ac10-fd7e057e3039";

  it("routes HTML decks through the materials view proxy, never the signed URL", () => {
    expect(viewerHref("html", LINK_ID, SIGNED)).toBe(`/api/materials/${LINK_ID}/view`);
  });

  it("routes .html and .htm filenames through the proxy end to end", () => {
    for (const name of ["deck.html", "deck.htm", "DECK.HTML"]) {
      const kind = previewKind(name.toLowerCase());
      expect(viewerHref(kind, LINK_ID, SIGNED)).toBe(`/api/materials/${LINK_ID}/view`);
    }
  });

  it("serves browser-renderable types directly off the signed URL", () => {
    for (const kind of ["pdf", "image", "text", "markdown", "office", "none"] as const) {
      expect(viewerHref(kind, LINK_ID, SIGNED)).toBe(SIGNED);
    }
  });
});
