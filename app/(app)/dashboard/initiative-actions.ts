"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  listInitiativesForPicker,
  getItemInitiativeIds,
  setItemInitiatives,
  type InitiativePick,
} from "@/db/queries/item-initiatives";

type Kind = "milestone" | "action_item";

export async function getItemInitiativesAction(opts: {
  entityType: Kind;
  id: string;
}): Promise<{ ok: true; all: InitiativePick[]; selected: string[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const [all, selected] = await Promise.all([
    listInitiativesForPicker(user.workspaceId),
    getItemInitiativeIds(user.workspaceId, opts.entityType, opts.id),
  ]);
  return { ok: true, all, selected };
}

export async function setItemInitiativesAction(opts: {
  entityType: Kind;
  id: string;
  initiativeIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const ok = await setItemInitiatives(user.workspaceId, opts.entityType, opts.id, opts.initiativeIds);
  if (!ok) return { ok: false, error: "Item not found in your workspace." };
  revalidatePath("/");
  revalidatePath("/work");
  return { ok: true };
}
