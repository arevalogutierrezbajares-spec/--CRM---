import "server-only";
import { and, eq, sql as rawSql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { ProjectLinkCategory } from "./lines-of-business";

export type ProjectDoc = {
  linkId: string;
  lobId: string;
  label: string;
  category: string;
  ydoc: string | null;
  text: string;
  updatedAt: Date | null;
};

/**
 * Create a doc: a project_links row (kind='doc') plus an empty content row,
 * in one transaction. sort_order lands at the bottom of its category. Writes
 * a 'create' audit row to match the rest of the links feature.
 */
export async function createProjectDoc(input: {
  workspaceId: string;
  lobId: string;
  actorId: string;
  label: string;
  category: ProjectLinkCategory;
}): Promise<{ linkId: string }> {
  return db.transaction(async (tx) => {
    const [{ nextOrder }] = await tx
      .select({
        nextOrder: rawSql<number>`COALESCE(MAX(${schema.projectLinks.sortOrder}), -1) + 1`,
      })
      .from(schema.projectLinks)
      .where(
        and(
          eq(schema.projectLinks.lobId, input.lobId),
          eq(schema.projectLinks.category, input.category),
        ),
      );

    const [row] = await tx
      .insert(schema.projectLinks)
      .values({
        workspaceId: input.workspaceId,
        lobId: input.lobId,
        kind: "doc",
        category: input.category,
        label: input.label,
        url: null,
        sortOrder: Number(nextOrder),
        createdBy: input.actorId,
      })
      .returning({ id: schema.projectLinks.id });

    await tx.insert(schema.projectDocContents).values({
      linkId: row.id,
      workspaceId: input.workspaceId,
      text: "",
      updatedBy: input.actorId,
    });

    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: row.id,
      actorId: input.actorId,
      action: "create",
      before: null,
      after: { kind: "doc", label: input.label, category: input.category },
    });

    return { linkId: row.id };
  });
}

/** Load a doc's content + its link metadata, scoped to the workspace. */
export async function getProjectDoc(opts: {
  linkId: string;
  workspaceId: string;
}): Promise<ProjectDoc | null> {
  const [row] = await db
    .select({
      linkId: schema.projectLinks.id,
      lobId: schema.projectLinks.lobId,
      label: schema.projectLinks.label,
      category: schema.projectLinks.category,
      kind: schema.projectLinks.kind,
      ydoc: schema.projectDocContents.ydoc,
      text: schema.projectDocContents.text,
      updatedAt: schema.projectDocContents.updatedAt,
    })
    .from(schema.projectLinks)
    .leftJoin(
      schema.projectDocContents,
      eq(schema.projectDocContents.linkId, schema.projectLinks.id),
    )
    .where(
      and(
        eq(schema.projectLinks.id, opts.linkId),
        eq(schema.projectLinks.workspaceId, opts.workspaceId),
        eq(schema.projectLinks.kind, "doc"),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    linkId: row.linkId,
    lobId: row.lobId,
    label: row.label,
    category: row.category,
    ydoc: row.ydoc ?? null,
    text: row.text ?? "",
    updatedAt: row.updatedAt ?? null,
  };
}

/**
 * Persist the latest Yjs state (base64) + markdown mirror. Upserts the content
 * row so it is robust even if the initial empty row was somehow missing.
 */
export async function saveProjectDocContent(input: {
  linkId: string;
  workspaceId: string;
  actorId: string;
  ydoc: string;
  text: string;
}): Promise<void> {
  await db
    .insert(schema.projectDocContents)
    .values({
      linkId: input.linkId,
      workspaceId: input.workspaceId,
      ydoc: input.ydoc,
      text: input.text,
      updatedAt: new Date(),
      updatedBy: input.actorId,
    })
    .onConflictDoUpdate({
      target: schema.projectDocContents.linkId,
      set: {
        ydoc: input.ydoc,
        text: input.text,
        updatedAt: new Date(),
        updatedBy: input.actorId,
      },
    });
}
