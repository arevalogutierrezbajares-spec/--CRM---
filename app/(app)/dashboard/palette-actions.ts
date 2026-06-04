"use server";

import { requireUser } from "@/lib/current-user";
import { listProjectsForPicker } from "@/db/queries/items";

/** Projects for the command palette's "Go to project" + capture resolution. */
export async function paletteProjectsAction(): Promise<{ id: string; title: string }[]> {
  const user = await requireUser();
  return listProjectsForPicker(user.workspaceId);
}
