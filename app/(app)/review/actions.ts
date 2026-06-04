"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import { saveReview } from "@/db/queries/review";

export async function saveReviewAction(input: {
  weekOf: string;
  notes: string;
  snapshot: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await saveReview({
      workspaceId: user.workspaceId,
      facilitatorId: user.id,
      weekOf: input.weekOf,
      notes: input.notes,
      snapshot: input.snapshot ?? null,
    });
  } catch {
    return { ok: false, error: "Couldn't save the review." };
  }
  revalidatePath("/review");
  return { ok: true };
}
