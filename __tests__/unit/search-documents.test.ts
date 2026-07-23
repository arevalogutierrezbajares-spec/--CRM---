import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchDocumentsTool } from "@/lib/wa-agent/tools/search-documents";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";

/**
 * Real, DB-backed exercise of the search_documents tool against the dev
 * Supabase DB (@/db resolves DATABASE_URL from .env.local — see
 * lib/database-url.ts). No mocking of the database: every row this test
 * reads was inserted by this test, and everything it inserts is deleted in
 * afterAll via workspace cascade + explicit user cleanup.
 */

const { users, workspaces, linesOfBusiness, projectLinks, presentations } = schema;

const RUN_TAG = randomUUID().slice(0, 8);
const userId = randomUUID();
const workspaceId = randomUUID();
let lobId = "";

const otherWorkspaceQuery = `sd-test-${RUN_TAG}`;

const ctx: ToolContext = {
  workspaceId,
  userId,
  workspaceRole: "owner",
  ownerTimezone: "America/Caracas",
  now: new Date("2026-07-22T12:00:00Z"),
};

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    displayName: "Search Documents Test User",
    email: `search-documents-test-${RUN_TAG}@example.com`,
  });

  await db.insert(workspaces).values({
    id: workspaceId,
    name: `Search Documents Test Workspace ${RUN_TAG}`,
    createdBy: userId,
  });

  const [lob] = await db
    .insert(linesOfBusiness)
    .values({
      workspaceId,
      title: `Search Documents Test Project ${RUN_TAG}`,
      createdBy: userId,
    })
    .returning({ id: linesOfBusiness.id });
  lobId = lob.id;

  await db.insert(projectLinks).values({
    workspaceId,
    lobId,
    kind: "link",
    label: `${otherWorkspaceQuery} Contract PDF`,
    url: "https://example.com/contract.pdf",
    description: "Signed contract",
    createdBy: userId,
  });

  await db.insert(presentations).values({
    workspaceId,
    title: `${otherWorkspaceQuery} Structured Deck`,
    subtitle: "Q3 pitch",
    kind: "structured",
    slides: [],
    createdBy: userId,
  });

  await db.insert(presentations).values({
    workspaceId,
    title: `${otherWorkspaceQuery} Uploaded HTML Deck`,
    subtitle: "Client walkthrough",
    kind: "html",
    slides: [],
    htmlUrl: `${workspaceId}/presentations/fake/deck.html`,
    slideMap: [{ slideId: "full", label: "Uploaded HTML Deck" }],
    createdBy: userId,
  });
});

afterAll(async () => {
  // Cascades linesOfBusiness / projectLinks / presentations (+ their
  // comments) via each table's workspaceId FK onDelete:'cascade'.
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("search_documents tool (DB-backed)", () => {
  it("has a well-formed tool definition", () => {
    expect(searchDocumentsTool.definition.name).toBe("search_documents");
    expect(searchDocumentsTool.definition.input_schema).toMatchObject({
      type: "object",
    });
  });

  it("rejects an empty query", async () => {
    const result = await searchDocumentsTool.execute({ query: "   " }, ctx);
    expect(result.ok).toBe(false);
  });

  it("finds the project link, structured deck, and html deck by title fragment", async () => {
    const result = await searchDocumentsTool.execute(
      { query: otherWorkspaceQuery },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.data as {
      count: number;
      results: Array<{
        id: string;
        source: "presentation" | "project_link";
        kind: string;
        title: string;
        href: string;
        url: string | null;
      }>;
    };

    expect(data.count).toBe(3);
    expect(data.results).toHaveLength(3);

    const link = data.results.find((r) => r.source === "project_link");
    expect(link).toBeDefined();
    expect(link!.kind).toBe("link");
    expect(link!.url).toBe("https://example.com/contract.pdf");
    expect(link!.href).toContain(`/projects/${lobId}`);

    const structured = data.results.find(
      (r) => r.source === "presentation" && r.kind === "structured",
    );
    expect(structured).toBeDefined();
    expect(structured!.title).toContain("Structured Deck");

    const html = data.results.find(
      (r) => r.source === "presentation" && r.kind === "html",
    );
    expect(html).toBeDefined();
    expect(html!.title).toContain("Uploaded HTML Deck");
    // Never leak the storage object path (htmlUrl) into search results.
    expect(JSON.stringify(html)).not.toContain("deck.html");
    expect(JSON.stringify(html)).not.toContain(workspaceId + "/presentations");
  });

  it("scopes results to the caller's workspace only", async () => {
    const otherWorkspaceCtx: ToolContext = {
      ...ctx,
      workspaceId: randomUUID(), // a workspace with no rows at all
    };
    const result = await searchDocumentsTool.execute(
      { query: otherWorkspaceQuery },
      otherWorkspaceCtx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { count: number }).count).toBe(0);
  });

  it("respects the limit parameter", async () => {
    const result = await searchDocumentsTool.execute(
      { query: otherWorkspaceQuery, limit: 1 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as { count: number }).count).toBe(1);
  });
});
