"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  createPitchFeedbackInvite,
  createPitchFeedbackInviteInsight,
  ensureDefaultPitchFeedbackCampaign,
  markPitchFeedbackInviteSent,
  revokePitchFeedbackInvite,
} from "@/db/queries/pitch-feedback";

type ActionResult =
  | { ok: true; id: string; accessPath?: string | null }
  | { ok: false; error: string };

const CHANNELS = new Set(["email", "whatsapp", "signal", "link", "manual"]);

function parseExpiresAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createPitchFeedbackInviteAction(opts: {
  contactId: string;
  campaignId?: string | null;
  channel?: string | null;
  expiresAt?: string | null;
  welcomeNote?: string | null;
  sendMessage?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const channel = CHANNELS.has(opts.channel ?? "")
    ? (opts.channel as "email" | "whatsapp" | "signal" | "link" | "manual")
    : "manual";

  await ensureDefaultPitchFeedbackCampaign({
    workspaceId: user.workspaceId,
    actorId: user.id,
  });

  const result = await createPitchFeedbackInvite({
    workspaceId: user.workspaceId,
    actorId: user.id,
    contactId: opts.contactId,
    campaignId: opts.campaignId,
    channel,
    expiresAt: parseExpiresAt(opts.expiresAt),
    welcomeNote: opts.welcomeNote,
    sendMessage: opts.sendMessage,
  });

  if (!result.ok) return result;

  revalidatePath("/pitch-feedback");
  revalidatePath(`/contacts/${opts.contactId}`);
  return {
    ok: true,
    id: result.invite.id,
    accessPath: `/f/${result.token}`,
  };
}

export async function markPitchFeedbackInviteSentAction(opts: {
  inviteId: string;
  contactId: string;
  channel: string;
  message?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!CHANNELS.has(opts.channel)) {
    return { ok: false, error: "Invalid channel" };
  }

  const result = await markPitchFeedbackInviteSent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    inviteId: opts.inviteId,
    channel: opts.channel as "email" | "whatsapp" | "signal" | "link" | "manual",
    message: opts.message,
  });

  if (!result.ok) return result;
  revalidatePath("/pitch-feedback");
  revalidatePath(`/pitch-feedback/invites/${opts.inviteId}`);
  revalidatePath(`/contacts/${opts.contactId}`);
  return { ok: true, id: result.invite.id };
}

export async function revokePitchFeedbackInviteAction(opts: {
  inviteId: string;
  contactId: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const result = await revokePitchFeedbackInvite({
    workspaceId: user.workspaceId,
    actorId: user.id,
    inviteId: opts.inviteId,
  });

  if (!result.ok) return result;
  revalidatePath("/pitch-feedback");
  revalidatePath(`/pitch-feedback/invites/${opts.inviteId}`);
  revalidatePath(`/contacts/${opts.contactId}`);
  return { ok: true, id: result.invite.id };
}

export async function regeneratePitchFeedbackInsightAction(opts: {
  inviteId: string;
  contactId?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const result = await createPitchFeedbackInviteInsight({
    workspaceId: user.workspaceId,
    inviteId: opts.inviteId,
    actorId: user.id,
  });

  if (!result.ok) return result;
  revalidatePath("/pitch-feedback");
  revalidatePath(`/pitch-feedback/invites/${opts.inviteId}`);
  if (opts.contactId) revalidatePath(`/contacts/${opts.contactId}`);
  return { ok: true, id: result.insight.id };
}
