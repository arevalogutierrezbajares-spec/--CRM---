"use server";

import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/current-user";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** Heartbeat — stamp the current user's last-seen. Called from the app shell. */
export async function heartbeatAction(): Promise<void> {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.users.id, user.id));
}
