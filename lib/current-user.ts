import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member";
  whatsappPhone: string | null;
};

function devFakeUser() {
  if (process.env.NODE_ENV !== "development") return null;
  if (process.env.AGB_DEV_FAKE_USER !== "1") return null;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "dev@local",
    displayName: "Dev Founder",
  };
}

/**
 * Ensure the user has a row in `users`, an owned workspace, and a membership.
 * Idempotent — safe to call on every request. Returns the resolved workspace id
 * (current_workspace_id, falling back to the user's first owned workspace).
 */
export async function ensureUserAndWorkspace(args: {
  id: string;
  email: string;
  displayName: string;
}): Promise<{
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member";
  whatsappPhone: string | null;
}> {
  // 1. Upsert user row.
  await db
    .insert(schema.users)
    .values({
      id: args.id,
      email: args.email,
      displayName: args.displayName,
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { email: args.email, displayName: args.displayName },
    });

  // 2. Read the (now-guaranteed) user row.
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, args.id))
    .limit(1);

  // 3. If current_workspace_id is set and membership exists → use it.
  if (u?.currentWorkspaceId) {
    const [member] = await db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, args.id))
      .limit(1);
    if (member && member.workspaceId === u.currentWorkspaceId) {
      return {
        workspaceId: u.currentWorkspaceId,
        workspaceRole: member.role,
        whatsappPhone: u.whatsappPhone ?? null,
      };
    }
  }

  // 4. Otherwise pick the first membership (if any).
  const [existingMembership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, args.id))
    .limit(1);

  if (existingMembership) {
    await db
      .update(schema.users)
      .set({ currentWorkspaceId: existingMembership.workspaceId })
      .where(eq(schema.users.id, args.id));
    return {
      workspaceId: existingMembership.workspaceId,
      workspaceRole: existingMembership.role,
      whatsappPhone: u?.whatsappPhone ?? null,
    };
  }

  // 5. No workspace at all → create one and make this user the owner.
  const wsName = `${args.displayName.split(" ")[0] || "My"}'s Workspace`;
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: wsName, createdBy: args.id })
    .returning();
  await db.insert(schema.workspaceMembers).values({
    workspaceId: ws.id,
    userId: args.id,
    role: "owner",
  });
  await db
    .update(schema.users)
    .set({ currentWorkspaceId: ws.id })
    .where(eq(schema.users.id, args.id));

  return {
    workspaceId: ws.id,
    workspaceRole: "owner",
    whatsappPhone: u?.whatsappPhone ?? null,
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const fake = devFakeUser();
  let base: { id: string; email: string; displayName: string } | null = null;

  if (fake) {
    base = fake;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Founder";
    base = { id: user.id, email: user.email ?? "", displayName };
  }

  const ws = await ensureUserAndWorkspace(base);
  return {
    ...base,
    workspaceId: ws.workspaceId,
    workspaceRole: ws.workspaceRole,
    whatsappPhone: ws.whatsappPhone,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
