/**
 * DB-backed unit tests for list_presentations + get_presentation_link — no
 * database mocking. Exercises the real db/queries/presentations.ts helpers
 * against the dev database (DATABASE_URL resolved via lib/database-url.ts,
 * same as every other db-touching module in this repo).
 *
 * Creates its own disposable workspace/user/presentation rows and tears them
 * down in afterAll so it leaves no residue in the dev DB.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SITE_URL } from "@/lib/site-url";
import { listPresentationsTool } from "@/lib/wa-agent/tools/list-presentations";
import { getPresentationLink } from "@/lib/wa-agent/tools/get-presentation-link";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";

const { users, workspaces, presentations } = schema;

const userId = randomUUID();
const workspaceId = randomUUID();
// A second, unrelated workspace to prove workspace scoping (no cross-tenant leak).
const otherWorkspaceId = randomUUID();

let ctx: ToolContext;
let otherCtx: ToolContext;

let structuredId: string;
let publicHtmlId: string;
let markedPublicNotSharedId: string;
let publicNoTokenId: string;
let ambiguousAId: string;
let ambiguousBId: string;

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    displayName: "Presentation Link Tool Test User",
    email: `presentation-link-tool-test-${userId}@example.com`,
  });
  await db.insert(workspaces).values([
    { id: workspaceId, name: "Presentation Link Tool Test WS", createdBy: userId },
    { id: otherWorkspaceId, name: "Presentation Link Tool Test WS (other)", createdBy: userId },
  ]);

  ctx = {
    workspaceId,
    userId,
    workspaceRole: "owner",
    ownerTimezone: "America/Caracas",
    now: new Date("2026-07-22T12:00:00Z"),
  };
  otherCtx = { ...ctx, workspaceId: otherWorkspaceId };

  const [structured] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "Q3 Board Update",
      subtitle: "Team-only structured deck",
      slides: [
        { id: "s1", layout: "cover" },
        { id: "s2", layout: "bullets" },
      ],
      kind: "structured",
      visibility: "team",
      shareEnabled: false,
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  structuredId = structured.id;

  const [publicHtml] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "VAV Product Deck",
      subtitle: "Public uploaded HTML deck",
      kind: "html",
      htmlUrl: `${workspaceId}/presentations/fake/deck.html`,
      slideMap: [
        { slideId: "full", label: "VAV Product Deck" },
        { slideId: "slide-2", label: "Roadmap" },
      ],
      visibility: "public",
      shareEnabled: true,
      shareToken: `tok-${randomUUID()}`,
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  publicHtmlId = publicHtml.id;

  const [markedPublicNotShared] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "Draft Public Deck",
      kind: "structured",
      visibility: "public",
      shareEnabled: false,
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  markedPublicNotSharedId = markedPublicNotShared.id;

  const [publicNoToken] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "Public No Token Deck",
      kind: "structured",
      visibility: "public",
      shareEnabled: true,
      shareToken: null,
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  publicNoTokenId = publicNoToken.id;

  const [ambiguousA] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "Onboarding Deck Americas",
      kind: "structured",
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  ambiguousAId = ambiguousA.id;

  const [ambiguousB] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title: "Onboarding Deck EMEA",
      kind: "structured",
      createdBy: userId,
    })
    .returning({ id: presentations.id });
  ambiguousBId = ambiguousB.id;

  // A presentation in a DIFFERENT workspace, so cross-tenant leak tests fail
  // loudly if either tool ever forgets to scope by workspaceId.
  await db.insert(presentations).values({
    workspaceId: otherWorkspaceId,
    title: "Other Workspace Secret Deck",
    kind: "structured",
    createdBy: userId,
  });
});

afterAll(async () => {
  // presentations cascade-delete when their workspace is deleted.
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("list_presentations", () => {
  it("lists every kind of presentation in the workspace, scoped to it", async () => {
    const result = await listPresentationsTool.execute({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { count: number; presentations: Array<Record<string, unknown>> };
    const ids = data.presentations.map((p) => p.id);
    expect(ids).toContain(structuredId);
    expect(ids).toContain(publicHtmlId);
    // Never leak the other workspace's deck.
    expect(data.presentations.some((p) => p.title === "Other Workspace Secret Deck")).toBe(false);

    const structuredRow = data.presentations.find((p) => p.id === structuredId)!;
    expect(structuredRow.kind).toBe("structured");
    expect(structuredRow.visibility).toBe("team");
    expect(structuredRow.slideCount).toBe(2);
    expect(structuredRow.publiclyReachable).toBe(false);
    expect(structuredRow.href).toBe(`${SITE_URL}/presentations/${structuredId}`);
    // Never expose the storage path / raw share token.
    expect(structuredRow).not.toHaveProperty("htmlUrl");
    expect(structuredRow).not.toHaveProperty("shareToken");

    const htmlRow = data.presentations.find((p) => p.id === publicHtmlId)!;
    expect(htmlRow.kind).toBe("html");
    expect(htmlRow.visibility).toBe("public");
    expect(htmlRow.slideCount).toBe(2);
    expect(htmlRow.publiclyReachable).toBe(true);
    expect(htmlRow).not.toHaveProperty("htmlUrl");
  });

  it("filters by title/subtitle fragment", async () => {
    const result = await listPresentationsTool.execute({ query: "board update" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentations: Array<{ id: string }> };
    expect(data.presentations.map((p) => p.id)).toEqual([structuredId]);
  });

  it("is scoped to the calling workspace", async () => {
    const result = await listPresentationsTool.execute({}, otherCtx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentations: Array<{ title: string }> };
    expect(data.presentations.map((p) => p.title)).toEqual(["Other Workspace Secret Deck"]);
  });
});

describe("get_presentation_link", () => {
  it("returns only the internal link for a team-only deck, with a note", async () => {
    const result = await getPresentationLink.execute({ presentation_id: structuredId }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { internalUrl: string; publicUrl: string | null; note?: string };
    expect(data.internalUrl).toBe(`${SITE_URL}/presentations/${structuredId}`);
    expect(data.publicUrl).toBeNull();
    expect(data.note).toMatch(/team-only/i);
  });

  it("returns both links for a fully public+shared+tokened deck", async () => {
    const result = await getPresentationLink.execute({ presentation_id: publicHtmlId }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { internalUrl: string; publicUrl: string | null };
    expect(data.internalUrl).toBe(`${SITE_URL}/presentations/${publicHtmlId}`);
    const [row] = await db
      .select({ shareToken: presentations.shareToken })
      .from(presentations)
      .where(eq(presentations.id, publicHtmlId));
    expect(data.publicUrl).toBe(`${SITE_URL}/p/${row.shareToken}`);
  });

  it("withholds the public link when visibility=public but sharing is off", async () => {
    const result = await getPresentationLink.execute(
      { presentation_id: markedPublicNotSharedId },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { publicUrl: string | null; note?: string };
    expect(data.publicUrl).toBeNull();
    expect(data.note).toMatch(/sharing is currently off/i);
  });

  it("withholds the public link when visibility=public + shareEnabled but no token issued", async () => {
    const result = await getPresentationLink.execute({ presentation_id: publicNoTokenId }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { publicUrl: string | null; note?: string };
    expect(data.publicUrl).toBeNull();
    expect(data.note).toMatch(/no share link has been issued/i);
  });

  it("resolves by title query when unambiguous", async () => {
    const result = await getPresentationLink.execute({ query: "board update" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { id: string };
    expect(data.id).toBe(structuredId);
  });

  it("returns disambiguation matches instead of guessing", async () => {
    const result = await getPresentationLink.execute({ query: "onboarding deck" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { ambiguous?: boolean; matches?: Array<{ id: string }> };
    expect(data.ambiguous).toBe(true);
    const ids = (data.matches ?? []).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([ambiguousAId, ambiguousBId]));
  });

  it("errors when the id doesn't exist in this workspace", async () => {
    const result = await getPresentationLink.execute({ presentation_id: randomUUID() }, ctx);
    expect(result.ok).toBe(false);
  });

  it("errors when neither presentation_id nor query is given", async () => {
    const result = await getPresentationLink.execute({}, ctx);
    expect(result.ok).toBe(false);
  });

  it("cannot resolve another workspace's presentation by id (IDOR check)", async () => {
    const result = await getPresentationLink.execute({ presentation_id: structuredId }, otherCtx);
    expect(result.ok).toBe(false);
  });
});
