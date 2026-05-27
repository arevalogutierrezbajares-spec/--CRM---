/**
 * Overlord sync: read TOURISM repo's section-XYZ/TASKS.md files and upsert into
 * overlord_sections + overlord_tasks. One-way mirror — never writes back.
 *
 * Default repo root is /Users/tomas/--TOURISM--; override with OVERLORD_REPO_PATH.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  parseOverlordTasksFile,
  type ParsedOverlordTask,
} from "@/lib/overlord-parser";

const { overlordSections, overlordTasks } = schema;

const DEFAULT_REPO =
  process.env.OVERLORD_REPO_PATH ?? "/Users/tomas/--TOURISM--";
const SECTIONS_ROOT = "005- WIKI/operation-overlord";

function sectionDisplayName(key: string): string {
  return key
    .split("-")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

export type SyncResult = {
  sectionsScanned: number;
  tasksSeen: number;
  tasksInserted: number;
  tasksUpdated: number;
  tasksDeletedStale: number;
  errors: string[];
  scannedAt: string;
};

/** Discover all section directories that contain a TASKS.md file. */
async function discoverSectionFiles(): Promise<
  Array<{ sectionKey: string; filePath: string }>
> {
  const root = path.join(DEFAULT_REPO, SECTIONS_ROOT);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch (e) {
    throw new Error(
      `Cannot read Overlord root at ${root}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const out: Array<{ sectionKey: string; filePath: string }> = [];
  for (const entry of entries) {
    if (!entry.startsWith("section-")) continue;
    const sectionKey = entry.replace(/^section-/, "");
    const tasksPath = path.join(root, entry, "TASKS.md");
    try {
      await fs.access(tasksPath);
      out.push({ sectionKey, filePath: tasksPath });
    } catch {
      // section dir without TASKS.md (skip)
    }
  }
  return out.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
}

/** Sync Overlord into the mirror tables for a given workspace. */
export async function syncOverlord(workspaceId: string): Promise<SyncResult> {
  const result: SyncResult = {
    sectionsScanned: 0,
    tasksSeen: 0,
    tasksInserted: 0,
    tasksUpdated: 0,
    tasksDeletedStale: 0,
    errors: [],
    scannedAt: new Date().toISOString(),
  };

  let files: Awaited<ReturnType<typeof discoverSectionFiles>>;
  try {
    files = await discoverSectionFiles();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }
  result.sectionsScanned = files.length;

  const now = new Date();

  // ─── Upsert sections ──────────────────────────────────────────────
  const sectionIdByKey = new Map<string, string>();
  for (const f of files) {
    const [existing] = await db
      .select()
      .from(overlordSections)
      .where(
        and(
          eq(overlordSections.workspaceId, workspaceId),
          eq(overlordSections.sectionKey, f.sectionKey),
        ),
      )
      .limit(1);
    if (existing) {
      sectionIdByKey.set(f.sectionKey, existing.id);
      await db
        .update(overlordSections)
        .set({ filePath: f.filePath, lastSyncedAt: now })
        .where(eq(overlordSections.id, existing.id));
    } else {
      const [inserted] = await db
        .insert(overlordSections)
        .values({
          workspaceId,
          sectionKey: f.sectionKey,
          name: sectionDisplayName(f.sectionKey),
          filePath: f.filePath,
          lastSyncedAt: now,
        })
        .returning({ id: overlordSections.id });
      sectionIdByKey.set(f.sectionKey, inserted.id);
    }
  }

  // ─── Parse + upsert tasks per section ─────────────────────────────
  const allTaskKeysSeen = new Set<string>();

  for (const f of files) {
    const sectionId = sectionIdByKey.get(f.sectionKey)!;
    let content: string;
    try {
      content = await fs.readFile(f.filePath, "utf8");
    } catch (e) {
      result.errors.push(
        `Failed reading ${f.filePath}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    let tasks: ParsedOverlordTask[];
    try {
      tasks = parseOverlordTasksFile(content);
    } catch (e) {
      result.errors.push(
        `Failed parsing ${f.sectionKey}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    result.tasksSeen += tasks.length;

    if (tasks.length === 0) continue;

    // Fetch existing keys in this section for diff
    const taskKeys = tasks.map((t) => t.taskKey);
    const existing = await db
      .select({ taskKey: overlordTasks.taskKey })
      .from(overlordTasks)
      .where(
        and(
          eq(overlordTasks.workspaceId, workspaceId),
          inArray(overlordTasks.taskKey, taskKeys),
        ),
      );
    const existingKeys = new Set(existing.map((e) => e.taskKey));

    for (const t of tasks) {
      allTaskKeysSeen.add(t.taskKey);
      const baseValues = {
        workspaceId,
        sectionId,
        taskKey: t.taskKey,
        title: t.title,
        status: t.status as
          | "todo"
          | "in_progress"
          | "in_review"
          | "blocked"
          | "completed"
          | "cancelled",
        priority: (t.priority ?? null) as
          | "NOW"
          | "NEXT"
          | "LATER"
          | "BACKLOG"
          | null,
        taskType: t.taskType,
        claimedByAgent: t.claimedByAgent,
        claimedAt: t.claimedAt ? new Date(t.claimedAt) : null,
        completedByAgent: t.completedByAgent,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        recommendedModel: t.recommendedModel,
        estTokens: t.estTokens,
        complexity: t.complexity,
        risk: t.risk,
        parallelSafe: t.parallelSafe,
        dependsOn: t.dependsOn,
        scopePaths: t.scopePaths,
        branch: t.branch,
        lastHeartbeat: t.lastHeartbeat ? new Date(t.lastHeartbeat) : null,
        createdDate: t.createdDate,
        lastModifiedDate: t.lastModifiedDate,
        description: t.description,
        acceptanceCriteria: t.acceptanceCriteria,
        activityLog: t.activityLog,
        rawMarkdown: t.rawMarkdown,
        lastSyncedAt: now,
      };

      if (existingKeys.has(t.taskKey)) {
        await db
          .update(overlordTasks)
          .set(baseValues)
          .where(
            and(
              eq(overlordTasks.workspaceId, workspaceId),
              eq(overlordTasks.taskKey, t.taskKey),
            ),
          );
        result.tasksUpdated += 1;
      } else {
        await db.insert(overlordTasks).values(baseValues);
        result.tasksInserted += 1;
      }
    }
  }

  // ─── Prune stale rows (not seen this sync) ────────────────────────
  if (allTaskKeysSeen.size > 0) {
    const deleted = await db
      .delete(overlordTasks)
      .where(
        and(
          eq(overlordTasks.workspaceId, workspaceId),
          sql`${overlordTasks.lastSyncedAt} < ${now.toISOString()}`,
        ),
      )
      .returning({ id: overlordTasks.id });
    result.tasksDeletedStale = deleted.length;
  }

  return result;
}
