import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { BRAIN_ROOTS } from "@/lib/brain-roots";
import { classifyNote } from "@/lib/note-classifier";

const { researchNotes, projects } = schema;

/**
 * Trigger an on-demand sync from the API. Mirrors scripts/sync-research-brains.mjs
 * but lives in-app so a button on /research can call it without spawning Node.
 */

const SKIP_DIRS = new Set([".obsidian", ".git", "node_modules", "_local-backup-before-merge", ".trash"]);

const FOLDER_TO_PROJECT_BY_ROOT: Record<string, Record<string, string>> = {
  "vz-docs": {
    "Posada-PMS": "CaneyCloud",
    "RUTA-Platform": "RUTA — Secure Transport Venezuela",
    "VZ-Platform": "VAV — Vamos a Venezuela",
    "Enhancements VZ": "VAV — Vamos a Venezuela",
  },
  "VZ_Tourism_Project/docs": {
    "caco-brain": "Cosecha",
    "land-intel": "MIRO Intelligence",
    research: "MIRO Intelligence",
    "VAV-Commission-Hardening": "VAV — Vamos a Venezuela",
    "pms-integration": "Stays",
    "OTA - PMS": "Stays",
    "Posada-PMS": "Stays",
  },
};
const DEFAULT_BY_ROOT: Record<string, string> = {
  "vz-docs": "VAV — Vamos a Venezuela",
  "VZ_Tourism_Project/docs": "VAV — Vamos a Venezuela",
};

async function walkMd(root: string, prefix = ""): Promise<Array<{ full: string; rel: string }>> {
  let out: Array<{ full: string; rel: string }> = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".obsidian") continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(root, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out = out.concat(await walkMd(full, rel));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      out.push({ full, rel });
    }
  }
  return out;
}

function extractTitle(content: string, fallback: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return fallback;
}
function extractSummary(content: string): string | null {
  const noFm = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const paras = noFm.split(/\n\n+/);
  for (const p of paras) {
    const cleaned = p.replace(/^#+\s+.*$/m, "").trim();
    if (cleaned && cleaned.length > 30) {
      const flat = cleaned.replace(/\s+/g, " ").trim();
      return flat.length > 300 ? `${flat.slice(0, 297)}…` : flat;
    }
  }
  return null;
}
function extractTags(content: string): string[] {
  const tags = new Set<string>();
  for (const m of content.matchAll(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{2,})/g)) {
    tags.add(m[1]);
  }
  return Array.from(tags).slice(0, 20);
}
function wordCount(content: string): number {
  return content.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve project IDs by title
  const allProjects = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.workspaceId, user.workspaceId));
  const titleToId = new Map(allProjects.map((p) => [p.title, p.id]));

  const result = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    pruned: 0,
    errors: [] as string[],
  };
  const seenIds = new Set<string>();

  for (const [rootKey, rootPath] of Object.entries(BRAIN_ROOTS)) {
    let files: Array<{ full: string; rel: string }>;
    try {
      files = await walkMd(rootPath);
    } catch (e) {
      result.errors.push(`${rootKey}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const { full, rel } of files) {
      result.scanned++;
      const content = await fs.readFile(full, "utf8");
      const stat = await fs.stat(full);
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      const topFolder = rel.includes("/") ? rel.split("/")[0] : null;
      const folderMap = FOLDER_TO_PROJECT_BY_ROOT[rootKey] ?? {};
      const projectTitle =
        topFolder && folderMap[topFolder] !== undefined
          ? folderMap[topFolder]
          : DEFAULT_BY_ROOT[rootKey];
      const projectId = projectTitle ? titleToId.get(projectTitle) ?? null : null;

      const fallback = path.basename(rel, ".md").replace(/[-_]/g, " ");
      const title = extractTitle(content, fallback);
      const summary = extractSummary(content);
      const tags = extractTags(content);
      const wc = wordCount(content);
      const kind = classifyNote(rel);

      const existing = await db
        .select({
          id: researchNotes.id,
          contentHash: researchNotes.contentHash,
        })
        .from(researchNotes)
        .where(
          and(
            eq(researchNotes.workspaceId, user.workspaceId),
            eq(researchNotes.sourceRoot, rootKey),
            eq(researchNotes.relPath, rel),
          ),
        )
        .limit(1);

      if (existing[0]) {
        seenIds.add(existing[0].id);
        if (existing[0].contentHash === hash) {
          result.unchanged++;
          continue;
        }
        await db
          .update(researchNotes)
          .set({
            projectId,
            title,
            summary,
            folder: topFolder,
            kind,
            wordCount: wc,
            tags,
            lastModified: stat.mtime,
            contentHash: hash,
            indexedAt: new Date(),
          })
          .where(eq(researchNotes.id, existing[0].id));
        result.updated++;
      } else {
        const [row] = await db
          .insert(researchNotes)
          .values({
            workspaceId: user.workspaceId,
            projectId,
            sourceRoot: rootKey,
            relPath: rel,
            title,
            summary,
            folder: topFolder,
            kind,
            wordCount: wc,
            tags,
            lastModified: stat.mtime,
            contentHash: hash,
          })
          .returning({ id: researchNotes.id });
        seenIds.add(row.id);
        result.inserted++;
      }
    }
  }

  // Prune stale
  const all = await db
    .select({ id: researchNotes.id })
    .from(researchNotes)
    .where(eq(researchNotes.workspaceId, user.workspaceId));
  for (const r of all) {
    if (!seenIds.has(r.id)) {
      await db.delete(researchNotes).where(eq(researchNotes.id, r.id));
      result.pruned++;
    }
  }

  return NextResponse.json(result);
}
