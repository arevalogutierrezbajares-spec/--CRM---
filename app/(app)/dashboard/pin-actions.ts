"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import { togglePin } from "@/db/queries/pins";

export async function togglePinAction(opts: {
  projectId: string;
}): Promise<{ ok: true; pinned: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  const pinned = await togglePin(user.workspaceId, user.id, opts.projectId);
  revalidatePath("/");
  return { ok: true, pinned };
}
