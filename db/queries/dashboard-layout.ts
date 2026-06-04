import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { resolveLayout, type DashWidget } from "@/lib/dashboard/layout";

/** The user's resolved Home dashboard layout (saved merged with defaults). */
export async function getDashboardLayout(userId: string): Promise<DashWidget[]> {
  const [row] = await db
    .select({ layout: schema.users.dashboardLayout })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return resolveLayout(row?.layout ?? null);
}
