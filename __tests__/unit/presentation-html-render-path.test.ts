/**
 * Real, DB + Storage-backed test for the HTML-deck render path: the two
 * proxy routes (app/(stage)/presentations/[id]/html/route.ts and
 * app/p/[token]/html/route.ts) plus the PresentationPlayer `kind="html"`
 * branch that points an iframe at them.
 *
 * This is the test that would have caught the original gap: the render
 * path (routes + player branch) was built but never wired into the two
 * page components that fetch `kind`/`slideMap`, which made the whole branch
 * dead code. Nothing here mocks the DB or Supabase Storage — a real HTML
 * deck is uploaded via the real upload_presentation tool into a real
 * scratch workspace, the real route handlers are invoked, and the real
 * bytes are asserted to round-trip back out through them. Same pattern as
 * upload-presentation.test.ts / presentation-tools-e2e-chain.test.ts.
 *
 * The one thing that IS stubbed is `requireUser()`'s Supabase-cookie
 * session step for the internal route — there is no way to construct a
 * real browser auth cookie from vitest's node environment, so
 * `@/lib/current-user` is mocked to resolve to our real, DB-backed test
 * user (same id/workspaceId as the rows created below). Everything the
 * mocked `requireUser()` return value is then used for — the workspace-
 * scoped `getPresentation()` lookup, the Storage signed-URL fetch, the
 * headers, the body — is 100% real. The public route needs no such stub:
 * `getPresentationByShareToken` is called and hits the real DB directly.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { loadProjectLocalEnvIntoProcess } from "@/lib/database-url";

// Must run before anything that touches Supabase Storage (service client
// reads env straight from process.env; vitest doesn't populate it).
loadProjectLocalEnvIntoProcess();

vi.mock("@/lib/current-user", () => ({
  requireUser: vi.fn(async () => sessionUser()),
}));

import { db, schema } from "@/db";
import { getPresentation, getPresentationByShareToken } from "@/db/queries/presentations";
import { objectExists, removeObjects } from "@/lib/project-files/storage";
import { uploadPresentation } from "@/lib/wa-agent/tools/upload-presentation";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";
import type { SessionUser } from "@/lib/current-user";

function b64(html: string): string {
  return Buffer.from(html, "utf8").toString("base64");
}

const RUN_TAG = randomUUID().slice(0, 8);
const TEST_USER_ID = randomUUID();
const TEST_WORKSPACE_ID = randomUUID();

function sessionUser(): SessionUser {
  return {
    id: TEST_USER_ID,
    email: `render-path-test-${RUN_TAG}@local`,
    displayName: "Render Path Test User",
    workspaceId: TEST_WORKSPACE_ID,
    workspaceRole: "owner",
    whatsappPhone: null,
    timezone: "America/Caracas",
  };
}

const ctx: ToolContext = {
  workspaceId: TEST_WORKSPACE_ID,
  userId: TEST_USER_ID,
  workspaceRole: "owner",
  ownerTimezone: "America/Caracas",
  now: new Date(),
};

const MARKER_A = `RENDER-PATH-MARKER-A-${RUN_TAG}`;
const MARKER_B = `RENDER-PATH-MARKER-B-${RUN_TAG}`;

const createdPresentationIds: string[] = [];
const createdStoragePaths: string[] = [];

// Populated in beforeAll.
let deckAId = ""; // team-visibility (default), fetched via internal route
let deckBId = ""; // public deck, fetched via public route
let deckBToken = "";
let deckCId = ""; // visibility='team' but with a share token+enabled=true —
let deckCToken = ""; // the AND-gate regression case: must still 404 publicly
let deckASlideId = "";

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    email: `render-path-test-${RUN_TAG}@local`,
    displayName: "Render Path Test User",
  });
  await db.insert(schema.workspaces).values({
    id: TEST_WORKSPACE_ID,
    name: `Render Path Test WS ${RUN_TAG}`,
    createdBy: TEST_USER_ID,
  });

  // Deck A — plain upload, default visibility='team'. Exercises the
  // internal, login-gated proxy route.
  const htmlA = `<!doctype html><html><head><title>Deck A ${RUN_TAG}</title></head><body>
    <section id="cover"><h1>${MARKER_A}</h1></section>
    <section id="metrics"><h2>Metrics</h2></section>
  </body></html>`;
  const uploadA = await uploadPresentation.execute(
    { filename: `render-path-a-${RUN_TAG}.html`, content_base64: b64(htmlA) },
    ctx,
  );
  if (!uploadA.ok) throw new Error(`deck A upload failed: ${uploadA.error}`);
  deckAId = (uploadA.data as { presentationId: string }).presentationId;
  createdPresentationIds.push(deckAId);
  const rowA = await getPresentation({ id: deckAId, workspaceId: TEST_WORKSPACE_ID });
  if (!rowA?.htmlUrl) throw new Error("deck A has no htmlUrl after upload");
  createdStoragePaths.push(rowA.htmlUrl);
  deckASlideId = rowA.slideMap[0]?.slideId ?? "cover";

  // Deck B — flipped to visibility='public' + shareEnabled=true + a real
  // token, i.e. the state get_presentation_link requires before it will
  // hand out a public_url. Exercises the public /p/[token]/html route.
  const htmlB = `<!doctype html><html><head><title>Deck B ${RUN_TAG}</title></head><body>
    <section id="cover"><h1>${MARKER_B}</h1></section>
  </body></html>`;
  const uploadB = await uploadPresentation.execute(
    { filename: `render-path-b-${RUN_TAG}.html`, content_base64: b64(htmlB) },
    ctx,
  );
  if (!uploadB.ok) throw new Error(`deck B upload failed: ${uploadB.error}`);
  deckBId = (uploadB.data as { presentationId: string }).presentationId;
  createdPresentationIds.push(deckBId);
  const rowB = await getPresentation({ id: deckBId, workspaceId: TEST_WORKSPACE_ID });
  if (!rowB?.htmlUrl) throw new Error("deck B has no htmlUrl after upload");
  createdStoragePaths.push(rowB.htmlUrl);
  deckBToken = randomUUID();
  await db
    .update(schema.presentations)
    .set({ visibility: "public", shareEnabled: true, shareToken: deckBToken })
    .where(eq(schema.presentations.id, deckBId));

  // Deck C — the AND-gate regression case. shareEnabled=true AND a real
  // shareToken issued, but visibility is explicitly left at 'team'. If the
  // public route only checked shareToken+shareEnabled (dropping the
  // visibility half of the AND-gate that getPresentationByShareToken
  // enforces), this deck would leak. Must 404.
  const htmlC = `<section id="only"><h1>Should never be publicly reachable</h1></section>`;
  const uploadC = await uploadPresentation.execute(
    { filename: `render-path-c-${RUN_TAG}.html`, content_base64: b64(htmlC) },
    ctx,
  );
  if (!uploadC.ok) throw new Error(`deck C upload failed: ${uploadC.error}`);
  deckCId = (uploadC.data as { presentationId: string }).presentationId;
  createdPresentationIds.push(deckCId);
  const rowC = await getPresentation({ id: deckCId, workspaceId: TEST_WORKSPACE_ID });
  if (!rowC?.htmlUrl) throw new Error("deck C has no htmlUrl after upload");
  createdStoragePaths.push(rowC.htmlUrl);
  deckCToken = randomUUID();
  await db
    .update(schema.presentations)
    .set({ shareEnabled: true, shareToken: deckCToken }) // visibility stays 'team'
    .where(eq(schema.presentations.id, deckCId));
});

afterAll(async () => {
  if (createdPresentationIds.length) {
    await db
      .delete(schema.presentations)
      .where(inArray(schema.presentations.id, createdPresentationIds));
  }
  if (createdStoragePaths.length) {
    await removeObjects(createdStoragePaths);
  }
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, TEST_WORKSPACE_ID));
  await db.delete(schema.users).where(eq(schema.users.id, TEST_USER_ID));

  // Verify zero residue.
  const remainingPresentations = await db
    .select({ id: schema.presentations.id })
    .from(schema.presentations)
    .where(inArray(schema.presentations.id, createdPresentationIds));
  expect(remainingPresentations).toHaveLength(0);
  for (const path of createdStoragePaths) {
    expect(await objectExists(path)).toBe(false);
  }
  const remainingWorkspace = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, TEST_WORKSPACE_ID));
  expect(remainingWorkspace).toHaveLength(0);
  const remainingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, TEST_USER_ID));
  expect(remainingUser).toHaveLength(0);
});

describe("internal proxy route: app/(stage)/presentations/[id]/html/route.ts", () => {
  it("serves the real uploaded HTML bytes to an authenticated workspace user", async () => {
    const { GET } = await import("@/app/(stage)/presentations/[id]/html/route");
    const res = await GET(new Request(`http://localhost/presentations/${deckAId}/html`), {
      params: Promise.resolve({ id: deckAId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Type")).not.toMatch(/text\/plain/);
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain(MARKER_A);
    expect(body).not.toMatch(/"error"/); // not an error-JSON body
  });

  it("404s for a presentation id that doesn't exist in the workspace", async () => {
    const { GET } = await import("@/app/(stage)/presentations/[id]/html/route");
    const res = await GET(new Request("http://localhost/presentations/x/html"), {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });
});

describe("public proxy route: app/p/[token]/html/route.ts", () => {
  it("serves the real uploaded HTML bytes for a public, share-enabled deck", async () => {
    const { GET } = await import("@/app/p/[token]/html/route");
    const res = await GET(new Request(`http://localhost/p/${deckBToken}/html`), {
      params: Promise.resolve({ token: deckBToken }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Type")).not.toMatch(/text\/plain/);
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain(MARKER_B);
  });

  it("404s a 'team'-visibility deck's token even when shareEnabled=true (AND-gate holds at the render layer, not just link-generation)", async () => {
    // Sanity-check the fixture first: the token is real and the row exists.
    const directLookup = await getPresentationByShareToken(deckCToken);
    expect(directLookup).toBeNull(); // visibility='team' fails the AND-gate

    const { GET } = await import("@/app/p/[token]/html/route");
    const res = await GET(new Request(`http://localhost/p/${deckCToken}/html`), {
      params: Promise.resolve({ token: deckCToken }),
    });
    expect([403, 404]).toContain(res.status);
    const body = await res.text();
    expect(body).not.toContain("Should never be publicly reachable");
  });

  it("404s an unknown token outright", async () => {
    const { GET } = await import("@/app/p/[token]/html/route");
    const res = await GET(new Request("http://localhost/p/nope/html"), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PresentationPlayer kind='html' branch points the iframe at the proxy routes", () => {
  it("internal mode: iframe src is the internal proxy path, never the raw storage path/signed URL", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PresentationPlayer } = await import(
      "@/components/presentations/presentation-player"
    );

    const rowA = await getPresentation({ id: deckAId, workspaceId: TEST_WORKSPACE_ID });
    expect(rowA).not.toBeNull();

    const markup = renderToStaticMarkup(
      React.createElement(PresentationPlayer, {
        presentationId: deckAId,
        slides: [],
        initialComments: [],
        mode: "internal",
        allowComments: false,
        kind: "html",
        slideMap: rowA!.slideMap,
      }),
    );

    const iframeMatch = markup.match(/<iframe[^>]*src="([^"]+)"[^>]*>/);
    expect(iframeMatch).not.toBeNull();
    const src = iframeMatch![1];
    expect(src).toBe(`/presentations/${deckAId}/html#${encodeURIComponent(deckASlideId)}`);
    expect(src.startsWith(`/presentations/${deckAId}/html`)).toBe(true);
    // Must never be the raw Storage object path or a signed/pre-authenticated URL.
    expect(src).not.toContain(rowA!.htmlUrl!);
    expect(src).not.toMatch(/^https?:\/\//);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/token=/i);
  });

  it("external mode: iframe src is the public proxy path, keyed by token, never a raw storage/signed URL", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PresentationPlayer } = await import(
      "@/components/presentations/presentation-player"
    );

    const rowB = await getPresentationByShareToken(deckBToken);
    expect(rowB).not.toBeNull();

    const markup = renderToStaticMarkup(
      React.createElement(PresentationPlayer, {
        presentationId: deckBId,
        slides: [],
        initialComments: [],
        mode: "external",
        token: deckBToken,
        allowComments: false,
        kind: "html",
        slideMap: rowB!.slideMap,
      }),
    );

    const iframeMatch = markup.match(/<iframe[^>]*src="([^"]+)"[^>]*>/);
    expect(iframeMatch).not.toBeNull();
    const src = iframeMatch![1];
    expect(src.startsWith(`/p/${deckBToken}/html`)).toBe(true);
    expect(src).not.toContain(rowB!.htmlUrl!);
    expect(src).not.toMatch(/^https?:\/\//);
    expect(src).not.toMatch(/supabase/i);
  });
});
