"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  createObjective,
  updateObjective,
  deleteObjective,
  createKeyResult,
  updateKeyResult,
  deleteKeyResult,
  quarterOf,
  type ObjectiveStatus,
  type KrDirection,
} from "@/db/queries/okrs";

type Res = { ok: true; id?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/priorities");
  revalidatePath("/");
}

export async function createObjectiveAction(input: {
  title: string;
  quarter?: string;
  ownerId?: string | null;
  description?: string | null;
}): Promise<Res> {
  const user = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "Give the objective a title." };
  const quarter = input.quarter && /^\d{4}-Q[1-4]$/.test(input.quarter) ? input.quarter : quarterOf();
  const row = await createObjective({
    workspaceId: user.workspaceId,
    actorId: user.id,
    title: input.title.trim().slice(0, 200),
    quarter,
    ownerId: input.ownerId ?? null,
    description: input.description ?? null,
  });
  if (!row) return { ok: false, error: "That owner isn't in your workspace." };
  refresh();
  return { ok: true, id: row.id };
}

export async function updateObjectiveAction(input: {
  id: string;
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  status?: ObjectiveStatus;
}): Promise<Res> {
  const user = await requireUser();
  const ok = await updateObjective({ workspaceId: user.workspaceId, ...input });
  if (!ok) return { ok: false, error: "Objective not found, or owner isn't in your workspace." };
  refresh();
  return { ok: true };
}

export async function deleteObjectiveAction(id: string): Promise<Res> {
  const user = await requireUser();
  const ok = await deleteObjective(user.workspaceId, id);
  if (!ok) return { ok: false, error: "Objective not found." };
  refresh();
  return { ok: true };
}

export async function createKeyResultAction(input: {
  objectiveId: string;
  title: string;
  target: number;
  startValue?: number;
  current?: number;
  unit?: string | null;
  direction?: KrDirection;
  ownerId?: string | null;
}): Promise<Res> {
  const user = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "Give the key result a title." };
  for (const n of [input.target, input.startValue, input.current]) {
    if (n !== undefined && !Number.isFinite(n)) return { ok: false, error: "Numbers must be finite." };
  }
  const row = await createKeyResult({ workspaceId: user.workspaceId, ...input, title: input.title.trim().slice(0, 200) });
  if (!row) return { ok: false, error: "That objective or owner isn't in your workspace." };
  refresh();
  return { ok: true, id: row.id };
}

export async function updateKeyResultAction(input: {
  id: string;
  title?: string;
  current?: number;
  target?: number;
  startValue?: number;
  unit?: string | null;
  direction?: KrDirection;
  ownerId?: string | null;
  onScorecard?: boolean;
}): Promise<Res> {
  const user = await requireUser();
  for (const n of [input.target, input.current, input.startValue]) {
    if (n !== undefined && !Number.isFinite(n)) return { ok: false, error: "Numbers must be finite." };
  }
  const ok = await updateKeyResult({ workspaceId: user.workspaceId, ...input });
  if (!ok) return { ok: false, error: "Key result not found, or owner isn't in your workspace." };
  refresh();
  return { ok: true };
}

export async function deleteKeyResultAction(id: string): Promise<Res> {
  const user = await requireUser();
  const ok = await deleteKeyResult(user.workspaceId, id);
  if (!ok) return { ok: false, error: "Key result not found." };
  refresh();
  return { ok: true };
}
