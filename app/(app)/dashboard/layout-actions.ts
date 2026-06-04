"use server";

import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/current-user";
import { db, schema } from "@/db";
import { resolveLayout, type DashWidget } from "@/lib/dashboard/layout";

/** Persist the user's Home dashboard layout (sanitized server-side). */
export async function saveDashboardLayoutAction(
  layout: DashWidget[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const clean = resolveLayout(layout);
  await db
    .update(schema.users)
    .set({ dashboardLayout: clean })
    .where(eq(schema.users.id, user.id));
  return { ok: true };
}
