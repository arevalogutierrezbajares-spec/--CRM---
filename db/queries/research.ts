import { and, desc, eq, ilike, or, sql as rawSql } from "drizzle-orm";
import { db, schema } from "@/db";

const { researchNotes, projects } = schema;

export type ResearchNote = typeof researchNotes.$inferSelect;
export type ResearchNoteListItem = ResearchNote & {
  projectTitle: string | null;
  projectColor: string | null;
};

export async function listResearchNotes(opts: {
  workspaceId: string;
  query?: string;
  projectId?: string;
  sourceRoot?: string;
  folder?: string;
  limit?: number;
}): Promise<ResearchNoteListItem[]> {
  const conditions = [eq(researchNotes.workspaceId, opts.workspaceId)];
  if (opts.projectId)
    conditions.push(eq(researchNotes.projectId, opts.projectId));
  if (opts.sourceRoot)
    conditions.push(eq(researchNotes.sourceRoot, opts.sourceRoot));
  if (opts.folder) conditions.push(eq(researchNotes.folder, opts.folder));
  if (opts.query) {
    const q = `%${opts.query}%`;
    conditions.push(
      or(
        ilike(researchNotes.title, q),
        ilike(researchNotes.summary, q),
        ilike(researchNotes.relPath, q),
      )!,
    );
  }

  const rows = await db
    .select({
      note: researchNotes,
      projectTitle: projects.title,
      projectColor: projects.coverColor,
    })
    .from(researchNotes)
    .leftJoin(projects, eq(projects.id, researchNotes.projectId))
    .where(and(...conditions))
    .orderBy(desc(researchNotes.lastModified))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    ...r.note,
    projectTitle: r.projectTitle,
    projectColor: r.projectColor,
  }));
}

export async function getResearchNoteById(opts: {
  id: string;
  workspaceId: string;
}): Promise<ResearchNoteListItem | null> {
  const [row] = await db
    .select({
      note: researchNotes,
      projectTitle: projects.title,
      projectColor: projects.coverColor,
    })
    .from(researchNotes)
    .leftJoin(projects, eq(projects.id, researchNotes.projectId))
    .where(
      and(
        eq(researchNotes.id, opts.id),
        eq(researchNotes.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row.note,
    projectTitle: row.projectTitle,
    projectColor: row.projectColor,
  };
}

export type ResearchCounts = {
  total: number;
  byFolder: Array<{ folder: string; count: number; sourceRoot: string }>;
  bySource: Array<{ sourceRoot: string; count: number }>;
  byProject: Array<{ projectId: string; count: number }>;
  newest: Date | null;
};

export async function researchCounts(
  workspaceId: string,
): Promise<ResearchCounts> {
  const rows = await db
    .select({
      sourceRoot: researchNotes.sourceRoot,
      folder: researchNotes.folder,
      projectId: researchNotes.projectId,
      lastModified: researchNotes.lastModified,
    })
    .from(researchNotes)
    .where(eq(researchNotes.workspaceId, workspaceId));

  const folderMap = new Map<string, { sourceRoot: string; count: number }>();
  const sourceMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  let newest: Date | null = null;
  for (const r of rows) {
    if (r.folder) {
      const key = `${r.sourceRoot}|${r.folder}`;
      const existing = folderMap.get(key);
      if (existing) existing.count += 1;
      else folderMap.set(key, { sourceRoot: r.sourceRoot, count: 1 });
    }
    sourceMap.set(r.sourceRoot, (sourceMap.get(r.sourceRoot) ?? 0) + 1);
    if (r.projectId) {
      projectMap.set(r.projectId, (projectMap.get(r.projectId) ?? 0) + 1);
    }
    if (r.lastModified && (newest === null || r.lastModified > newest)) {
      newest = r.lastModified;
    }
  }

  return {
    total: rows.length,
    byFolder: Array.from(folderMap.entries())
      .map(([key, v]) => ({
        folder: key.split("|")[1],
        count: v.count,
        sourceRoot: v.sourceRoot,
      }))
      .sort((a, b) => b.count - a.count),
    bySource: Array.from(sourceMap.entries())
      .map(([sourceRoot, count]) => ({ sourceRoot, count }))
      .sort((a, b) => b.count - a.count),
    byProject: Array.from(projectMap.entries())
      .map(([projectId, count]) => ({ projectId, count }))
      .sort((a, b) => b.count - a.count),
    newest,
  };
}
