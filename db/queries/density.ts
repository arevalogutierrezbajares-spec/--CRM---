import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";

const { touches } = schema;

export type DensityCell = {
  date: string; // YYYY-MM-DD
  count: number;
};

/**
 * AGB-206 — touches/day for the last 90 days.
 * Returns one cell per calendar day with the count of touches the user
 * created on that day.
 */
export async function touchDensity(opts: {
  workspaceId: string;
  days?: number;
}): Promise<DensityCell[]> {
  const days = opts.days ?? 90;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days + 1);

  const rows = await db
    .select({ createdAt: touches.createdAt })
    .from(touches)
    .where(
      and(eq(touches.workspaceId, opts.workspaceId), gte(touches.createdAt, since)),
    );

  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const t of rows) {
    const key = t.createdAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}
