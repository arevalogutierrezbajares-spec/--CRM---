"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { nigoDisplayName } from "@/lib/nigo-brand";
import { sendEmail, isResendConfigured } from "@/lib/resend";

const { workspaces, workspaceMembers, workspaceInvites, users } = schema;

const INVITE_TTL_DAYS = 14;
const EMAIL_SCHEMA = z.string().email().max(254);

export type WorkspaceMemberRow = {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  whatsappPhone: string | null;
  joinedAt: Date;
};

export type WorkspaceInviteRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  invitedBy: string;
  inviterName: string | null;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  token: string;
};

export type WorkspaceView = {
  workspace: {
    id: string;
    name: string;
    createdBy: string;
    countdownTitle: string | null;
    countdownDate: string | null;
    countdownSubpoints: string[];
  };
  myRole: "owner" | "admin" | "member";
  members: WorkspaceMemberRow[];
  invites: WorkspaceInviteRow[];
};

export async function getWorkspaceView(): Promise<WorkspaceView> {
  const user = await requireUser();

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, user.workspaceId))
    .limit(1);
  if (!ws) throw new Error("Workspace not found");

  const memberRows = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      email: users.email,
      displayName: users.displayName,
      whatsappPhone: users.whatsappPhone,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ws.id));

  const inviteRows = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      invitedBy: workspaceInvites.invitedBy,
      acceptedAt: workspaceInvites.acceptedAt,
      expiresAt: workspaceInvites.expiresAt,
      createdAt: workspaceInvites.createdAt,
      token: workspaceInvites.token,
      inviterName: users.displayName,
    })
    .from(workspaceInvites)
    .leftJoin(users, eq(users.id, workspaceInvites.invitedBy))
    .where(eq(workspaceInvites.workspaceId, ws.id));

  return {
    workspace: ws,
    myRole: user.workspaceRole,
    members: memberRows.map((m) => ({
      ...m,
      displayName: nigoDisplayName(m.userId, m.displayName),
    })),
    invites: inviteRows,
  };
}

export async function setCountdownConfig(formData: FormData) {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false as const, error: "Not authorized" };
  }
  const title = String(formData.get("countdown_title") ?? "").trim().slice(0, 120) || null;
  const dateRaw = String(formData.get("countdown_date") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const subpoints = String(formData.get("countdown_subpoints") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  await db
    .update(workspaces)
    .set({ countdownTitle: title, countdownDate: date, countdownSubpoints: subpoints })
    .where(eq(workspaces.id, user.workspaceId));
  revalidatePath("/workspace");
  revalidatePath("/");
  return { ok: true as const };
}

export async function renameWorkspace(formData: FormData) {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false as const, error: "Not authorized" };
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { ok: false as const, error: "Name required" };
  await db
    .update(workspaces)
    .set({ name })
    .where(eq(workspaces.id, user.workspaceId));
  revalidatePath("/workspace");
  return { ok: true as const };
}

export async function inviteMember(formData: FormData) {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false as const, error: "Not authorized" };
  }

  const emailParse = EMAIL_SCHEMA.safeParse(
    String(formData.get("email") ?? "").trim().toLowerCase(),
  );
  if (!emailParse.success) {
    return { ok: false as const, error: "Invalid email" };
  }
  const role = (String(formData.get("role") ?? "member") as
    | "admin"
    | "member") === "admin"
    ? "admin"
    : "member";

  const email = emailParse.data;

  // If they already have an account *and* are already a member, no-op.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, user.workspaceId),
          eq(workspaceMembers.userId, existingUser.id),
        ),
      )
      .limit(1);
    if (existingMember) {
      return { ok: false as const, error: "Already a member" };
    }
    // Add them directly — they have an account.
    await db.insert(workspaceMembers).values({
      workspaceId: user.workspaceId,
      userId: existingUser.id,
      role,
    });
    revalidatePath("/workspace");
    return { ok: true as const, mode: "added" as const };
  }

  // Otherwise create an invite token they can redeem on signup.
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
  await db
    .insert(workspaceInvites)
    .values({
      workspaceId: user.workspaceId,
      email,
      role,
      invitedBy: user.id,
      token,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [workspaceInvites.workspaceId, workspaceInvites.email],
      set: { role, invitedBy: user.id, token, expiresAt, acceptedAt: null },
    });

  // Get workspace name + inviter display name for the email body
  const [ws] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, user.workspaceId))
    .limit(1);

  // Build the absolute accept URL from request headers (works on any deployment)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const acceptUrl = `${proto}://${host}/accept?token=${encodeURIComponent(token)}`;

  // Try to send the invite email. If Resend isn't configured (local dev),
  // silently degrade — the token is still in the workspace_invites row and
  // visible in the Pending invites list, so owner can copy/share manually.
  let emailSent = false;
  if (isResendConfigured()) {
    const wsName = ws?.name ?? "the workspace";
    const subj = `${user.displayName} invited you to join ${wsName}`;
    const html = [
      `<h2>${user.displayName} invited you to join ${wsName}</h2>`,
      `<p>You're invited as a <strong>${role}</strong> on the AGB CRM workspace <strong>${wsName}</strong>.</p>`,
      `<p style="text-align:center;margin:24px 0;">`,
      `  <a href="${acceptUrl}" style="display:inline-block;background:#1A1A1A;color:#FFF;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Accept invite</a>`,
      `</p>`,
      `<p style="font-size:12px;color:#666;">Or paste this link in your browser: ${acceptUrl}</p>`,
      `<p style="font-size:12px;color:#666;">This invite expires in ${INVITE_TTL_DAYS} days.</p>`,
    ].join("\n");
    const text = `${user.displayName} invited you to join ${wsName}.\n\nAccept: ${acceptUrl}\n\nThis invite expires in ${INVITE_TTL_DAYS} days.`;
    const result = await sendEmail({ to: email, subject: subj, html, text });
    emailSent = result.ok;
  }

  revalidatePath("/workspace");
  return { ok: true as const, mode: "invited" as const, token, emailSent, acceptUrl };
}

export async function revokeInvite(formData: FormData) {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false as const, error: "Not authorized" };
  }
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return { ok: false as const, error: "Missing invite id" };
  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/workspace");
  return { ok: true as const };
}

export async function removeMember(formData: FormData) {
  const user = await requireUser();
  if (user.workspaceRole !== "owner") {
    return { ok: false as const, error: "Only the owner can remove members" };
  }
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false as const, error: "Missing user id" };
  if (userId === user.id) {
    return { ok: false as const, error: "Can't remove yourself" };
  }
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, user.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    );
  revalidatePath("/workspace");
  return { ok: true as const };
}

/**
 * Redeem an invite token. The caller must already be authenticated — we use
 * their auth.id + email to match the invite. On success the user becomes a
 * member of the inviting workspace and that workspace is set as their
 * current_workspace_id.
 */
export async function acceptInvite(token: string) {
  const user = await requireUser();
  if (!token) return { ok: false as const, error: "Missing token" };

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  if (!invite) return { ok: false as const, error: "Invite not found" };
  if (invite.acceptedAt) {
    return { ok: false as const, error: "Invite already accepted" };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "Invite expired" };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false as const,
      error: `This invite is for ${invite.email}. Sign in as that user.`,
    };
  }

  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role,
    })
    .onConflictDoNothing();
  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvites.id, invite.id));
  await db
    .update(users)
    .set({ currentWorkspaceId: invite.workspaceId })
    .where(eq(users.id, user.id));

  revalidatePath("/workspace");
  return { ok: true as const, workspaceId: invite.workspaceId };
}
