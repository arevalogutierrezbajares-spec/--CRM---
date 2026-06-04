import "server-only";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

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
