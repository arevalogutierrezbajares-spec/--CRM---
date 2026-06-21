"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/current-user";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { listWorkspaceMembers } from "@/db/queries/team";
import { founderProfileFor } from "@/lib/founder-photos";

/** Heartbeat — stamp the current user's last-seen. Called from the app shell. */
export async function heartbeatAction(): Promise<void> {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.users.id, user.id));
}

/**
 * Last-seen for the founders, keyed by canonical name — powers the "last seen…"
 * tooltip on offline presence bubbles. Live online state comes from the
 * realtime presence channel; this only fills in the offline timestamps.
 */
export async function listFounderLastSeenAction(): Promise<
  { name: string; lastSeenAt: string | null }[]
> {
  const user = await requireUser();
  const members = await listWorkspaceMembers(user.workspaceId);
  const out: { name: string; lastSeenAt: string | null }[] = [];
  for (const m of members) {
    const founder = founderProfileFor(m.displayName, m.email);
    if (founder) {
      out.push({
        name: founder.displayName,
        lastSeenAt: m.lastSeenAt ? m.lastSeenAt.toISOString() : null,
      });
    }
  }
  return out;
}

/**
 * Remove a teammate from the workspace and revoke their access. Deletes their
 * membership, kills any pending invite for their email (so they can't
 * auto-rejoin), and clears their current-workspace pointer if it was this one —
 * so on their next request they're booted to a fresh empty workspace with no
 * access to this team's data. (Their login still works; they just can't see
 * this workspace anymore.)
 */
export async function removeMemberAction(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireUser();
  if (actor.workspaceRole !== "owner" && actor.workspaceRole !== "admin")
    return { ok: false, error: "Only owners or admins can remove members." };
  if (userId === actor.id) return { ok: false, error: "You can't remove yourself." };

  const wsId = actor.workspaceId;
  const [target] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaceMembers.workspaceId, wsId)),
    )
    .limit(1);
  if (!target) return { ok: false, error: "That person isn't a member of this workspace." };
  if (target.role === "owner") return { ok: false, error: "The workspace owner can't be removed." };
  if (target.role === "admin" && actor.workspaceRole !== "owner")
    return { ok: false, error: "Only the owner can remove an admin." };

  const [u] = await db
    .select({ email: schema.users.email, currentWorkspaceId: schema.users.currentWorkspaceId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await t
      .delete(schema.workspaceMembers)
      .where(
        and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaceMembers.workspaceId, wsId)),
      );
    if (u?.email)
      await t
        .delete(schema.workspaceInvites)
        .where(
          and(
            eq(schema.workspaceInvites.workspaceId, wsId),
            ilike(schema.workspaceInvites.email, u.email),
            isNull(schema.workspaceInvites.acceptedAt),
          ),
        );
    if (u?.currentWorkspaceId === wsId)
      await t
        .update(schema.users)
        .set({ currentWorkspaceId: null })
        .where(eq(schema.users.id, userId));
  });

  revalidatePath("/team");
  return { ok: true };
}
