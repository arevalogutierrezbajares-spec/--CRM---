import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** True if `ownerId` (when set) is a member of `workspaceId`. Prevents attaching
 *  a foreign user as owner (which would leak their display name cross-tenant). */
async function ownerInWorkspace(workspaceId: string, ownerId: string | null | undefined): Promise<boolean> {
  if (!ownerId) return true;
  const [m] = await db
    .select({ id: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, ownerId)))
    .limit(1);
  return Boolean(m);
}

export type ObjectiveStatus = "on_track" | "at_risk" | "off_track" | "done";
export type KrDirection = "higher" | "lower";
export type KrHealth = "green" | "amber" | "red";

export type KeyResultView = {
  id: string;
  objectiveId: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  startValue: number;
  target: number;
  current: number;
  unit: string | null;
  direction: KrDirection;
  onScorecard: boolean;
  isKpi: boolean;
  progress: number; // 0..1
  health: KrHealth;
};

export type ObjectiveView = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerAll: boolean;
  quarter: string;
  status: ObjectiveStatus;
  keyResults: KeyResultView[];
  progress: number; // 0..1, avg of its key results
};

/** Current quarter label, e.g. "2026-Q2", from a YYYY-MM-DD or Date. */
export function quarterOf(d: Date = new Date()): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function krProgress(startValue: number, target: number, current: number, direction: KrDirection): number {
  const span = direction === "higher" ? target - startValue : startValue - target;
  const moved = direction === "higher" ? current - startValue : startValue - current;
  if (span === 0) return current === target ? 1 : 0;
  return Math.max(0, Math.min(1, moved / span));
}

function healthOf(progress: number): KrHealth {
  // OKR convention: 0.7 = success. Below 0.3 is at risk.
  if (progress >= 0.7) return "green";
  if (progress >= 0.3) return "amber";
  return "red";
}

function toKrView(r: typeof schema.keyResults.$inferSelect & { ownerName: string | null }): KeyResultView {
  const progress = krProgress(r.startValue, r.target, r.current, r.direction as KrDirection);
  return {
    id: r.id,
    objectiveId: r.objectiveId,
    title: r.title,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    startValue: r.startValue,
    target: r.target,
    current: r.current,
    unit: r.unit,
    direction: r.direction as KrDirection,
    onScorecard: r.onScorecard,
    isKpi: r.isKpi,
    progress,
    health: healthOf(progress),
  };
}

/** Distinct quarters that have objectives, newest first; always includes the current one. */
export async function listQuarters(workspaceId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ quarter: schema.objectives.quarter })
    .from(schema.objectives)
    .where(eq(schema.objectives.workspaceId, workspaceId));
  const set = new Set(rows.map((r) => r.quarter));
  set.add(quarterOf());
  return Array.from(set).sort().reverse();
}

/** Objectives (with their key results + owner names) for a quarter. */
export async function listObjectives(
  workspaceId: string,
  quarter: string = quarterOf(),
): Promise<ObjectiveView[]> {
  const objs = await db
    .select({
      o: schema.objectives,
      ownerName: schema.users.displayName,
    })
    .from(schema.objectives)
    // Join the owner only through workspace membership so a foreign owner id
    // can never surface another tenant's display name.
    .leftJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.userId, schema.objectives.ownerId),
        eq(schema.workspaceMembers.workspaceId, schema.objectives.workspaceId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(and(eq(schema.objectives.workspaceId, workspaceId), eq(schema.objectives.quarter, quarter)))
    .orderBy(asc(schema.objectives.sortOrder), asc(schema.objectives.createdAt));

  if (objs.length === 0) return [];
  const ids = objs.map((r) => r.o.id);

  const krRows = await db
    .select({ kr: schema.keyResults, ownerName: schema.users.displayName })
    .from(schema.keyResults)
    .leftJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.userId, schema.keyResults.ownerId),
        eq(schema.workspaceMembers.workspaceId, schema.keyResults.workspaceId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(inArray(schema.keyResults.objectiveId, ids))
    .orderBy(asc(schema.keyResults.sortOrder), asc(schema.keyResults.createdAt));

  const krByObj = new Map<string, KeyResultView[]>();
  for (const r of krRows) {
    const v = toKrView({ ...r.kr, ownerName: r.ownerName });
    const arr = krByObj.get(r.kr.objectiveId) ?? krByObj.set(r.kr.objectiveId, []).get(r.kr.objectiveId)!;
    arr.push(v);
  }

  return objs.map((r) => {
    const krs = krByObj.get(r.o.id) ?? [];
    const progress = krs.length ? krs.reduce((s, k) => s + k.progress, 0) / krs.length : 0;
    return {
      id: r.o.id,
      title: r.o.title,
      description: r.o.description,
      ownerId: r.o.ownerId,
      ownerName: r.o.ownerAll ? "Everyone" : r.ownerName,
      ownerAll: r.o.ownerAll,
      quarter: r.o.quarter,
      status: r.o.status as ObjectiveStatus,
      keyResults: krs,
      progress,
    };
  });
}

/** Key results flagged for the weekly scorecard, with objective title + owner. */
export type ScorecardRow = KeyResultView & { objectiveTitle: string };

export async function listScorecard(
  workspaceId: string,
  quarter: string = quarterOf(),
): Promise<ScorecardRow[]> {
  const rows = await db
    .select({
      kr: schema.keyResults,
      ownerName: schema.users.displayName,
      objectiveTitle: schema.objectives.title,
    })
    .from(schema.keyResults)
    .innerJoin(schema.objectives, eq(schema.objectives.id, schema.keyResults.objectiveId))
    .leftJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.userId, schema.keyResults.ownerId),
        eq(schema.workspaceMembers.workspaceId, schema.keyResults.workspaceId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(
      and(
        eq(schema.keyResults.workspaceId, workspaceId),
        eq(schema.keyResults.onScorecard, true),
        eq(schema.objectives.quarter, quarter),
      ),
    )
    .orderBy(asc(schema.keyResults.sortOrder))
    .limit(15);
  return rows.map((r) => ({ ...toKrView({ ...r.kr, ownerName: r.ownerName }), objectiveTitle: r.objectiveTitle }));
}

/** Headline KPIs (key results flagged is_kpi) shown above Town Hall — across all quarters. */
export async function listKpis(workspaceId: string): Promise<ScorecardRow[]> {
  const rows = await db
    .select({
      kr: schema.keyResults,
      ownerName: schema.users.displayName,
      objectiveTitle: schema.objectives.title,
    })
    .from(schema.keyResults)
    .innerJoin(schema.objectives, eq(schema.objectives.id, schema.keyResults.objectiveId))
    .leftJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.userId, schema.keyResults.ownerId),
        eq(schema.workspaceMembers.workspaceId, schema.keyResults.workspaceId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(and(eq(schema.keyResults.workspaceId, workspaceId), eq(schema.keyResults.isKpi, true)))
    .orderBy(asc(schema.keyResults.sortOrder))
    .limit(8);
  return rows.map((r) => ({ ...toKrView({ ...r.kr, ownerName: r.ownerName }), objectiveTitle: r.objectiveTitle }));
}

/** All key results (title + objective + isKpi) for the "Top KPIs" settings picker. */
export type KpiPickRow = { id: string; title: string; objectiveTitle: string; isKpi: boolean };
export async function listKeyResultsForKpiPicker(workspaceId: string): Promise<KpiPickRow[]> {
  const rows = await db
    .select({
      id: schema.keyResults.id,
      title: schema.keyResults.title,
      objectiveTitle: schema.objectives.title,
      isKpi: schema.keyResults.isKpi,
    })
    .from(schema.keyResults)
    .innerJoin(schema.objectives, eq(schema.objectives.id, schema.keyResults.objectiveId))
    .where(eq(schema.keyResults.workspaceId, workspaceId))
    .orderBy(desc(schema.keyResults.isKpi), asc(schema.objectives.sortOrder), asc(schema.keyResults.sortOrder));
  return rows;
}

/* ─── mutations (all workspace-fenced by the caller via server actions) ───── */

export async function createObjective(input: {
  workspaceId: string;
  actorId: string;
  title: string;
  quarter: string;
  ownerId?: string | null;
  ownerAll?: boolean;
  description?: string | null;
}): Promise<{ id: string } | null> {
  const ownerAll = input.ownerAll ?? false;
  const ownerId = ownerAll ? null : (input.ownerId ?? null);
  if (!(await ownerInWorkspace(input.workspaceId, ownerId))) return null;
  const [row] = await db
    .insert(schema.objectives)
    .values({
      workspaceId: input.workspaceId,
      title: input.title,
      quarter: input.quarter,
      ownerId,
      ownerAll,
      description: input.description ?? null,
      createdBy: input.actorId,
    })
    .returning({ id: schema.objectives.id });
  return row;
}

export async function updateObjective(input: {
  workspaceId: string;
  id: string;
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  ownerAll?: boolean;
  status?: ObjectiveStatus;
}): Promise<boolean> {
  if (input.ownerId !== undefined && !input.ownerAll && !(await ownerInWorkspace(input.workspaceId, input.ownerId))) return false;
  const patch: Partial<typeof schema.objectives.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
  // "Everyone" wins: setting owner_all clears the single owner; picking a member clears owner_all.
  if (input.ownerAll !== undefined) {
    patch.ownerAll = input.ownerAll;
    if (input.ownerAll) patch.ownerId = null;
  }
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length === 0) return true;
  const res = await db
    .update(schema.objectives)
    .set(patch)
    .where(and(eq(schema.objectives.id, input.id), eq(schema.objectives.workspaceId, input.workspaceId)))
    .returning({ id: schema.objectives.id });
  return res.length > 0;
}

export async function deleteObjective(workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(schema.objectives)
    .where(and(eq(schema.objectives.id, id), eq(schema.objectives.workspaceId, workspaceId)))
    .returning({ id: schema.objectives.id });
  return res.length > 0;
}

export async function createKeyResult(input: {
  workspaceId: string;
  objectiveId: string;
  title: string;
  target: number;
  startValue?: number;
  current?: number;
  unit?: string | null;
  direction?: KrDirection;
  ownerId?: string | null;
}): Promise<{ id: string } | null> {
  // Fence: the objective must be in this workspace.
  const [obj] = await db
    .select({ id: schema.objectives.id })
    .from(schema.objectives)
    .where(and(eq(schema.objectives.id, input.objectiveId), eq(schema.objectives.workspaceId, input.workspaceId)))
    .limit(1);
  if (!obj) return null;
  if (!(await ownerInWorkspace(input.workspaceId, input.ownerId))) return null;
  const [row] = await db
    .insert(schema.keyResults)
    .values({
      workspaceId: input.workspaceId,
      objectiveId: input.objectiveId,
      title: input.title,
      target: input.target,
      startValue: input.startValue ?? 0,
      current: input.current ?? input.startValue ?? 0,
      unit: input.unit ?? null,
      direction: input.direction ?? "higher",
      ownerId: input.ownerId ?? null,
    })
    .returning({ id: schema.keyResults.id });
  return row;
}

export async function updateKeyResult(input: {
  workspaceId: string;
  id: string;
  title?: string;
  current?: number;
  target?: number;
  startValue?: number;
  unit?: string | null;
  direction?: KrDirection;
  ownerId?: string | null;
  onScorecard?: boolean;
  isKpi?: boolean;
}): Promise<boolean> {
  if (input.ownerId !== undefined && !(await ownerInWorkspace(input.workspaceId, input.ownerId))) return false;
  const patch: Partial<typeof schema.keyResults.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.isKpi !== undefined) patch.isKpi = input.isKpi;
  if (input.current !== undefined) patch.current = input.current;
  if (input.target !== undefined) patch.target = input.target;
  if (input.startValue !== undefined) patch.startValue = input.startValue;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
  if (input.onScorecard !== undefined) patch.onScorecard = input.onScorecard;
  if (Object.keys(patch).length === 0) return true;
  const res = await db
    .update(schema.keyResults)
    .set(patch)
    .where(and(eq(schema.keyResults.id, input.id), eq(schema.keyResults.workspaceId, input.workspaceId)))
    .returning({ id: schema.keyResults.id });
  return res.length > 0;
}

export async function deleteKeyResult(workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(schema.keyResults)
    .where(and(eq(schema.keyResults.id, id), eq(schema.keyResults.workspaceId, workspaceId)))
    .returning({ id: schema.keyResults.id });
  return res.length > 0;
}
