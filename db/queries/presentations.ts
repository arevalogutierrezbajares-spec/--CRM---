import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Slide } from "@/lib/presentations/types";
import { isSlideArray } from "@/lib/presentations/types";

const { presentations, presentationComments, users } = schema;

export type PresentationRow = {
  id: string;
  title: string;
  subtitle: string | null;
  slides: Slide[];
  shareToken: string | null;
  shareEnabled: boolean;
  allowComments: boolean;
  updatedAt: Date;
};

export type PresentationComment = {
  id: string;
  slideId: string;
  xPct: number;
  yPct: number;
  body: string;
  authorName: string;
  resolvedAt: Date | null;
  createdAt: Date;
};

function toRow(r: typeof presentations.$inferSelect): PresentationRow {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    slides: isSlideArray(r.slides) ? r.slides : [],
    shareToken: r.shareToken,
    shareEnabled: r.shareEnabled,
    allowComments: r.allowComments,
    updatedAt: r.updatedAt,
  };
}

export async function listPresentations(opts: { workspaceId: string }) {
  const rows = await db
    .select()
    .from(presentations)
    .where(eq(presentations.workspaceId, opts.workspaceId))
    .orderBy(desc(presentations.updatedAt));
  return rows.map(toRow);
}

export async function getPresentation(opts: {
  id: string;
  workspaceId: string;
}): Promise<PresentationRow | null> {
  const [r] = await db
    .select()
    .from(presentations)
    .where(
      and(
        eq(presentations.id, opts.id),
        eq(presentations.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return r ? toRow(r) : null;
}

/** External: resolve a presentation by its share token (only if sharing is on). */
export async function getPresentationByShareToken(
  token: string,
): Promise<(PresentationRow & { workspaceId: string }) | null> {
  const [r] = await db
    .select()
    .from(presentations)
    .where(
      and(eq(presentations.shareToken, token), eq(presentations.shareEnabled, true)),
    )
    .limit(1);
  return r ? { ...toRow(r), workspaceId: r.workspaceId } : null;
}

export async function listPresentationComments(opts: {
  presentationId: string;
}): Promise<PresentationComment[]> {
  const rows = await db
    .select({
      id: presentationComments.id,
      slideId: presentationComments.slideId,
      xPct: presentationComments.xPct,
      yPct: presentationComments.yPct,
      body: presentationComments.body,
      authorName: presentationComments.authorName,
      authorDisplayName: users.displayName,
      resolvedAt: presentationComments.resolvedAt,
      createdAt: presentationComments.createdAt,
    })
    .from(presentationComments)
    .leftJoin(users, eq(users.id, presentationComments.authorUserId))
    .where(eq(presentationComments.presentationId, opts.presentationId))
    .orderBy(asc(presentationComments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    slideId: r.slideId,
    xPct: r.xPct,
    yPct: r.yPct,
    body: r.body,
    authorName: r.authorName ?? r.authorDisplayName ?? "Someone",
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
  }));
}
