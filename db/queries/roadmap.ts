import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  initiatives,
  linesOfBusiness,
  milestones,
  planVersions,
  projects,
  users,
  workspaceMembers,
} from "@/db/schema";
import type {
  RoadmapInitiativeNode,
  RoadmapSnapshot,
  RoadmapTaskNode,
} from "@/lib/roadmap-md";

/* ─── Owner handles (FR-RMD-12) ───────────────────────────────────────── */

export type OwnerMaps = {
  /** user id → export handle */
  handleByUserId: Map<string, string>;
  /** lowercase handle/alias → user id (ambiguous aliases removed) */
  userIdByHandle: Map<string, string>;
};

export async function buildOwnerMaps(workspaceId: string): Promise<OwnerMaps> {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const handleByUserId = new Map<string, string>();
  const aliasCounts = new Map<string, string[]>(); // alias → user ids

  const addAlias = (alias: string, id: string) => {
    const a = alias.toLowerCase();
    if (!a) return;
    const list = aliasCounts.get(a) ?? [];
    if (!list.includes(id)) list.push(id);
    aliasCounts.set(a, list);
  };

  for (const u of rows) {
    const first = (u.displayName ?? "").trim().split(/\s+/)[0] ?? "";
    const emailLocal = (u.email ?? "").split("@")[0] ?? "";
    const full = (u.displayName ?? "").trim().replace(/\s+/g, "");
    // Export handle: first name when present, else email local part.
    handleByUserId.set(u.id, (first || emailLocal).toLowerCase());
    addAlias(first, u.id);
    addAlias(emailLocal, u.id);
    addAlias(full, u.id);
  }

  // De-duplicate export handles (two users named "Juan" → fall back to email local).
  const seen = new Map<string, string>();
  for (const u of rows) {
    const h = handleByUserId.get(u.id)!;
    if (seen.has(h)) {
      const emailLocal = ((u.email ?? "").split("@")[0] ?? "").toLowerCase();
      if (emailLocal && emailLocal !== h) handleByUserId.set(u.id, emailLocal);
    } else {
      seen.set(h, u.id);
    }
  }

  const userIdByHandle = new Map<string, string>();
  for (const [alias, ids] of aliasCounts) {
    if (ids.length === 1) userIdByHandle.set(alias, ids[0]); // ambiguous → unknown
  }
  // Export handles always resolve back to their user.
  for (const [id, h] of handleByUserId) userIdByHandle.set(h, id);

  return { handleByUserId, userIdByHandle };
}

/* ─── Snapshot builder (FR-RMD-1 / FR-UNI-1) ──────────────────────────── */

/** Live roadmap state as Roadmap-MD nodes. Cancelled initiatives excluded
 *  (archive semantics, OD-2); cancelled tasks excluded likewise. */
export async function buildRoadmapSnapshot(
  workspaceId: string,
  ownerMaps?: OwnerMaps,
): Promise<RoadmapSnapshot> {
  const maps = ownerMaps ?? (await buildOwnerMaps(workspaceId));

  const inits = await db
    .select()
    .from(initiatives)
    .where(
      and(eq(initiatives.workspaceId, workspaceId), ne(initiatives.status, "cancelled")),
    )
    .orderBy(asc(initiatives.createdAt));

  const initIds = inits.map((i) => i.id);
  const taskRows = initIds.length
    ? await db
        .select()
        .from(milestones)
        .where(
          and(
            inArray(milestones.initiativeId, initIds),
            ne(milestones.status, "cancelled"),
          ),
        )
        .orderBy(asc(milestones.order), asc(milestones.createdAt))
    : [];

  const handleFor = (userId: string | null) =>
    userId ? (maps.handleByUserId.get(userId) ?? null) : null;

  const snapshot: RoadmapSnapshot = { initiatives: [] };
  for (const init of inits) {
    const mine = taskRows.filter((t) => t.initiativeId === init.id);
    const nodeById = new Map<string, RoadmapTaskNode>();
    for (const t of mine) {
      nodeById.set(t.id, {
        id: t.id,
        token: null,
        title: t.title,
        done: t.status === "done",
        ownerHandle: handleFor(t.assigneeUserId ?? t.assignedTo),
        dueDate: t.dueDate,
        children: [],
      });
    }
    const roots: RoadmapTaskNode[] = [];
    for (const t of mine) {
      const node = nodeById.get(t.id)!;
      const parent = t.parentMilestoneId ? nodeById.get(t.parentMilestoneId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const initNode: RoadmapInitiativeNode = {
      id: init.id,
      token: null,
      title: init.title,
      ownerHandle: handleFor(init.ownerUserId),
      status: init.status,
      health: init.healthColor,
      startDate: init.startDate,
      targetEndDate: init.targetEndDate,
      successCriteria: init.successCriteria,
      goal: init.goal,
      tasks: roots,
    };
    snapshot.initiatives.push(initNode);
  }
  return snapshot;
}

/* ─── Plan versions (FR-PLV-1/2) ──────────────────────────────────────── */

export type PlanVersionRow = typeof planVersions.$inferSelect;

export async function nextPlanVersionNumber(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${planVersions.version}), 0)::int` })
    .from(planVersions)
    .where(eq(planVersions.workspaceId, workspaceId));
  return (row?.max ?? 0) + 1;
}

export async function createPlanVersion(opts: {
  workspaceId: string;
  version: number;
  source: "export" | "import" | "commit";
  snapshotMd: string;
  note?: string | null;
  summary?: unknown;
  createdBy?: string | null;
}): Promise<PlanVersionRow> {
  const [row] = await db
    .insert(planVersions)
    .values({
      workspaceId: opts.workspaceId,
      version: opts.version,
      source: opts.source,
      snapshotMd: opts.snapshotMd,
      note: opts.note ?? null,
      summary: opts.summary ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .returning();
  return row;
}

export async function listPlanVersions(
  workspaceId: string,
  limit = 50,
): Promise<Array<Omit<PlanVersionRow, "snapshotMd"> & { authorName: string | null }>> {
  const rows = await db
    .select({
      id: planVersions.id,
      workspaceId: planVersions.workspaceId,
      version: planVersions.version,
      source: planVersions.source,
      note: planVersions.note,
      summary: planVersions.summary,
      createdBy: planVersions.createdBy,
      createdAt: planVersions.createdAt,
      authorName: users.displayName,
    })
    .from(planVersions)
    .leftJoin(users, eq(users.id, planVersions.createdBy))
    .where(eq(planVersions.workspaceId, workspaceId))
    .orderBy(desc(planVersions.version))
    .limit(limit);
  return rows;
}

export async function getPlanVersion(
  workspaceId: string,
  version: number,
): Promise<PlanVersionRow | null> {
  const [row] = await db
    .select()
    .from(planVersions)
    .where(
      and(eq(planVersions.workspaceId, workspaceId), eq(planVersions.version, version)),
    )
    .limit(1);
  return row ?? null;
}

/* ─── Holding project for roadmap-born tasks (OD-4) ───────────────────── */

/** milestones.project_id is NOT NULL, so a task created from the roadmap needs
 *  a project. Resolution chain: (1) the project most of the initiative's
 *  existing tasks already use, (2) find-or-create a project named after the
 *  initiative under its LoB, (3) find-or-create both under a visible
 *  "General" LoB. Everything stays a normal, visible record. */
export async function resolveProjectForInitiative(
  opts: {
    workspaceId: string;
    initiativeId: string;
    createdBy: string;
  },
  dbx: typeof db = db,
): Promise<string> {
  const [agg] = await dbx
    .select({
      projectId: milestones.projectId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(milestones)
    .where(eq(milestones.initiativeId, opts.initiativeId))
    .groupBy(milestones.projectId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(1);
  if (agg?.projectId) return agg.projectId;

  const [init] = await dbx
    .select({ title: initiatives.title, lobId: initiatives.lobId })
    .from(initiatives)
    .where(eq(initiatives.id, opts.initiativeId))
    .limit(1);
  if (!init) throw new Error("Initiative not found");

  let lobId = init.lobId;
  if (!lobId) {
    const [existingLob] = await dbx
      .select({ id: linesOfBusiness.id })
      .from(linesOfBusiness)
      .where(
        and(
          eq(linesOfBusiness.workspaceId, opts.workspaceId),
          eq(linesOfBusiness.title, "General"),
        ),
      )
      .limit(1);
    if (existingLob) {
      lobId = existingLob.id;
    } else {
      const [lob] = await dbx
        .insert(linesOfBusiness)
        .values({
          workspaceId: opts.workspaceId,
          title: "General",
          createdBy: opts.createdBy,
        })
        .returning({ id: linesOfBusiness.id });
      lobId = lob.id;
    }
  }

  const [existing] = await dbx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, opts.workspaceId),
        eq(projects.lobId, lobId),
        eq(projects.title, init.title),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [proj] = await dbx
    .insert(projects)
    .values({
      workspaceId: opts.workspaceId,
      lobId,
      title: init.title,
      createdBy: opts.createdBy,
    })
    .returning({ id: projects.id });
  return proj.id;
}
