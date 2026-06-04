import "server-only";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** WhatsApp phone numbers for the given users, fenced to workspace membership. */
export async function getMemberPhones(
  workspaceId: string,
  userIds: string[],
): Promise<{ userId: string; phone: string }[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ userId: schema.users.id, phone: schema.users.whatsappPhone })
    .from(schema.users)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        inArray(schema.users.id, userIds),
      ),
    );
  return rows.filter((r): r is { userId: string; phone: string } => Boolean(r.phone));
}

export type TeamMember = {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member";
  lastSeenAt: Date | null;
};

/** All members of a workspace with their role + last-seen, owners first. */
export async function listWorkspaceMembers(workspaceId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      role: schema.workspaceMembers.role,
      lastSeenAt: schema.users.lastSeenAt,
      joinedAt: schema.workspaceMembers.joinedAt,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(schema.workspaceMembers.joinedAt));

  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    email: r.email,
    role: r.role,
    lastSeenAt: r.lastSeenAt ?? null,
  }));
}

/** Fuzzy-match workspace teammates by name → {userId, displayName}. Used by the
 *  WhatsApp agent (find_member) to resolve an assignee from a name. */
export async function findMembers(opts: {
  workspaceId: string;
  query?: string;
  limit?: number;
}): Promise<{ userId: string; displayName: string }[]> {
  const conds = [eq(schema.workspaceMembers.workspaceId, opts.workspaceId)];
  const q = opts.query?.trim();
  if (q) conds.push(ilike(schema.users.displayName, `%${q}%`));
  return db
    .select({ userId: schema.users.id, displayName: schema.users.displayName })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(and(...conds))
    .orderBy(asc(schema.users.displayName))
    .limit(opts.limit ?? 10);
}
