import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { SITE_URL } from "@/lib/site-url";
import type { Slide } from "@/lib/presentations/types";
import { isSlideArray } from "@/lib/presentations/types";

const { presentations, presentationComments, projectLinks, users } = schema;

export type PresentationKind = "structured" | "html";
export type PresentationVisibility = "team" | "public";
export type SlideMapEntry = { slideId: string; label: string };

export type PresentationRow = {
  id: string;
  title: string;
  subtitle: string | null;
  slides: Slide[];
  kind: PresentationKind;
  htmlUrl: string | null; // storage OBJECT PATH, not a public URL — never hand to the client as-is
  slideMap: SlideMapEntry[];
  visibility: PresentationVisibility;
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

function isSlideMapArray(v: unknown): v is SlideMapEntry[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof (e as { slideId?: unknown }).slideId === "string" &&
        typeof (e as { label?: unknown }).label === "string",
    )
  );
}

function toRow(r: typeof presentations.$inferSelect): PresentationRow {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    slides: isSlideArray(r.slides) ? r.slides : [],
    kind: r.kind,
    htmlUrl: r.htmlUrl,
    slideMap: isSlideMapArray(r.slideMap) ? r.slideMap : [],
    visibility: r.visibility,
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

/** Alias of getPresentation — the name Phase 3 tool implementations import. */
export const getPresentationById = getPresentation;

/**
 * External: resolve a presentation by its share token.
 *
 * Requires BOTH shareEnabled=true AND visibility='public' — the two are an
 * AND-gate, not either/or. Without the visibility check here every deck that
 * ever had sharing turned on would stay publicly reachable regardless of the
 * new column's intent (see migration 20260722120000's backfill note).
 */
export async function getPresentationByShareToken(
  token: string,
): Promise<(PresentationRow & { workspaceId: string }) | null> {
  const [r] = await db
    .select()
    .from(presentations)
    .where(
      and(
        eq(presentations.shareToken, token),
        eq(presentations.shareEnabled, true),
        eq(presentations.visibility, "public"),
      ),
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

/**
 * Resolve (or unresolve) a comment by id, scoped to a workspace.
 *
 * Mirrors resolveCommentAction's WHERE exactly (commentId + workspaceId) —
 * presentation_comments.id is a random uuid, so the workspaceId filter is
 * the only thing preventing one workspace from resolving another
 * workspace's comment by guessing/enumerating ids (IDOR).
 */
export async function resolvePresentationComment(opts: {
  commentId: string;
  workspaceId: string;
  resolved?: boolean;
}): Promise<{ id: string; presentationId: string; resolvedAt: Date | null } | null> {
  const resolved = opts.resolved ?? true;
  const [row] = await db
    .update(presentationComments)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(
      and(
        eq(presentationComments.id, opts.commentId),
        eq(presentationComments.workspaceId, opts.workspaceId),
      ),
    )
    .returning({
      id: presentationComments.id,
      presentationId: presentationComments.presentationId,
      resolvedAt: presentationComments.resolvedAt,
    });
  return row ?? null;
}

export type DocumentSearchResult = {
  id: string;
  source: "presentation" | "project_link";
  /** presentation: 'structured'|'html'; project_link: 'note'|'link'|'file' */
  kind: string;
  title: string;
  subtitle: string | null;
  /** Only set for project_link kind='link'. Never a storage path. */
  url: string | null;
  /** Internal, login-gated route to open this item — never a raw signed/storage URL. */
  href: string;
  updatedAt: Date;
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Unified document search across presentations + project_links, both
 * strictly scoped to workspaceId. Never returns presentations.htmlUrl (a
 * Storage object path) — only id/title/kind/internal href.
 */
export async function searchDocuments(opts: {
  workspaceId: string;
  q: string;
  limit?: number;
}): Promise<DocumentSearchResult[]> {
  const term = opts.q.trim();
  if (!term) return [];
  const limit = opts.limit ?? 20;
  const pattern = `%${escapeLike(term)}%`;

  const [presentationRows, linkRows] = await Promise.all([
    db
      .select({
        id: presentations.id,
        title: presentations.title,
        subtitle: presentations.subtitle,
        kind: presentations.kind,
        updatedAt: presentations.updatedAt,
      })
      .from(presentations)
      .where(
        and(
          eq(presentations.workspaceId, opts.workspaceId),
          or(
            ilike(presentations.title, pattern),
            ilike(presentations.subtitle, pattern),
          ),
        ),
      )
      .orderBy(desc(presentations.updatedAt))
      .limit(limit),
    db
      .select({
        id: projectLinks.id,
        lobId: projectLinks.lobId,
        title: projectLinks.label,
        description: projectLinks.description,
        kind: projectLinks.kind,
        url: projectLinks.url,
        updatedAt: projectLinks.updatedAt,
        createdAt: projectLinks.createdAt,
      })
      .from(projectLinks)
      .where(
        and(
          eq(projectLinks.workspaceId, opts.workspaceId),
          or(
            ilike(projectLinks.label, pattern),
            ilike(projectLinks.description, pattern),
          ),
        ),
      )
      .orderBy(desc(projectLinks.createdAt))
      .limit(limit),
  ]);

  const results: DocumentSearchResult[] = [
    ...presentationRows.map((r) => ({
      id: r.id,
      source: "presentation" as const,
      kind: r.kind,
      title: r.title,
      subtitle: r.subtitle,
      url: null,
      href: `${SITE_URL}/presentations/${r.id}`,
      updatedAt: r.updatedAt,
    })),
    ...linkRows.map((r) => ({
      id: r.id,
      source: "project_link" as const,
      kind: r.kind,
      title: r.title,
      subtitle: r.description,
      url: r.kind === "link" ? r.url : null,
      href: `${SITE_URL}/projects/${r.lobId}`,
      updatedAt: r.updatedAt ?? r.createdAt,
    })),
  ];

  results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return results.slice(0, limit);
}
