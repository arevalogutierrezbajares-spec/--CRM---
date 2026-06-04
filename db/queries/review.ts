import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** Monday (week start) of the week containing the given YYYY-MM-DD date. */
export function weekMondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}

export type ReviewListItem = {
  id: string;
  weekOf: string;
  notes: string | null;
  facilitatorName: string | null;
  createdAt: Date;
};

/** Save (upsert) the review notes + snapshot for a given week. */
export async function saveReview(input: {
  workspaceId: string;
  facilitatorId: string;
  weekOf: string;
  notes: string;
  snapshot: unknown;
}): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: schema.weeklyReviews.id })
    .from(schema.weeklyReviews)
    .where(
      and(
        eq(schema.weeklyReviews.workspaceId, input.workspaceId),
        eq(schema.weeklyReviews.weekOf, input.weekOf),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.weeklyReviews)
      .set({ notes: input.notes, snapshot: input.snapshot, facilitatorId: input.facilitatorId })
      .where(eq(schema.weeklyReviews.id, existing.id));
    return { id: existing.id };
  }
  const [row] = await db
    .insert(schema.weeklyReviews)
    .values({
      workspaceId: input.workspaceId,
      facilitatorId: input.facilitatorId,
      weekOf: input.weekOf,
      notes: input.notes,
      snapshot: input.snapshot,
    })
    .returning({ id: schema.weeklyReviews.id });
  return row;
}

/** A week's saved review, if any. */
export async function getReviewForWeek(
  workspaceId: string,
  weekOf: string,
): Promise<{ notes: string | null } | null> {
  const [row] = await db
    .select({ notes: schema.weeklyReviews.notes })
    .from(schema.weeklyReviews)
    .where(and(eq(schema.weeklyReviews.workspaceId, workspaceId), eq(schema.weeklyReviews.weekOf, weekOf)))
    .limit(1);
  return row ?? null;
}

/** Recent saved reviews, newest week first. */
export async function listReviews(workspaceId: string, limit = 8): Promise<ReviewListItem[]> {
  const rows = await db
    .select({
      id: schema.weeklyReviews.id,
      weekOf: schema.weeklyReviews.weekOf,
      notes: schema.weeklyReviews.notes,
      facilitatorName: schema.users.displayName,
      createdAt: schema.weeklyReviews.createdAt,
    })
    .from(schema.weeklyReviews)
    .leftJoin(schema.users, eq(schema.users.id, schema.weeklyReviews.facilitatorId))
    .where(eq(schema.weeklyReviews.workspaceId, workspaceId))
    .orderBy(desc(schema.weeklyReviews.weekOf))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    weekOf: r.weekOf,
    notes: r.notes,
    facilitatorName: r.facilitatorName,
    createdAt: r.createdAt,
  }));
}
