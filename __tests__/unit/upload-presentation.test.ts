/**
 * Real, DB-backed test for the upload_presentation WA-agent tool. Runs
 * against the dev database (via .env.local — see lib/database-url.ts) and
 * the real Supabase Storage bucket, no mocking of either. Everything the
 * test creates (users/workspace/lines-of-business/presentations/storage
 * objects) is cleaned up in afterAll/afterEach so the dev DB is left as it
 * was found.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loadProjectLocalEnvIntoProcess } from "@/lib/database-url";

// Storage's service client reads SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL
// straight from process.env (see lib/project-files/storage.ts). Next.js populates
// those automatically in the app; vitest does not, so pull them from .env.local
// before anything below touches Storage — same helper scripts/verify.ts uses.
loadProjectLocalEnvIntoProcess();

import { db, schema } from "@/db";
import { getPresentationById } from "@/db/queries/presentations";
import { objectExists, removeObjects } from "@/lib/project-files/storage";
import { buildSlideMap, uploadPresentation } from "@/lib/wa-agent/tools/upload-presentation";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";

function b64(html: string): string {
  return Buffer.from(html, "utf8").toString("base64");
}

const TEST_USER_ID = crypto.randomUUID();
const TEST_WORKSPACE_ID = crypto.randomUUID();
const OTHER_WORKSPACE_ID = crypto.randomUUID();
const OTHER_USER_ID = crypto.randomUUID();

const ctx: ToolContext = {
  workspaceId: TEST_WORKSPACE_ID,
  userId: TEST_USER_ID,
  workspaceRole: "owner",
  ownerTimezone: "America/Caracas",
  now: new Date(),
};

const createdPresentationIds: string[] = [];
const createdStoragePaths: string[] = [];
let ourLobId: string | null = null;
let otherLobId: string | null = null;

beforeAll(async () => {
  await db.insert(schema.users).values([
    { id: TEST_USER_ID, email: `upload-presentation-test-${TEST_USER_ID}@local`, displayName: "Upload Presentation Test User" },
    { id: OTHER_USER_ID, email: `upload-presentation-other-${OTHER_USER_ID}@local`, displayName: "Other Workspace User" },
  ]);
  await db.insert(schema.workspaces).values([
    { id: TEST_WORKSPACE_ID, name: "Upload Presentation Test WS", createdBy: TEST_USER_ID },
    { id: OTHER_WORKSPACE_ID, name: "Upload Presentation Other WS", createdBy: OTHER_USER_ID },
  ]);
  const [ourLob] = await db
    .insert(schema.linesOfBusiness)
    .values({ workspaceId: TEST_WORKSPACE_ID, title: "Our LoB", createdBy: TEST_USER_ID })
    .returning({ id: schema.linesOfBusiness.id });
  ourLobId = ourLob.id;
  const [theirLob] = await db
    .insert(schema.linesOfBusiness)
    .values({ workspaceId: OTHER_WORKSPACE_ID, title: "Their LoB", createdBy: OTHER_USER_ID })
    .returning({ id: schema.linesOfBusiness.id });
  otherLobId = theirLob.id;
});

afterEach(async () => {
  if (createdPresentationIds.length) {
    for (const id of createdPresentationIds.splice(0)) {
      await db.delete(schema.presentations).where(eq(schema.presentations.id, id));
    }
  }
  if (createdStoragePaths.length) {
    await removeObjects(createdStoragePaths.splice(0));
  }
});

afterAll(async () => {
  await db.delete(schema.linesOfBusiness).where(eq(schema.linesOfBusiness.workspaceId, TEST_WORKSPACE_ID));
  await db.delete(schema.linesOfBusiness).where(eq(schema.linesOfBusiness.workspaceId, OTHER_WORKSPACE_ID));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, TEST_WORKSPACE_ID));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, OTHER_WORKSPACE_ID));
  await db.delete(schema.users).where(eq(schema.users.id, TEST_USER_ID));
  await db.delete(schema.users).where(eq(schema.users.id, OTHER_USER_ID));
});

describe("buildSlideMap (pure, tiered detection)", () => {
  it("tier 1: data-slide-id anchors win over sections/divs when present", () => {
    const html = `
      <html><body>
        <div data-slide-id="intro" data-slide-label="Intro Slide"><h1>Ignored</h1></div>
        <section id="s2"><h2>Section Two</h2></section>
        <div data-slide-id="closing"><h2>Closing Remarks</h2></div>
      </body></html>`;
    const map = buildSlideMap(html, "Fallback Title");
    expect(map).toEqual([
      { slideId: "intro", label: "Intro Slide" },
      { slideId: "closing", label: "Closing Remarks" },
    ]);
  });

  it("tier 2: <section> elements used when no data-slide-id anchors exist", () => {
    const html = `
      <html><body>
        <section id="roques"><h1>Los Roques</h1><p>copy</p></section>
        <section><h2>No Id Section</h2></section>
      </body></html>`;
    const map = buildSlideMap(html, "Fallback Title");
    expect(map).toEqual([
      { slideId: "roques", label: "Los Roques" },
      { slideId: "slide-2", label: "No Id Section" },
    ]);
  });

  it("tier 3: .slide divs used only when no sections exist either", () => {
    const html = `
      <html><body>
        <div class="deck-slide slide active" id="one"><h3>First</h3></div>
        <div class="not-a-match">nope</div>
        <div class="slide"><h1>Third heading only</h1></div>
      </body></html>`;
    const map = buildSlideMap(html, "Fallback Title");
    expect(map).toEqual([
      { slideId: "one", label: "First" },
      { slideId: "slide-2", label: "Third heading only" },
    ]);
  });

  it("falls back to a single 'full' slide when no tier matches anything", () => {
    const html = `<html><body><p>Just a plain page, no anchors.</p></body></html>`;
    const map = buildSlideMap(html, "My Deck Title");
    expect(map).toEqual([{ slideId: "full", label: "My Deck Title" }]);
  });

  it("de-dupes colliding slideIds by suffixing -2, -3, ...", () => {
    const html = `
      <section id="dup"><h1>First</h1></section>
      <section id="dup"><h1>Second</h1></section>
      <section id="dup"><h1>Third</h1></section>`;
    const map = buildSlideMap(html, "Fallback");
    expect(map.map((m) => m.slideId)).toEqual(["dup", "dup-2", "dup-3"]);
  });

  it("labels default to 'Slide {n}' when no heading is present", () => {
    const html = `<section id="a"><p>no heading here</p></section>`;
    const map = buildSlideMap(html, "Fallback");
    expect(map).toEqual([{ slideId: "a", label: "Slide 1" }]);
  });
});

describe("upload_presentation tool (real DB + real Storage)", () => {
  it("rejects non-html filenames", async () => {
    const result = await uploadPresentation.execute(
      { filename: "deck.pdf", content_base64: b64("<html></html>") },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/\.html\/\.htm/);
  });

  it("rejects missing content_base64", async () => {
    const result = await uploadPresentation.execute({ filename: "deck.html" }, ctx);
    expect(result.ok).toBe(false);
  });

  it("rejects executable content disguised with an .html extension", async () => {
    const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = await uploadPresentation.execute(
      { filename: "totally-a-deck.html", content_base64: exeBytes.toString("base64") },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/executable/i);
  });

  it("creates a kind='html' presentation row, uploads real bytes to Storage, and builds a slideMap", async () => {
    const html = `<!doctype html><html><head><title>Q3 Board Deck</title></head><body>
      <section id="cover"><h1>Q3 Board Deck</h1></section>
      <section id="metrics"><h2>Metrics</h2></section>
    </body></html>`;
    const result = await uploadPresentation.execute(
      { filename: "q3-board-deck.html", content_base64: b64(html) },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentationId: string; title: string; slideCount: number; href: string };
    createdPresentationIds.push(data.presentationId);
    expect(data.title).toBe("Q3 Board Deck"); // from <title>, since no title input given
    expect(data.slideCount).toBe(2);
    expect(data.href).toContain(data.presentationId);

    const row = await getPresentationById({ id: data.presentationId, workspaceId: TEST_WORKSPACE_ID });
    expect(row).not.toBeNull();
    expect(row?.kind).toBe("html");
    expect(row?.visibility).toBe("team"); // never public by default
    expect(row?.slides).toEqual([]);
    expect(row?.slideMap).toEqual([
      { slideId: "cover", label: "Q3 Board Deck" },
      { slideId: "metrics", label: "Metrics" },
    ]);
    expect(row?.htmlUrl).toBeTruthy();
    expect(row?.htmlUrl).not.toMatch(/^https?:\/\//); // storage OBJECT PATH, never a URL

    createdStoragePaths.push(row!.htmlUrl!);
    const exists = await objectExists(row!.htmlUrl!);
    expect(exists).toBe(true);
  });

  it("honors an explicit title/subtitle and attaches a lob_id from the same workspace", async () => {
    const html = `<section id="only"><h1>Ignored heading</h1></section>`;
    const result = await uploadPresentation.execute(
      {
        filename: "explicit.html",
        content_base64: b64(html),
        title: "Explicit Title",
        subtitle: "Explicit Subtitle",
        lob_id: ourLobId,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentationId: string };
    createdPresentationIds.push(data.presentationId);

    const row = await getPresentationById({ id: data.presentationId, workspaceId: TEST_WORKSPACE_ID });
    expect(row?.title).toBe("Explicit Title");
    expect(row?.subtitle).toBe("Explicit Subtitle");
    if (row?.htmlUrl) createdStoragePaths.push(row.htmlUrl);

    const [dbRow] = await db
      .select({ lobId: schema.presentations.lobId })
      .from(schema.presentations)
      .where(eq(schema.presentations.id, data.presentationId));
    expect(dbRow.lobId).toBe(ourLobId);
  });

  it("ignores a lob_id that belongs to a different workspace (no cross-tenant attach)", async () => {
    const html = `<p>no anchors</p>`;
    const result = await uploadPresentation.execute(
      { filename: "cross-tenant.html", content_base64: b64(html), lob_id: otherLobId },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentationId: string };
    createdPresentationIds.push(data.presentationId);

    const [dbRow] = await db
      .select({ lobId: schema.presentations.lobId, workspaceId: schema.presentations.workspaceId })
      .from(schema.presentations)
      .where(eq(schema.presentations.id, data.presentationId));
    expect(dbRow.lobId).toBeNull();
    expect(dbRow.workspaceId).toBe(TEST_WORKSPACE_ID);
  });

  it("falls back to a humanized filename title when there is no <title> tag or title input", async () => {
    const html = `<p>plain content, no title tag, no anchors</p>`;
    const result = await uploadPresentation.execute(
      { filename: "my-cool_deck.html", content_base64: b64(html) },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { presentationId: string; title: string };
    createdPresentationIds.push(data.presentationId);
    expect(data.title).toBe("My Cool Deck");

    const row = await getPresentationById({ id: data.presentationId, workspaceId: TEST_WORKSPACE_ID });
    expect(row?.slideMap).toEqual([{ slideId: "full", label: "My Cool Deck" }]);
    if (row?.htmlUrl) createdStoragePaths.push(row.htmlUrl);
  });
});
