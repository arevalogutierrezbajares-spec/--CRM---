import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { readLayout, type DashWidget } from "@/lib/dashboard/layout";

/** The user's resolved Home dashboard layout (versioned read: stale layouts
 *  re-seed to the current defaults, current-version layouts merge in). */
export async function getDashboardLayout(userId: string): Promise<DashWidget[]> {
  const [row] = await db
    .select({ layout: schema.users.dashboardLayout })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return readLayout(row?.layout ?? null);
}
