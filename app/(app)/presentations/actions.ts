"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { createShareToken } from "@/lib/presentations/token.server";
import { EXAMPLE_PRESENTATION } from "@/lib/presentations/seed";
import { getPresentationByShareToken } from "@/db/queries/presentations";

const { presentations, presentationComments } = schema;

export type CommentResult =
  | {
      ok: true;
      comment: {
        id: string;
        slideId: string;
        xPct: number;
        yPct: number;
        body: string;
        authorName: string;
        resolvedAt: null;
        createdAt: string;
      };
    }
  | { ok: false; error: string };

type CommentInput = {
  slideId: string;
  xPct: number;
  yPct: number;
  body: string;
};

function validComment(input: CommentInput): string | null {
  if (!input.body.trim()) return "Comment can't be empty";
  if (input.body.length > 2000) return "Comment too long";
  if (
    !Number.isFinite(input.xPct) ||
    !Number.isFinite(input.yPct) ||
    input.xPct < 0 ||
    input.xPct > 1 ||
    input.yPct < 0 ||
    input.yPct > 1
  )
    return "Bad position";
  if (!input.slideId) return "Missing slide";
  return null;
}

export async function createExamplePresentationAction() {
  const user = await requireUser();
  const [row] = await db
    .insert(presentations)
    .values({
      title: EXAMPLE_PRESENTATION.title,
      subtitle: EXAMPLE_PRESENTATION.subtitle,
      slides: EXAMPLE_PRESENTATION.slides,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({ id: presentations.id });
  revalidatePath("/presentations");
  redirect(`/presentations/${row.id}`);
}

export async function updatePresentationMetaAction(
  id: string,
  patch: { title?: string; subtitle?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const set: Partial<typeof presentations.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty" };
    set.title = t;
  }
  if (patch.subtitle !== undefined) set.subtitle = patch.subtitle.trim() || null;
  const [row] = await db
    .update(presentations)
    .set(set)
    .where(and(eq(presentations.id, id), eq(presentations.workspaceId, user.workspaceId)))
    .returning({ id: presentations.id });
  if (!row) return { ok: false, error: "Not found" };
  revalidatePath(`/presentations/${id}`);
  return { ok: true };
}

export async function setPresentationShareAction(
  id: string,
  enabled: boolean,
): Promise<{ ok: true; shareToken: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db
    .select({ token: presentations.shareToken })
    .from(presentations)
    .where(and(eq(presentations.id, id), eq(presentations.workspaceId, user.workspaceId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Not found" };

  const token =
    existing.token ?? (enabled ? createShareToken() : null);
  await db
    .update(presentations)
    .set({ shareEnabled: enabled, shareToken: token, updatedAt: new Date() })
    .where(and(eq(presentations.id, id), eq(presentations.workspaceId, user.workspaceId)));
  revalidatePath(`/presentations/${id}`);
  return { ok: true, shareToken: enabled ? token : existing.token };
}

export async function addCommentAction(
  presentationId: string,
  input: CommentInput,
): Promise<CommentResult> {
  const user = await requireUser();
  const err = validComment(input);
  if (err) return { ok: false, error: err };
  const [p] = await db
    .select({ id: presentations.id })
    .from(presentations)
    .where(
      and(
        eq(presentations.id, presentationId),
        eq(presentations.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!p) return { ok: false, error: "Not found" };

  const [c] = await db
    .insert(presentationComments)
    .values({
      workspaceId: user.workspaceId,
      presentationId,
      slideId: input.slideId,
      xPct: input.xPct,
      yPct: input.yPct,
      body: input.body.trim(),
      authorUserId: user.id,
    })
    .returning({ id: presentationComments.id, createdAt: presentationComments.createdAt });

  revalidatePath(`/presentations/${presentationId}`);
  return {
    ok: true,
    comment: {
      id: c.id,
      slideId: input.slideId,
      xPct: input.xPct,
      yPct: input.yPct,
      body: input.body.trim(),
      authorName: user.displayName ?? "You",
      resolvedAt: null,
      createdAt: c.createdAt.toISOString(),
    },
  };
}

/** External (token) commenting — no login; identifies the author by name. */
export async function addCommentByTokenAction(
  token: string,
  input: CommentInput & { authorName: string },
): Promise<CommentResult> {
  const err = validComment(input);
  if (err) return { ok: false, error: err };
  const p = await getPresentationByShareToken(token);
  if (!p) return { ok: false, error: "This link is no longer available" };
  if (!p.allowComments) return { ok: false, error: "Comments are turned off" };
  const name = input.authorName.trim().slice(0, 80) || "Guest";

  const [c] = await db
    .insert(presentationComments)
    .values({
      workspaceId: p.workspaceId,
      presentationId: p.id,
      slideId: input.slideId,
      xPct: input.xPct,
      yPct: input.yPct,
      body: input.body.trim(),
      authorName: name,
    })
    .returning({ id: presentationComments.id, createdAt: presentationComments.createdAt });

  revalidatePath(`/p/${token}`);
  return {
    ok: true,
    comment: {
      id: c.id,
      slideId: input.slideId,
      xPct: input.xPct,
      yPct: input.yPct,
      body: input.body.trim(),
      authorName: name,
      resolvedAt: null,
      createdAt: c.createdAt.toISOString(),
    },
  };
}

export async function resolveCommentAction(
  commentId: string,
  resolved: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [row] = await db
    .update(presentationComments)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(
      and(
        eq(presentationComments.id, commentId),
        eq(presentationComments.workspaceId, user.workspaceId),
      ),
    )
    .returning({ id: presentationComments.id, presentationId: presentationComments.presentationId });
  if (!row) return { ok: false, error: "Not found" };
  revalidatePath(`/presentations/${row.presentationId}`);
  return { ok: true };
}

export async function deleteCommentAction(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [row] = await db
    .delete(presentationComments)
    .where(
      and(
        eq(presentationComments.id, commentId),
        eq(presentationComments.workspaceId, user.workspaceId),
      ),
    )
    .returning({ presentationId: presentationComments.presentationId });
  if (!row) return { ok: false, error: "Not found" };
  revalidatePath(`/presentations/${row.presentationId}`);
  return { ok: true };
}
