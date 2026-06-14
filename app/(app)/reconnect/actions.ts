"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const { contacts, touches } = schema;

export type LogTouchResult = { ok: true } | { ok: false; error: string };

/**
 * Record a manual touch on a contact and bump last_touch_at — mirrors the
 * wa-agent log_touch tool. Backs the Reconnect cards' "Mark reached out", which
 * resets the contact's cold timer so it drops off the list.
 */
export async function logReconnectTouch(
  contactId: string,
  body: string,
): Promise<LogTouchResult> {
  const user = await requireUser();
  const text = body.trim().slice(0, 2000) || "Reconnected";

  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!c) return { ok: false, error: "Contact not found" };

  const now = new Date();
  await db.insert(touches).values({
    contactId,
    body: text,
    channel: "manual",
    workspaceId: user.workspaceId,
    createdBy: user.id,
  });
  await db
    .update(contacts)
    .set({ lastTouchAt: now, updatedAt: now })
    .where(eq(contacts.id, contactId));

  revalidatePath("/reconnect");
  return { ok: true };
}
