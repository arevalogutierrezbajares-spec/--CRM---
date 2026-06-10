"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { initiatives, milestones } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import {
  buildCopyForAiPayload,
  diffRoadmap,
  generateRoadmapMd,
  parseRoadmapMd,
  type RoadmapDiff,
  type RoadmapInitiativeNode,
  type RoadmapTaskNode,
} from "@/lib/roadmap-md";
import {
  buildOwnerMaps,
  buildRoadmapSnapshot,
  createPlanVersion,
  getPlanVersion,
  nextPlanVersionNumber,
  resolveProjectForInitiative,
} from "@/db/queries/roadmap";

/* ─── Export (FR-RMD-1) + Copy for AI (FR-RMD-2) ──────────────────────── */

export async function exportRoadmap(): Promise<{ md: string; version: number }> {
  const user = await requireUser();
  const snapshot = await buildRoadmapSnapshot(user.workspaceId);
  const version = await nextPlanVersionNumber(user.workspaceId);
  const md = generateRoadmapMd(snapshot, { planVersion: version });
  await createPlanVersion({
    workspaceId: user.workspaceId,
    version,
    source: "export",
    snapshotMd: md,
    summary: { initiatives: snapshot.initiatives.length },
    createdBy: user.id,
  });
  return { md, version };
}

export async function getCopyForAiPayload(): Promise<{
  payload: string;
  version: number;
}> {
  const { md, version } = await exportRoadmap();
  return { payload: buildCopyForAiPayload(md), version };
}

/* ─── Import preview (FR-RMD-3..12 — read-only) ───────────────────────── */

export type ImportPreview = {
  ok: boolean;
  error?: string;
  diff?: RoadmapDiff;
  currentVersion?: number;
  /** FR-RMD-9: file base vs current; null base = no version header. */
  stale?: boolean;
};

export async function previewRoadmapImport(text: string): Promise<ImportPreview> {
  const user = await requireUser();
  if (!text || text.length > 1_000_000) {
    return { ok: false, error: "Paste a markdown document (max 1MB)." };
  }

  const parsed = parseRoadmapMd(text);
  const ownerMaps = await buildOwnerMaps(user.workspaceId);
  const current = await buildRoadmapSnapshot(user.workspaceId, ownerMaps);

  // 3-way base: the snapshot stored at the declared plan version (FR-RMD-7).
  let base = null;
  if (parsed.basePlanVersion !== null) {
    const baseRow = await getPlanVersion(user.workspaceId, parsed.basePlanVersion);
    if (baseRow) {
      const baseParsed = parseRoadmapMd(baseRow.snapshotMd);
      // Snapshot md round-trips: resolve its tokens to full ids for diffing.
      base = resolveTokensToIds(baseParsed.initiatives, current);
    }
  }

  const knownHandles = new Set(
    [...ownerMaps.userIdByHandle.keys()].map((h) => h.toLowerCase()),
  );
  const diff = diffRoadmap(parsed, current, base, knownHandles);
  const currentVersion = (await nextPlanVersionNumber(user.workspaceId)) - 1;
  return {
    ok: true,
    diff,
    currentVersion,
    stale:
      parsed.basePlanVersion !== null && parsed.basePlanVersion < currentVersion,
  };
}

/** The stored base snapshot carries tokens (it IS an export). Map them back to
 *  full ids using the current snapshot so the differ compares like with like. */
function resolveTokensToIds(
  baseInits: RoadmapInitiativeNode[],
  current: { initiatives: RoadmapInitiativeNode[] },
): { initiatives: RoadmapInitiativeNode[] } {
  const allCurrentIds: string[] = [];
  for (const ci of current.initiatives) {
    if (ci.id) allCurrentIds.push(ci.id);
    const walk = (ts: RoadmapTaskNode[]) => {
      for (const t of ts) {
        if (t.id) allCurrentIds.push(t.id);
        walk(t.children);
      }
    };
    walk(ci.tasks);
  }
  const byPrefix = (token: string | null) =>
    token
      ? (allCurrentIds.find((id) => id.replace(/-/g, "").startsWith(token)) ?? null)
      : null;

  const mapTask = (t: RoadmapTaskNode): RoadmapTaskNode => ({
    ...t,
    id: t.id ?? byPrefix(t.token),
    children: t.children.map(mapTask),
  });
  return {
    initiatives: baseInits.map((bi) => ({
      ...bi,
      id: bi.id ?? byPrefix(bi.token),
      tasks: bi.tasks.map(mapTask),
    })),
  };
}

/* ─── Import apply (FR-RMD-4/10, NFR-R2 transactional) ────────────────── */

const fieldChangeSchema = z.object({
  field: z.string(),
  to: z.union([z.string(), z.boolean(), z.null()]),
});

const taskNodeSchema: z.ZodType<{
  title: string;
  done: boolean;
  ownerHandle: string | null;
  dueDate: string | null;
  children: unknown[];
}> = z.object({
  title: z.string().min(1),
  done: z.boolean(),
  ownerHandle: z.string().nullable(),
  dueDate: z.string().nullable(),
  children: z.array(z.lazy(() => taskNodeSchema)),
});

const acceptedChangeSchema = z.object({
  kind: z.enum(["initiative", "task"]),
  changeType: z.enum(["create", "update", "probable-update", "archive"]),
  id: z.string().uuid().optional(),
  initiativeId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  title: z.string(),
  fields: z.array(fieldChangeSchema).optional(),
  node: z.unknown().optional(),
});

export type ApplyResult = {
  ok: boolean;
  error?: string;
  applied?: { creates: number; updates: number; archives: number };
  version?: number;
};

const VALID_STATUS = ["planning", "active", "paused", "done", "cancelled"] as const;
const VALID_HEALTH = ["green", "amber", "red"] as const;

export async function applyRoadmapImport(input: {
  accepted: unknown[];
}): Promise<ApplyResult> {
  const user = await requireUser();
  const parsed = z.array(acceptedChangeSchema).max(2000).safeParse(input.accepted);
  if (!parsed.success) return { ok: false, error: "Invalid change payload." };
  const accepted = parsed.data;

  const ownerMaps = await buildOwnerMaps(user.workspaceId);
  const ownerIdFor = (handle: string | null | undefined) =>
    handle ? (ownerMaps.userIdByHandle.get(handle.toLowerCase()) ?? null) : null;

  let creates = 0;
  let updates = 0;
  let archives = 0;

  try {
    await db.transaction(async (tx) => {
      const txDb = tx as unknown as typeof db;

      const insertTask = async (
        node: z.infer<typeof taskNodeSchema>,
        initiativeId: string,
        projectId: string,
        parentMilestoneId: string | null,
      ): Promise<void> => {
        const [row] = await txDb
          .insert(milestones)
          .values({
            workspaceId: user.workspaceId,
            projectId,
            initiativeId,
            parentMilestoneId,
            title: node.title,
            status: node.done ? "done" : "pending",
            completedAt: node.done ? new Date() : null,
            dueDate: node.dueDate,
            assigneeUserId: ownerIdFor(node.ownerHandle),
            createdBy: user.id,
          })
          .returning({ id: milestones.id });
        creates++;
        for (const child of node.children) {
          const c = taskNodeSchema.safeParse(child);
          if (c.success) await insertTask(c.data, initiativeId, projectId, row.id);
        }
      };

      for (const change of accepted) {
        /* ── Creates ── */
        if (change.changeType === "create" && change.kind === "initiative") {
          const nodeParsed = z
            .object({
              title: z.string().min(1),
              ownerHandle: z.string().nullable(),
              status: z.string().nullable(),
              health: z.string().nullable(),
              startDate: z.string().nullable(),
              targetEndDate: z.string().nullable(),
              successCriteria: z.string().nullable(),
              goal: z.string().nullable(),
              tasks: z.array(taskNodeSchema),
            })
            .safeParse(change.node);
          if (!nodeParsed.success) continue;
          const n = nodeParsed.data;
          const [init] = await txDb
            .insert(initiatives)
            .values({
              workspaceId: user.workspaceId,
              title: n.title,
              status: (VALID_STATUS as readonly string[]).includes(n.status ?? "")
                ? (n.status as (typeof VALID_STATUS)[number])
                : "planning",
              healthColor: (VALID_HEALTH as readonly string[]).includes(n.health ?? "")
                ? (n.health as (typeof VALID_HEALTH)[number])
                : "green",
              startDate: n.startDate,
              targetEndDate: n.targetEndDate,
              successCriteria: n.successCriteria,
              goal: n.goal,
              ownerUserId: ownerIdFor(n.ownerHandle) ?? user.id,
              createdBy: user.id,
            })
            .returning({ id: initiatives.id });
          creates++;
          if (n.tasks.length > 0) {
            const projectId = await resolveProjectForInitiative(
              { workspaceId: user.workspaceId, initiativeId: init.id, createdBy: user.id },
              txDb,
            );
            for (const t of n.tasks) await insertTask(t, init.id, projectId, null);
          }
          continue;
        }

        if (change.changeType === "create" && change.kind === "task") {
          if (!change.initiativeId) continue;
          const [owned] = await txDb
            .select({ id: initiatives.id })
            .from(initiatives)
            .where(
              and(
                eq(initiatives.id, change.initiativeId),
                eq(initiatives.workspaceId, user.workspaceId),
              ),
            )
            .limit(1);
          if (!owned) continue;
          const nodeParsed = taskNodeSchema.safeParse(change.node);
          if (!nodeParsed.success) continue;
          const projectId = await resolveProjectForInitiative(
            {
              workspaceId: user.workspaceId,
              initiativeId: change.initiativeId,
              createdBy: user.id,
            },
            txDb,
          );
          await insertTask(
            nodeParsed.data,
            change.initiativeId,
            projectId,
            change.parentTaskId ?? null,
          );
          continue;
        }

        /* ── Updates (incl. confirmed probable-updates) ── */
        if (
          (change.changeType === "update" || change.changeType === "probable-update") &&
          change.id &&
          change.fields
        ) {
          if (change.kind === "initiative") {
            const set: Record<string, unknown> = { updatedAt: new Date() };
            for (const f of change.fields) {
              if (f.field === "title" && typeof f.to === "string" && f.to) set.title = f.to;
              if (f.field === "ownerHandle")
                set.ownerUserId = ownerIdFor(f.to as string | null);
              if (
                f.field === "status" &&
                (VALID_STATUS as readonly string[]).includes(String(f.to))
              )
                set.status = f.to;
              if (
                f.field === "health" &&
                (VALID_HEALTH as readonly string[]).includes(String(f.to))
              )
                set.healthColor = f.to;
              if (f.field === "startDate") set.startDate = f.to;
              if (f.field === "targetEndDate") set.targetEndDate = f.to;
              if (f.field === "successCriteria") set.successCriteria = f.to;
              if (f.field === "goal") set.goal = f.to;
            }
            await txDb
              .update(initiatives)
              .set(set)
              .where(
                and(
                  eq(initiatives.id, change.id),
                  eq(initiatives.workspaceId, user.workspaceId),
                ),
              );
            updates++;
          } else {
            const set: Record<string, unknown> = {};
            for (const f of change.fields) {
              if (f.field === "title" && typeof f.to === "string" && f.to) set.title = f.to;
              if (f.field === "ownerHandle")
                set.assigneeUserId = ownerIdFor(f.to as string | null);
              if (f.field === "dueDate") set.dueDate = f.to;
              if (f.field === "done") {
                set.status = f.to === true ? "done" : "pending";
                set.completedAt = f.to === true ? new Date() : null;
              }
            }
            await txDb
              .update(milestones)
              .set(set)
              .where(
                and(
                  eq(milestones.id, change.id),
                  eq(milestones.workspaceId, user.workspaceId),
                ),
              );
            updates++;
          }
          continue;
        }

        /* ── Archives (FR-RMD-10 / OD-2: status machinery, no deletes) ── */
        if (change.changeType === "archive" && change.id) {
          if (change.kind === "initiative") {
            await txDb
              .update(initiatives)
              .set({ status: "cancelled", updatedAt: new Date() })
              .where(
                and(
                  eq(initiatives.id, change.id),
                  eq(initiatives.workspaceId, user.workspaceId),
                ),
              );
          } else {
            await txDb
              .update(milestones)
              .set({ status: "cancelled" })
              .where(
                and(
                  eq(milestones.id, change.id),
                  eq(milestones.workspaceId, user.workspaceId),
                ),
              );
          }
          archives++;
        }
      }
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Import failed — nothing was applied.",
    };
  }

  // Post-apply snapshot becomes the new plan version (FR-PLV-1).
  const snapshot = await buildRoadmapSnapshot(user.workspaceId);
  const version = await nextPlanVersionNumber(user.workspaceId);
  const md = generateRoadmapMd(snapshot, { planVersion: version });
  await createPlanVersion({
    workspaceId: user.workspaceId,
    version,
    source: "import",
    snapshotMd: md,
    summary: { creates, updates, archives },
    createdBy: user.id,
  });

  revalidatePath("/roadmap");
  revalidatePath("/initiatives");
  revalidatePath("/work");
  return { ok: true, applied: { creates, updates, archives }, version };
}

/* ─── Success criteria inline edit (FR-PRG-2, roadmap module only) ────── */

export async function updateInitiativeSuccessCriteria(
  id: string,
  successCriteria: string,
): Promise<void> {
  const user = await requireUser();
  await db
    .update(initiatives)
    .set({ successCriteria: successCriteria.trim() || null, updatedAt: new Date() })
    .where(and(eq(initiatives.id, id), eq(initiatives.workspaceId, user.workspaceId)));
  revalidatePath(`/initiatives/${id}`);
  revalidatePath("/roadmap");
}
