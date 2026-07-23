import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { listPresentationCommentsTool } from "@/lib/wa-agent/tools/list-presentation-comments";
import { resolvePresentationCommentTool } from "@/lib/wa-agent/tools/resolve-presentation-comment";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { presentations, presentationComments } = schema;

function ctxFor(workspaceId: string): ToolContext {
  return {
    workspaceId,
    userId: FAKE_USER_ID,
    workspaceRole: "owner",
    ownerTimezone: "America/New_York",
    now: new Date(),
  };
}

async function makePresentation(workspaceId: string, title: string) {
  const [p] = await db
    .insert(presentations)
    .values({
      workspaceId,
      title,
      createdBy: FAKE_USER_ID,
    })
    .returning();
  return p;
}

async function makeComment(opts: {
  workspaceId: string;
  presentationId: string;
  slideId: string;
  body: string;
  resolvedAt?: Date | null;
}) {
  const [c] = await db
    .insert(presentationComments)
    .values({
      workspaceId: opts.workspaceId,
      presentationId: opts.presentationId,
      slideId: opts.slideId,
      xPct: 0.5,
      yPct: 0.5,
      body: opts.body,
      authorName: "External Reviewer",
      resolvedAt: opts.resolvedAt ?? null,
    })
    .returning();
  return c;
}

describe("[integration] presentation comment tools", () => {
  it("list_presentation_comments defaults to open comments, shape includes slideId/position/text/resolvedAt", async () => {
    const p = await makePresentation(FAKE_WORKSPACE_ID, "Q3 Board Deck");
    const open = await makeComment({
      workspaceId: FAKE_WORKSPACE_ID,
      presentationId: p.id,
      slideId: "s3",
      body: "Fix this number",
    });
    await makeComment({
      workspaceId: FAKE_WORKSPACE_ID,
      presentationId: p.id,
      slideId: "s4",
      body: "Already handled",
      resolvedAt: new Date(),
    });

    const res = await listPresentationCommentsTool.execute(
      { presentation_id: p.id },
      ctxFor(FAKE_WORKSPACE_ID),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as {
      comments: {
        id: string;
        slideId: string;
        position: { xPct: number; yPct: number };
        text: string;
        resolvedAt: Date | null;
      }[];
    };
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].id).toBe(open.id);
    expect(data.comments[0].slideId).toBe("s3");
    expect(data.comments[0].position).toEqual({ xPct: 0.5, yPct: 0.5 });
    expect(data.comments[0].text).toBe("Fix this number");
    expect(data.comments[0].resolvedAt).toBeNull();
  });

  it("list_presentation_comments status='all' and slide_id filter work, and html-style slide ids pass through", async () => {
    const p = await makePresentation(FAKE_WORKSPACE_ID, "Uploaded HTML Deck");
    await makeComment({
      workspaceId: FAKE_WORKSPACE_ID,
      presentationId: p.id,
      slideId: "full",
      body: "html anchor comment",
    });
    await makeComment({
      workspaceId: FAKE_WORKSPACE_ID,
      presentationId: p.id,
      slideId: "slide-2",
      body: "resolved html comment",
      resolvedAt: new Date(),
    });

    const all = await listPresentationCommentsTool.execute(
      { presentation_id: p.id, status: "all" },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect((all.data as { comments: unknown[] }).comments).toHaveLength(2);
    }

    const filtered = await listPresentationCommentsTool.execute(
      { presentation_id: p.id, slide_id: "full", status: "all" },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      const c = (filtered.data as { comments: { slideId: string }[] }).comments;
      expect(c).toHaveLength(1);
      expect(c[0].slideId).toBe("full");
    }
  });

  it("list_presentation_comments rejects a presentation id from another workspace (IDOR)", async () => {
    const otherWorkspaceId = "22222222-2222-2222-2222-222222222222";
    await db
      .insert(schema.users)
      .values({ id: FAKE_USER_ID, email: "test@local", displayName: "Test Founder" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaces)
      .values({ id: otherWorkspaceId, name: "Other Workspace", createdBy: FAKE_USER_ID })
      .onConflictDoNothing();

    const p = await makePresentation(otherWorkspaceId, "Someone else's deck");
    await makeComment({
      workspaceId: otherWorkspaceId,
      presentationId: p.id,
      slideId: "s1",
      body: "secret feedback",
    });

    const res = await listPresentationCommentsTool.execute(
      { presentation_id: p.id },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it("list_presentation_comments errors without presentation_id", async () => {
    const res = await listPresentationCommentsTool.execute({}, ctxFor(FAKE_WORKSPACE_ID));
    expect(res.ok).toBe(false);
  });

  it("resolve_presentation_comment marks resolved and can reopen", async () => {
    const p = await makePresentation(FAKE_WORKSPACE_ID, "Resolve Me Deck");
    const c = await makeComment({
      workspaceId: FAKE_WORKSPACE_ID,
      presentationId: p.id,
      slideId: "s1",
      body: "please fix",
    });

    const resolveRes = await resolvePresentationCommentTool.execute(
      { comment_id: c.id },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(resolveRes.ok).toBe(true);
    if (resolveRes.ok) {
      const data = resolveRes.data as { id: string; resolvedAt: Date | null };
      expect(data.id).toBe(c.id);
      expect(data.resolvedAt).not.toBeNull();
    }

    const afterResolve = await listPresentationCommentsTool.execute(
      { presentation_id: p.id, status: "open" },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    if (afterResolve.ok) {
      expect((afterResolve.data as { comments: unknown[] }).comments).toHaveLength(0);
    }

    const reopenRes = await resolvePresentationCommentTool.execute(
      { comment_id: c.id, resolved: false },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(reopenRes.ok).toBe(true);
    if (reopenRes.ok) {
      const data = reopenRes.data as { resolvedAt: Date | null };
      expect(data.resolvedAt).toBeNull();
    }

    const afterReopen = await listPresentationCommentsTool.execute(
      { presentation_id: p.id, status: "open" },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    if (afterReopen.ok) {
      expect((afterReopen.data as { comments: unknown[] }).comments).toHaveLength(1);
    }
  });

  it("resolve_presentation_comment refuses to resolve a comment belonging to another workspace (IDOR)", async () => {
    const otherWorkspaceId = "33333333-3333-3333-3333-333333333333";
    await db
      .insert(schema.workspaces)
      .values({ id: otherWorkspaceId, name: "Other Workspace 2", createdBy: FAKE_USER_ID })
      .onConflictDoNothing();
    const p = await makePresentation(otherWorkspaceId, "Cross-tenant deck");
    const c = await makeComment({
      workspaceId: otherWorkspaceId,
      presentationId: p.id,
      slideId: "s1",
      body: "not yours",
    });

    const res = await resolvePresentationCommentTool.execute(
      { comment_id: c.id },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it("resolve_presentation_comment errors on unknown comment_id", async () => {
    const res = await resolvePresentationCommentTool.execute(
      { comment_id: "00000000-0000-0000-0000-000000000099" },
      ctxFor(FAKE_WORKSPACE_ID),
    );
    expect(res.ok).toBe(false);
  });
});
