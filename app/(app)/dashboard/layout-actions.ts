"use server";

import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/current-user";
import { db, schema } from "@/db";
import { packLayout, type DashWidget } from "@/lib/dashboard/layout";

/** Persist the user's Home dashboard layout (sanitized + versioned server-side). */
export async function saveDashboardLayoutAction(
  layout: DashWidget[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ dashboardLayout: packLayout(layout) })
    .where(eq(schema.users.id, user.id));
  return { ok: true };
}
