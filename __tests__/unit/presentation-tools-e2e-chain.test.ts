/**
 * Real, DB-backed end-to-end chain test for the 4 new presentation MCP
 * tools together (no mocks): upload_presentation -> search_documents ->
 * get_presentation_link -> (direct comment insert, mirroring how an
 * external /p/[token] viewer would leave one) -> list_presentation_comments
 * -> resolve_presentation_comment.
 *
 * Runs against the real dev Supabase DB + Storage bucket, same pattern as
 * upload-presentation.test.ts (DATABASE_URL via lib/database-url.ts,
 * Storage creds loaded explicitly from .env.local since
 * lib/project-files/storage.ts reads process.env directly). Everything
 * created is torn down in afterAll.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loadProjectLocalEnvIntoProcess } from "@/lib/database-url";

// Must run before any import that touches Supabase Storage — Storage's
// service client reads SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL
// straight from process.env, which vitest does not populate on its own.
loadProjectLocalEnvIntoProcess();

import { db, schema } from "@/db";
import { getPresentationById } from "@/db/queries/presentations";
import { objectExists, removeObjects } from "@/lib/project-files/storage";
import { uploadPresentation } from "@/lib/wa-agent/tools/upload-presentation";
import { searchDocumentsTool } from "@/lib/wa-agent/tools/search-documents";
import { getPresentationLink } from "@/lib/wa-agent/tools/get-presentation-link";
import { listPresentationCommentsTool } from "@/lib/wa-agent/tools/list-presentation-comments";
import { resolvePresentationCommentTool } from "@/lib/wa-agent/tools/resolve-presentation-comment";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";

function b64(html: string): string {
  return Buffer.from(html, "utf8").toString("base64");
}

const RUN_TAG = randomUUID().slice(0, 8);
const TEST_USER_ID = randomUUID();
const TEST_WORKSPACE_ID = randomUUID();

const ctx: ToolContext = {
  workspaceId: TEST_WORKSPACE_ID,
  userId: TEST_USER_ID,
  workspaceRole: "owner",
  ownerTimezone: "America/Caracas",
  now: new Date(),
};

let storagePath: string | null = null;
let presentationId: string | null = null;

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    email: `e2e-chain-test-${RUN_TAG}@local`,
    displayName: "E2E Chain Test User",
  });
  await db.insert(schema.workspaces).values({
    id: TEST_WORKSPACE_ID,
    name: `E2E Chain Test WS ${RUN_TAG}`,
    createdBy: TEST_USER_ID,
  });
});

afterAll(async () => {
  if (presentationId) {
    await db.delete(schema.presentations).where(eq(schema.presentations.id, presentationId));
  }
  if (storagePath) {
    await removeObjects([storagePath]);
  }
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, TEST_WORKSPACE_ID));
  await db.delete(schema.users).where(eq(schema.users.id, TEST_USER_ID));
});

describe("[e2e chain] upload -> search -> link -> comment -> list -> resolve", () => {
  it("chains all 4 new tools end to end against the real DB + Storage", async () => {
    const deckTitle = `E2E Chain Deck ${RUN_TAG}`;

    // 1. upload_presentation — real bytes, real Storage write, real DB insert.
    const html = `<!doctype html><html><head><title>${deckTitle}</title></head><body>
      <section id="cover"><h1>Cover Slide</h1></section>
      <section id="numbers"><h2>The Numbers</h2></section>
    </body></html>`;

    const uploadResult = await uploadPresentation.execute(
      { filename: `e2e-chain-${RUN_TAG}.html`, content_base64: b64(html) },
      ctx,
    );
    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok) return;
    const uploadData = uploadResult.data as {
      presentationId: string;
      title: string;
      slideCount: number;
      href: string;
    };
    presentationId = uploadData.presentationId;
    expect(uploadData.title).toBe(deckTitle);
    expect(uploadData.slideCount).toBe(2);

    // Confirm the row + slideMap + real Storage object, and capture the
    // storage path for cleanup.
    const uploadedRow = await getPresentationById({
      id: presentationId,
      workspaceId: TEST_WORKSPACE_ID,
    });
    expect(uploadedRow).not.toBeNull();
    expect(uploadedRow?.kind).toBe("html");
    expect(uploadedRow?.visibility).toBe("team");
    expect(uploadedRow?.slideMap).toEqual([
      { slideId: "cover", label: "Cover Slide" },
      { slideId: "numbers", label: "The Numbers" },
    ]);
    storagePath = uploadedRow!.htmlUrl!;
    expect(storagePath).toBeTruthy();
    const existsInStorage = await objectExists(storagePath);
    expect(existsInStorage).toBe(true);

    // 2. search_documents — the freshly uploaded deck must be findable by
    // title fragment, scoped to this workspace, and must never leak the
    // Storage object path (htmlUrl) in its results.
    const searchResult = await searchDocumentsTool.execute(
      { query: `E2E Chain Deck ${RUN_TAG}` },
      ctx,
    );
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    const searchData = searchResult.data as {
      count: number;
      results: Array<{
        id: string;
        source: string;
        kind: string;
        title: string;
        href: string;
        [k: string]: unknown;
      }>;
    };
    expect(searchData.count).toBeGreaterThanOrEqual(1);
    const found = searchData.results.find((r) => r.id === presentationId);
    expect(found).toBeDefined();
    expect(found?.source).toBe("presentation");
    expect(found?.kind).toBe("html");
    expect(found?.title).toBe(deckTitle);
    expect(found?.href).toContain(presentationId!);
    expect(found).not.toHaveProperty("htmlUrl");

    // 3. get_presentation_link — internal team-scoped link must be returned;
    // no public link since visibility defaults to 'team'.
    const linkResult = await getPresentationLink.execute(
      { presentation_id: presentationId },
      ctx,
    );
    expect(linkResult.ok).toBe(true);
    if (!linkResult.ok) return;
    const linkData = linkResult.data as {
      id: string;
      visibility: string;
      internalUrl: string;
      publicUrl: string | null;
      note?: string;
    };
    expect(linkData.id).toBe(presentationId);
    expect(linkData.visibility).toBe("team");
    expect(linkData.internalUrl).toContain(presentationId!);
    expect(linkData.publicUrl).toBeNull();
    expect(linkData.note).toMatch(/team-only/i);

    // 4. Insert an anchored comment against a real slideId from the parsed
    // slideMap (this is what an external /p/[token] viewer or the internal
    // player does client-side — there is no MCP tool for creating comments
    // per the locked spec, only for listing/resolving them).
    const anchorSlideId = uploadedRow!.slideMap[0].slideId; // "cover"
    expect(anchorSlideId).toBe("cover");
    const [comment] = await db
      .insert(schema.presentationComments)
      .values({
        workspaceId: TEST_WORKSPACE_ID,
        presentationId: presentationId!,
        slideId: anchorSlideId,
        xPct: 0.42,
        yPct: 0.17,
        body: "Please tighten this stat on the cover.",
        authorName: "E2E External Reviewer",
      })
      .returning();
    expect(comment.slideId).toBe("cover");

    // 5. list_presentation_comments — comment must surface (default: open)
    // with the correct slideId + position.
    const listResult = await listPresentationCommentsTool.execute(
      { presentation_id: presentationId },
      ctx,
    );
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    const listData = listResult.data as {
      comments: Array<{
        id: string;
        slideId: string;
        position: { xPct: number; yPct: number };
        text: string;
        resolvedAt: Date | null;
      }>;
    };
    expect(listData.comments).toHaveLength(1);
    expect(listData.comments[0].id).toBe(comment.id);
    expect(listData.comments[0].slideId).toBe("cover");
    expect(listData.comments[0].position).toEqual({ xPct: 0.42, yPct: 0.17 });
    expect(listData.comments[0].text).toBe("Please tighten this stat on the cover.");
    expect(listData.comments[0].resolvedAt).toBeNull();

    // 6. resolve_presentation_comment — resolvedAt must get set, and the
    // comment must then drop out of the default (open) listing.
    const resolveResult = await resolvePresentationCommentTool.execute(
      { comment_id: comment.id },
      ctx,
    );
    expect(resolveResult.ok).toBe(true);
    if (!resolveResult.ok) return;
    const resolveData = resolveResult.data as {
      id: string;
      presentationId: string;
      resolvedAt: Date | null;
    };
    expect(resolveData.id).toBe(comment.id);
    expect(resolveData.presentationId).toBe(presentationId);
    expect(resolveData.resolvedAt).not.toBeNull();

    const afterResolveOpen = await listPresentationCommentsTool.execute(
      { presentation_id: presentationId, status: "open" },
      ctx,
    );
    expect(afterResolveOpen.ok).toBe(true);
    if (afterResolveOpen.ok) {
      expect((afterResolveOpen.data as { comments: unknown[] }).comments).toHaveLength(0);
    }

    const afterResolveResolved = await listPresentationCommentsTool.execute(
      { presentation_id: presentationId, status: "resolved" },
      ctx,
    );
    expect(afterResolveResolved.ok).toBe(true);
    if (afterResolveResolved.ok) {
      const resolved = (afterResolveResolved.data as {
        comments: { id: string; resolvedAt: Date | null }[];
      }).comments;
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe(comment.id);
      expect(resolved[0].resolvedAt).not.toBeNull();
    }
  });
});
