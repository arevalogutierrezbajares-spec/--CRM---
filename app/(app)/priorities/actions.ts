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
  const { id } = await createObjective({
    workspaceId: user.workspaceId,
    actorId: user.id,
    title: input.title.trim(),
    quarter: input.quarter || quarterOf(),
    ownerId: input.ownerId ?? null,
    description: input.description ?? null,
  });
  refresh();
  return { ok: true, id };
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
  if (!ok) return { ok: false, error: "Objective not found." };
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
  if (!Number.isFinite(input.target)) return { ok: false, error: "Target must be a number." };
  const row = await createKeyResult({ workspaceId: user.workspaceId, ...input, title: input.title.trim() });
  if (!row) return { ok: false, error: "That objective isn't in your workspace." };
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
  const ok = await updateKeyResult({ workspaceId: user.workspaceId, ...input });
  if (!ok) return { ok: false, error: "Key result not found." };
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
