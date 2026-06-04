"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const { actionItems } = schema;

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Mark an action item done (or reopen it). Workspace-scoped. */
export async function setActionItemDone(opts: {
  id: string;
  done: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  const [row] = await db
    .update(actionItems)
    .set({
      status: opts.done ? "done" : "open",
      completedAt: opts.done ? new Date() : null,
    })
    .where(
      and(
        eq(actionItems.id, opts.id),
        eq(actionItems.workspaceId, user.workspaceId),
      ),
    )
    .returning({ id: actionItems.id });

  if (!row) return { ok: false, error: "Action item not found" };
  revalidatePath("/");
  return { ok: true, id: row.id };
}
