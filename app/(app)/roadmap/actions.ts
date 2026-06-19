"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  actionItemInitiatives,
  actionItems,
  functions,
  initiativeDependencies,
  initiativePeople,
  initiatives,
  linesOfBusiness,
  milestones,
  workspaceMembers,
} from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import {
  buildCopyForAiPayload,
  diffRoadmap,
  generateRoadmapMd,
  parseRoadmapMd,
  resolveSnapshotTokens,
  type RoadmapDiff,
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
      base = resolveSnapshotTokens(baseParsed.initiatives, current);
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

/* ─── Inline plan editing (FR-RVW-1, roadmap module only per INV-7) ───── */

const initiativePatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    status: z.enum(["planning", "active", "paused", "done", "cancelled"]).optional(),
    healthColor: z.enum(["green", "amber", "red"]).optional(),
    startDate: z.string().nullable().optional(),
    targetEndDate: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
    successCriteria: z.string().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    lobId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function updateInitiativeFields(
  id: string,
  patch: z.infer<typeof initiativePatchSchema>,
  quiet = false,
): Promise<void> {
  const user = await requireUser();
  const parsed = initiativePatchSchema.safeParse(patch);
  if (!parsed.success) throw new Error("Invalid initiative patch");
  const set: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "done")
    set.actualEndDate = new Date().toISOString().slice(0, 10);
  await db
    .update(initiatives)
    .set(set)
    .where(and(eq(initiatives.id, id), eq(initiatives.workspaceId, user.workspaceId)));
  // FR-E5: people are NO LONGER derived from title @tokens. The title is plain
  // prose; assignments are written directly to initiative_people by the
  // assignment control (setInitiativePeople / add / remove below). So a title
  // save must not touch the people index.
  if (quiet) return; // editor refreshes coarsely on its own (router.refresh)
  revalidatePath("/roadmap");
  revalidatePath("/initiatives");
  revalidatePath(`/initiatives/${id}`);
}

const taskPatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    dueDate: z.string().nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function updateRoadmapTask(
  id: string,
  patch: z.infer<typeof taskPatchSchema>,
  quiet = false,
): Promise<void> {
  const user = await requireUser();
  const parsed = taskPatchSchema.safeParse(patch);
  if (!parsed.success) throw new Error("Invalid task patch");
  await db
    .update(milestones)
    .set(parsed.data)
    .where(and(eq(milestones.id, id), eq(milestones.workspaceId, user.workspaceId)));
  if (quiet) return; // editor refreshes coarsely on its own (router.refresh)
  revalidatePath("/roadmap");
  revalidatePath("/work");
}

/** FR-UNI-1 made tangible: the same row the home box checks off. */
export async function toggleRoadmapTask(
  id: string,
  done: boolean,
  quiet = false,
): Promise<void> {
  const user = await requireUser();
  await db
    .update(milestones)
    .set({
      status: done ? "done" : "pending",
      completedAt: done ? new Date() : null,
    })
    .where(and(eq(milestones.id, id), eq(milestones.workspaceId, user.workspaceId)));
  if (quiet) return;
  revalidatePath("/roadmap");
  revalidatePath("/work");
  revalidatePath("/");
}

/* ─── Roadmap product-line tag (caney | vav | all | null) ─────────────── */

const PROJECTS = ["caney", "vav", "all"] as const;
type ProjectTag = (typeof PROJECTS)[number] | null;
const normProject = (p: string | null): ProjectTag =>
  p && (PROJECTS as readonly string[]).includes(p) ? (p as ProjectTag) : null;

/** Set (or clear) the product-line tag on one or more deliverables. */
export async function setRoadmapTaskProject(
  ids: string[],
  project: string | null,
  quiet = false,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return { ok: true };
  await db
    .update(milestones)
    .set({ project: normProject(project) })
    .where(and(inArray(milestones.id, clean), eq(milestones.workspaceId, user.workspaceId)));
  if (!quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/work");
  }
  return { ok: true };
}

/** Copy/paste: duplicate task subtrees (deliverables + their descendants) as
 *  siblings after `anchorId` — same initiative + parent, structure preserved. */
export async function duplicateRoadmapTasks(
  rootIds: string[],
  anchorId: string,
  quiet = false,
): Promise<{ ok: boolean; error?: string; newRootIds?: string[] }> {
  const user = await requireUser();
  const roots = rootIds.filter(Boolean);
  if (roots.length === 0) return { ok: true, newRootIds: [] };

  const [anchor] = await db
    .select({
      initiativeId: milestones.initiativeId,
      parentMilestoneId: milestones.parentMilestoneId,
      projectId: milestones.projectId,
    })
    .from(milestones)
    .where(and(eq(milestones.id, anchorId), eq(milestones.workspaceId, user.workspaceId)))
    .limit(1);
  if (!anchor || !anchor.initiativeId) return { ok: false, error: "Paste target not found" };

  const newRootIds: string[] = [];
  try {
    await db.transaction(async (tx) => {
      const t = tx as unknown as typeof db;
      const all = await t
        .select()
        .from(milestones)
        .where(eq(milestones.workspaceId, user.workspaceId));
      const byId = new Map(all.map((m) => [m.id, m]));
      const childrenOf = new Map<string, string[]>();
      for (const m of all) {
        if (m.parentMilestoneId) {
          const a = childrenOf.get(m.parentMilestoneId) ?? [];
          a.push(m.id);
          childrenOf.set(m.parentMilestoneId, a);
        }
      }
      // order siblings of children by their `order`
      const sortKids = (kids: string[]) =>
        kids.sort((a, b) => (byId.get(a)!.order ?? 0) - (byId.get(b)!.order ?? 0));

      // next order at the anchor's sibling group
      let nextOrder =
        Math.max(
          0,
          ...all
            .filter(
              (m) =>
                m.initiativeId === anchor.initiativeId &&
                (m.parentMilestoneId ?? null) === (anchor.parentMilestoneId ?? null),
            )
            .map((m) => m.order ?? 0),
        ) + 1;

      const cloneSubtree = async (
        srcId: string,
        parentMilestoneId: string | null,
        order: number,
      ): Promise<string | null> => {
        const src = byId.get(srcId);
        if (!src) return null;
        const [row] = await t
          .insert(milestones)
          .values({
            workspaceId: user.workspaceId,
            projectId: anchor.projectId,
            initiativeId: anchor.initiativeId,
            parentMilestoneId,
            title: src.title,
            description: src.description,
            dueDate: src.dueDate,
            project: src.project,
            order,
            createdBy: user.id,
          })
          .returning({ id: milestones.id });
        const kids = sortKids([...(childrenOf.get(srcId) ?? [])]);
        for (let k = 0; k < kids.length; k++) await cloneSubtree(kids[k], row.id, k);
        return row.id;
      };

      for (const r of roots) {
        const id = await cloneSubtree(r, anchor.parentMilestoneId ?? null, nextOrder++);
        if (id) newRootIds.push(id);
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Paste failed" };
  }

  if (!quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/work");
  }
  return { ok: true, newRootIds };
}

export async function createRoadmapTask(opts: {
  initiativeId: string;
  title: string;
  parentTaskId?: string | null;
  dueDate?: string | null;
  quiet?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireUser();
  const title = (opts.title ?? "").trim() || "New deliverable";
  const [owned] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, opts.initiativeId),
        eq(initiatives.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Initiative not found" };
  const projectId = await resolveProjectForInitiative({
    workspaceId: user.workspaceId,
    initiativeId: opts.initiativeId,
    createdBy: user.id,
  });
  const [row] = await db
    .insert(milestones)
    .values({
      workspaceId: user.workspaceId,
      projectId,
      initiativeId: opts.initiativeId,
      parentMilestoneId: opts.parentTaskId ?? null,
      title,
      dueDate: opts.dueDate ?? null,
      createdBy: user.id,
    })
    .returning({ id: milestones.id });
  if (!opts.quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/work");
  }
  return { ok: true, id: row.id };
}

/* ─── Planning session (FR-PLN-1/2/3/4) ───────────────────────────────── */

export async function commitPlan(note: string): Promise<{ version: number }> {
  const user = await requireUser();
  const snapshot = await buildRoadmapSnapshot(user.workspaceId);
  const version = await nextPlanVersionNumber(user.workspaceId);
  const md = generateRoadmapMd(snapshot, { planVersion: version });
  await createPlanVersion({
    workspaceId: user.workspaceId,
    version,
    source: "commit",
    snapshotMd: md,
    note: note.trim() || null,
    summary: { initiatives: snapshot.initiatives.length },
    createdBy: user.id,
  });
  revalidatePath("/roadmap");
  revalidatePath("/roadmap/plan");
  revalidatePath("/roadmap/plans");
  return { version };
}

export async function linkActionItemToInitiative(
  actionItemId: string,
  initiativeId: string,
): Promise<void> {
  const user = await requireUser();
  const [item] = await db
    .select({ id: actionItems.id })
    .from(actionItems)
    .where(
      and(eq(actionItems.id, actionItemId), eq(actionItems.workspaceId, user.workspaceId)),
    )
    .limit(1);
  const [init] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(
      and(eq(initiatives.id, initiativeId), eq(initiatives.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!item || !init) throw new Error("Not found");
  await db
    .insert(actionItemInitiatives)
    .values({ actionItemId, initiativeId })
    .onConflictDoNothing();
  revalidatePath("/roadmap/plan");
}

/** FR-AIT-3: promote — new task carries the item's fields; the action item
 *  closes with two-way provenance. */
export async function promoteActionItem(
  actionItemId: string,
  initiativeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const [item] = await db
    .select()
    .from(actionItems)
    .where(
      and(eq(actionItems.id, actionItemId), eq(actionItems.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!item) return { ok: false, error: "Action item not found" };
  const [init] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(
      and(eq(initiatives.id, initiativeId), eq(initiatives.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!init) return { ok: false, error: "Initiative not found" };

  const projectId = await resolveProjectForInitiative({
    workspaceId: user.workspaceId,
    initiativeId,
    createdBy: user.id,
  });
  const [task] = await db
    .insert(milestones)
    .values({
      workspaceId: user.workspaceId,
      projectId,
      initiativeId,
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      assigneeUserId: item.assigneeUserId,
      createdBy: user.id,
    })
    .returning({ id: milestones.id });
  await db
    .update(actionItems)
    .set({ status: "done", completedAt: new Date(), milestoneId: task.id })
    .where(eq(actionItems.id, actionItemId));

  revalidatePath("/roadmap");
  revalidatePath("/roadmap/plan");
  revalidatePath("/work");
  return { ok: true };
}

/** FR-PLN-2 dismiss: stays an ordinary open action item, leaves the queue. */
export async function dismissActionItemFromPlanning(actionItemId: string): Promise<void> {
  const user = await requireUser();
  await db
    .update(actionItems)
    .set({ planReviewedAt: new Date() })
    .where(
      and(eq(actionItems.id, actionItemId), eq(actionItems.workspaceId, user.workspaceId)),
    );
  revalidatePath("/roadmap/plan");
}

/** FR-PLN-4: three buttons, optional note, never blocks completion. */
export async function recordSuccessOutcome(
  initiativeId: string,
  outcome: "met" | "partial" | "missed",
  note?: string,
): Promise<void> {
  const user = await requireUser();
  await db
    .update(initiatives)
    .set({
      successOutcome: outcome,
      successOutcomeNote: note?.trim() || null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(initiatives.id, initiativeId), eq(initiatives.workspaceId, user.workspaceId)),
    );
  revalidatePath("/roadmap/plan");
  revalidatePath(`/initiatives/${initiativeId}`);
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

/* ─── Initiative dependencies (roadmap) ───────────────────────────────── */

/** Link a dependency: `to` depends on `from` (from is the predecessor).
 *  Rejects self-links and anything that would create a cycle. */
export async function addInitiativeDependency(
  fromId: string,
  toId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (fromId === toId) return { ok: false, error: "An initiative can't depend on itself" };

  const owned = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(
      and(
        inArray(initiatives.id, [fromId, toId]),
        eq(initiatives.workspaceId, user.workspaceId),
      ),
    );
  if (owned.length !== 2) return { ok: false, error: "Initiative not found" };

  // Cycle guard: a new edge from→to closes a cycle iff `from` is already
  // reachable from `to` along existing from→to edges.
  const deps = await db
    .select({
      f: initiativeDependencies.fromInitiativeId,
      t: initiativeDependencies.toInitiativeId,
    })
    .from(initiativeDependencies)
    .where(eq(initiativeDependencies.workspaceId, user.workspaceId));
  const adj = new Map<string, string[]>();
  for (const d of deps) {
    const arr = adj.get(d.f) ?? [];
    arr.push(d.t);
    adj.set(d.f, arr);
  }
  const seen = new Set<string>();
  const queue = [toId];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === fromId) return { ok: false, error: "That would create a circular dependency" };
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adj.get(n) ?? []) queue.push(m);
  }

  await db
    .insert(initiativeDependencies)
    .values({
      workspaceId: user.workspaceId,
      fromInitiativeId: fromId,
      toInitiativeId: toId,
      createdBy: user.id,
    })
    .onConflictDoNothing();
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function removeInitiativeDependency(id: string): Promise<void> {
  const user = await requireUser();
  await db
    .delete(initiativeDependencies)
    .where(
      and(
        eq(initiativeDependencies.id, id),
        eq(initiativeDependencies.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/roadmap");
}

/* ─── Initiative people (FR-E5: assignment control, not title tokens) ──── */

/** Verify the initiative belongs to the caller's workspace. */
async function ownInitiative(workspaceId: string, initiativeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(and(eq(initiatives.id, initiativeId), eq(initiatives.workspaceId, workspaceId)));
  return rows.length > 0;
}

/** Workspace member ids (for validating + the "Everyone" expansion). */
async function workspaceMemberIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows.map((r) => r.userId);
}

type PeopleResult = { ok: boolean; error?: string };

/** Replace an initiative's assigned people with exactly `userIds` (the source of
 *  truth — title tokens no longer participate). Invalid / non-member ids are
 *  dropped. Pass the full member set for the "Everyone" convention. */
export async function setInitiativePeople(
  initiativeId: string,
  userIds: string[],
  quiet = false,
): Promise<PeopleResult> {
  const user = await requireUser();
  if (!(await ownInitiative(user.workspaceId, initiativeId)))
    return { ok: false, error: "Initiative not found" };
  const valid = new Set(await workspaceMemberIds(user.workspaceId));
  const wanted = Array.from(new Set(userIds)).filter((id) => valid.has(id));
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await t.delete(initiativePeople).where(eq(initiativePeople.initiativeId, initiativeId));
    if (wanted.length)
      await t
        .insert(initiativePeople)
        .values(wanted.map((userId) => ({ initiativeId, userId })))
        .onConflictDoNothing();
  });
  if (!quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/initiatives");
  }
  return { ok: true };
}


/* ─── Functions (FR-E6: the horizontal axis) ──────────────────────────── */

function slugifyFn(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "fn"
  );
}

/** The reserved no-orphan bucket; created on demand if the seed missed it. */
async function uncategorizedFunctionId(workspaceId: string): Promise<string | null> {
  const found = await db
    .select({ id: functions.id })
    .from(functions)
    .where(and(eq(functions.workspaceId, workspaceId), eq(functions.slug, "uncategorized")));
  if (found[0]) return found[0].id;
  await db
    .insert(functions)
    .values({ workspaceId, name: "Uncategorized", slug: "uncategorized", sortOrder: 99 })
    .onConflictDoNothing();
  const again = await db
    .select({ id: functions.id })
    .from(functions)
    .where(and(eq(functions.workspaceId, workspaceId), eq(functions.slug, "uncategorized")));
  return again[0]?.id ?? null;
}

/** Create a new function (horizontal). Slug is derived + de-duped per workspace. */
export async function createFunction(
  name: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireUser();
  const n = name.trim();
  if (!n) return { ok: false, error: "Name required" };
  const existing = await db
    .select({ slug: functions.slug, sortOrder: functions.sortOrder })
    .from(functions)
    .where(eq(functions.workspaceId, user.workspaceId));
  const slugs = new Set(existing.map((e) => e.slug));
  let slug = slugifyFn(n);
  if (slugs.has(slug)) {
    let i = 2;
    while (slugs.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }
  // Keep the reserved Uncategorized (99) last.
  const maxReal = existing.filter((e) => e.slug !== "uncategorized").reduce((m, e) => Math.max(m, e.sortOrder), -1);
  const [row] = await db
    .insert(functions)
    .values({ workspaceId: user.workspaceId, name: n, slug, sortOrder: Math.min(maxReal + 1, 98) })
    .returning({ id: functions.id });
  revalidatePath("/roadmap");
  revalidatePath("/roadmap/by-project");
  return { ok: true, id: row.id };
}

/** Rename a function (the reserved Uncategorized bucket can't be renamed). */
export async function renameFunction(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const n = name.trim();
  if (!n) return { ok: false, error: "Name required" };
  const rows = await db
    .select({ slug: functions.slug })
    .from(functions)
    .where(and(eq(functions.id, id), eq(functions.workspaceId, user.workspaceId)));
  if (!rows[0]) return { ok: false, error: "Function not found" };
  if (rows[0].slug === "uncategorized") return { ok: false, error: "The Uncategorized bucket can't be renamed" };
  await db
    .update(functions)
    .set({ name: n })
    .where(and(eq(functions.id, id), eq(functions.workspaceId, user.workspaceId)));
  revalidatePath("/roadmap");
  revalidatePath("/roadmap/by-project");
  return { ok: true };
}

/** Assign an initiative to a function. Passing null resolves to Uncategorized so
 *  an initiative is NEVER orphaned from the horizontal axis (FR-E6-6). */
export async function setInitiativeFunction(
  initiativeId: string,
  functionId: string | null,
  quiet = false,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!(await ownInitiative(user.workspaceId, initiativeId)))
    return { ok: false, error: "Initiative not found" };
  let fid = functionId;
  if (fid) {
    const owned = await db
      .select({ id: functions.id })
      .from(functions)
      .where(and(eq(functions.id, fid), eq(functions.workspaceId, user.workspaceId)));
    if (!owned.length) return { ok: false, error: "Function not found" };
  } else {
    fid = await uncategorizedFunctionId(user.workspaceId);
  }
  await db
    .update(initiatives)
    .set({ functionId: fid, updatedAt: new Date() })
    .where(and(eq(initiatives.id, initiativeId), eq(initiatives.workspaceId, user.workspaceId)));
  if (!quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/roadmap/by-project");
  }
  return { ok: true };
}

/* ─── Bulk-edit structural ops (LoBs · initiatives · tasks) ───────────── */

export async function createLob(
  title?: string,
  quiet = false,
): Promise<{ ok: boolean; id?: string }> {
  const user = await requireUser();
  const [row] = await db
    .insert(linesOfBusiness)
    .values({
      workspaceId: user.workspaceId,
      title: (title ?? "").trim() || "New line of business",
      kind: "business",
      createdBy: user.id,
    })
    .returning({ id: linesOfBusiness.id });
  if (!quiet) revalidatePath("/roadmap");
  return { ok: true, id: row.id };
}

export async function renameLob(id: string, title: string, quiet = false): Promise<void> {
  const user = await requireUser();
  const t = (title ?? "").trim();
  if (!t) return;
  await db
    .update(linesOfBusiness)
    .set({ title: t, updatedAt: new Date() })
    .where(and(eq(linesOfBusiness.id, id), eq(linesOfBusiness.workspaceId, user.workspaceId)));
  if (!quiet) revalidatePath("/roadmap");
}

/** Delete a LoB; its initiatives are detached (become Cross-venture), not deleted. */
export async function deleteLob(id: string, quiet = false): Promise<void> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await t
      .update(initiatives)
      .set({ lobId: null })
      .where(and(eq(initiatives.lobId, id), eq(initiatives.workspaceId, user.workspaceId)));
    await t
      .delete(linesOfBusiness)
      .where(and(eq(linesOfBusiness.id, id), eq(linesOfBusiness.workspaceId, user.workspaceId)));
  });
  if (!quiet) revalidatePath("/roadmap");
}

export async function createInitiative(opts: {
  lobId?: string | null;
  functionId?: string | null;
  title?: string;
  quiet?: boolean;
}): Promise<{ ok: boolean; id?: string }> {
  const user = await requireUser();
  // FR-E6-6a: default to the reserved Uncategorized function so a new initiative
  // is never orphaned from the horizontal axis.
  const functionId =
    opts.functionId !== undefined && opts.functionId !== null
      ? opts.functionId
      : await uncategorizedFunctionId(user.workspaceId);
  const [row] = await db
    .insert(initiatives)
    .values({
      workspaceId: user.workspaceId,
      lobId: opts.lobId ?? null,
      functionId,
      title: (opts.title ?? "").trim() || "New milestone",
      createdBy: user.id,
    })
    .returning({ id: initiatives.id });
  if (!opts.quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/roadmap/by-project");
  }
  return { ok: true, id: row.id };
}

/** Drag-move a milestone (initiative) to a LoB and/or reorder it among the
 *  destination LoB's milestones. `orderedSiblingIds` = that LoB's milestones in
 *  final order (the moved one included). */
export async function moveInitiative(
  id: string,
  opts: { lobId: string | null; orderedSiblingIds: string[] },
  quiet = false,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await t
      .update(initiatives)
      .set({ lobId: opts.lobId, updatedAt: new Date() })
      .where(and(eq(initiatives.id, id), eq(initiatives.workspaceId, user.workspaceId)));
    for (let i = 0; i < opts.orderedSiblingIds.length; i++) {
      await t
        .update(initiatives)
        .set({ sortOrder: i })
        .where(
          and(
            eq(initiatives.id, opts.orderedSiblingIds[i]),
            eq(initiatives.workspaceId, user.workspaceId),
          ),
        );
    }
  });
  if (!quiet) revalidatePath("/roadmap");
  return { ok: true };
}

/** Drag-reorder lines of business. `orderedIds` = all LoBs in final order. */
export async function reorderLobs(
  orderedIds: string[],
  quiet = false,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    for (let i = 0; i < orderedIds.length; i++) {
      await t
        .update(linesOfBusiness)
        .set({ sortOrder: i })
        .where(
          and(
            eq(linesOfBusiness.id, orderedIds[i]),
            eq(linesOfBusiness.workspaceId, user.workspaceId),
          ),
        );
    }
  });
  if (!quiet) revalidatePath("/roadmap");
  return { ok: true };
}

export async function deleteInitiative(id: string, quiet = false): Promise<void> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await t
      .delete(milestones)
      .where(and(eq(milestones.initiativeId, id), eq(milestones.workspaceId, user.workspaceId)));
    await t
      .delete(initiatives)
      .where(and(eq(initiatives.id, id), eq(initiatives.workspaceId, user.workspaceId)));
  });
  if (!quiet) revalidatePath("/roadmap");
}

/** Soft-delete a task + its descendants (the roadmap queries exclude cancelled). */
export async function deleteRoadmapTask(id: string, quiet = false): Promise<void> {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    const all = await t
      .select({ id: milestones.id, parent: milestones.parentMilestoneId })
      .from(milestones)
      .where(eq(milestones.workspaceId, user.workspaceId));
    const childrenOf = new Map<string, string[]>();
    for (const m of all) {
      if (m.parent) {
        const a = childrenOf.get(m.parent) ?? [];
        a.push(m.id);
        childrenOf.set(m.parent, a);
      }
    }
    const toCancel: string[] = [];
    const stack = [id];
    while (stack.length) {
      const n = stack.pop()!;
      toCancel.push(n);
      for (const c of childrenOf.get(n) ?? []) stack.push(c);
    }
    await t
      .update(milestones)
      .set({ status: "cancelled" })
      .where(and(inArray(milestones.id, toCancel), eq(milestones.workspaceId, user.workspaceId)));
  });
  if (quiet) return;
  revalidatePath("/roadmap");
  revalidatePath("/work");
}

/** Multi-select delete from the toolbar: initiatives are removed (with their
 *  milestones); tasks are soft-cancelled (with descendants). One round trip. */
export async function bulkDeleteRoadmap(input: {
  initiativeIds?: string[];
  taskIds?: string[];
}): Promise<{ ok: boolean; deleted: number }> {
  const user = await requireUser();
  const initIds = (input.initiativeIds ?? []).filter(Boolean);
  const taskIds = (input.taskIds ?? []).filter(Boolean);
  if (initIds.length === 0 && taskIds.length === 0) return { ok: true, deleted: 0 };

  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;

    if (taskIds.length > 0) {
      // Expand each selected task to include its descendants, then soft-cancel.
      const all = await t
        .select({ id: milestones.id, parent: milestones.parentMilestoneId })
        .from(milestones)
        .where(eq(milestones.workspaceId, user.workspaceId));
      const childrenOf = new Map<string, string[]>();
      for (const m of all) {
        if (m.parent) {
          const a = childrenOf.get(m.parent) ?? [];
          a.push(m.id);
          childrenOf.set(m.parent, a);
        }
      }
      const toCancel = new Set<string>();
      const stack = [...taskIds];
      while (stack.length) {
        const n = stack.pop()!;
        if (toCancel.has(n)) continue;
        toCancel.add(n);
        for (const c of childrenOf.get(n) ?? []) stack.push(c);
      }
      await t
        .update(milestones)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(milestones.id, [...toCancel]),
            eq(milestones.workspaceId, user.workspaceId),
          ),
        );
    }

    if (initIds.length > 0) {
      await t
        .delete(milestones)
        .where(
          and(
            inArray(milestones.initiativeId, initIds),
            eq(milestones.workspaceId, user.workspaceId),
          ),
        );
      await t
        .delete(initiatives)
        .where(
          and(inArray(initiatives.id, initIds), eq(initiatives.workspaceId, user.workspaceId)),
        );
    }
  });

  revalidatePath("/roadmap");
  revalidatePath("/work");
  return { ok: true, deleted: initIds.length + taskIds.length };
}

/** Drag-and-drop move of a task (deliverable/sub-deliverable) to a new home:
 *  possibly a different milestone (initiativeId), a new parent task, and a new
 *  order among its destination siblings. Cascades initiativeId/projectId to the
 *  moved subtree. `orderedSiblingIds` are the destination siblings in final
 *  order (the moved task included). */
export async function moveRoadmapTask(
  id: string,
  opts: {
    initiativeId: string;
    parentMilestoneId: string | null;
    orderedSiblingIds: string[];
  },
  quiet = false,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (opts.parentMilestoneId === id) return { ok: false, error: "Invalid parent" };

  const [destInit] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(and(eq(initiatives.id, opts.initiativeId), eq(initiatives.workspaceId, user.workspaceId)))
    .limit(1);
  if (!destInit) return { ok: false, error: "Milestone not found" };

  try {
    await db.transaction(async (tx) => {
      const t = tx as unknown as typeof db;
      const all = await t
        .select({ id: milestones.id, parent: milestones.parentMilestoneId })
        .from(milestones)
        .where(eq(milestones.workspaceId, user.workspaceId));
      const childrenOf = new Map<string, string[]>();
      for (const m of all) {
        if (m.parent) {
          const a = childrenOf.get(m.parent) ?? [];
          a.push(m.id);
          childrenOf.set(m.parent, a);
        }
      }
      const subtree = new Set<string>();
      const stack = [id];
      while (stack.length) {
        const n = stack.pop()!;
        subtree.add(n);
        for (const c of childrenOf.get(n) ?? []) stack.push(c);
      }
      // Can't drop a node inside its own subtree.
      if (opts.parentMilestoneId && subtree.has(opts.parentMilestoneId)) {
        throw new Error("Can't move a task into its own descendant");
      }
      const projectId = await resolveProjectForInitiative(
        { workspaceId: user.workspaceId, initiativeId: opts.initiativeId, createdBy: user.id },
        t,
      );
      // Re-home the whole moved subtree onto the destination milestone/project.
      await t
        .update(milestones)
        .set({ initiativeId: opts.initiativeId, projectId })
        .where(and(inArray(milestones.id, [...subtree]), eq(milestones.workspaceId, user.workspaceId)));
      // Set the moved node's parent.
      await t
        .update(milestones)
        .set({ parentMilestoneId: opts.parentMilestoneId })
        .where(and(eq(milestones.id, id), eq(milestones.workspaceId, user.workspaceId)));
      // Renumber the destination sibling group.
      for (let i = 0; i < opts.orderedSiblingIds.length; i++) {
        await t
          .update(milestones)
          .set({ order: i })
          .where(
            and(
              eq(milestones.id, opts.orderedSiblingIds[i]),
              eq(milestones.workspaceId, user.workspaceId),
            ),
          );
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Move failed" };
  }

  if (!quiet) {
    revalidatePath("/roadmap");
    revalidatePath("/work");
  }
  return { ok: true };
}

/** Re-parent a task (Tab/Shift+Tab indent/outdent within a milestone's tree). */
export async function reparentRoadmapTask(
  id: string,
  parentMilestoneId: string | null,
  quiet = false,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (id === parentMilestoneId) return { ok: false, error: "Invalid parent" };
  await db
    .update(milestones)
    .set({ parentMilestoneId })
    .where(and(eq(milestones.id, id), eq(milestones.workspaceId, user.workspaceId)));
  if (quiet) return { ok: true };
  revalidatePath("/roadmap");
  revalidatePath("/work");
  return { ok: true };
}
