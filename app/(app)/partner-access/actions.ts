"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  PARTNER_KIND_OPTIONS,
  PARTNER_PERMISSION_OPTIONS,
  PARTNER_ROOM_STATUS_OPTIONS,
  PARTNER_SHARE_CHANNEL_OPTIONS,
  type PartnerKind,
  type PartnerPermission,
  type PartnerRoomStatus,
  type PartnerShareChannel,
} from "@/lib/partner-access";
import {
  createPartnerShare,
  recordPartnerShareTracking,
  regeneratePartnerRoomAccessToken,
  updatePartnerRoomDetails,
  updatePartnerRoomStatus,
} from "@/db/queries/partner-access";

export type PartnerShareResult =
  | { ok: true; id: string; roomId: string; accessPath?: string | null }
  | { ok: false; error: string };

export type PartnerRoomActionResult =
  | { ok: true; id: string; accessPath?: string | null }
  | { ok: false; error: string };

const PARTNER_KINDS = new Set(PARTNER_KIND_OPTIONS.map((option) => option.value));
const CHANNELS = new Set(PARTNER_SHARE_CHANNEL_OPTIONS.map((option) => option.value));
const PERMISSIONS = new Set(PARTNER_PERMISSION_OPTIONS.map((option) => option.value));
const ROOM_STATUSES = new Set(
  PARTNER_ROOM_STATUS_OPTIONS.map((option) => option.value),
);

function normalizePermissions(values: string[]): PartnerPermission[] {
  const cleaned = values.filter((value): value is PartnerPermission =>
    PERMISSIONS.has(value as PartnerPermission),
  );
  return Array.from(new Set<PartnerPermission>(["view", ...cleaned]));
}

function parseExpiresAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidatePartnerRoom(roomId: string, contactId?: string | null) {
  revalidatePath("/partner-access");
  revalidatePath(`/partner-access/rooms/${roomId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

export async function shareProjectLinkAction(opts: {
  projectId: string;
  projectLinkId: string;
  contactId: string;
  partnerKind: string;
  channel: string;
  permissions: string[];
  message?: string | null;
  expiresAt?: string | null;
}): Promise<PartnerShareResult> {
  const user = await requireUser();

  if (!PARTNER_KINDS.has(opts.partnerKind as PartnerKind)) {
    return { ok: false, error: "Invalid partner type" };
  }
  if (!CHANNELS.has(opts.channel as PartnerShareChannel)) {
    return { ok: false, error: "Invalid channel" };
  }

  const permissions = normalizePermissions(opts.permissions);
  const res = await createPartnerShare({
    workspaceId: user.workspaceId,
    actorId: user.id,
    projectId: opts.projectId,
    projectLinkId: opts.projectLinkId,
    contactId: opts.contactId,
    partnerKind: opts.partnerKind as PartnerKind,
    channel: opts.channel as PartnerShareChannel,
    permissions,
    message: opts.message,
    expiresAt: parseExpiresAt(opts.expiresAt),
  });

  if (!res.ok) return res;

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath(`/contacts/${opts.contactId}`);
  revalidatePath("/partner-access");
  return {
    ok: true,
    id: res.share.id,
    roomId: res.room.id,
    accessPath: res.accessToken ? `/access/${res.accessToken}` : null,
  };
}

export async function trackPartnerShareAction(opts: {
  shareId: string;
  event: "viewed" | "downloaded" | "revoked";
}): Promise<PartnerShareResult> {
  const user = await requireUser();
  const res = await recordPartnerShareTracking({
    workspaceId: user.workspaceId,
    actorId: user.id,
    shareId: opts.shareId,
    event: opts.event,
  });

  if (!res.ok) return res;

  if (res.contactId) revalidatePath(`/contacts/${res.contactId}`);
  if (res.projectId) revalidatePath(`/projects/${res.projectId}`);
  if (res.roomId) revalidatePath(`/partner-access/rooms/${res.roomId}`);
  revalidatePath("/partner-access");
  return { ok: true, id: res.id, roomId: res.roomId ?? "" };
}

export async function updatePartnerRoomDetailsAction(opts: {
  roomId: string;
  name: string;
  partnerKind: string;
  summary?: string | null;
  welcomeMessage?: string | null;
  expiresAt?: string | null;
}): Promise<PartnerRoomActionResult> {
  const user = await requireUser();

  if (!PARTNER_KINDS.has(opts.partnerKind as PartnerKind)) {
    return { ok: false, error: "Invalid partner type" };
  }

  const res = await updatePartnerRoomDetails({
    workspaceId: user.workspaceId,
    actorId: user.id,
    roomId: opts.roomId,
    name: opts.name,
    partnerKind: opts.partnerKind as PartnerKind,
    summary: opts.summary,
    welcomeMessage: opts.welcomeMessage,
    expiresAt: parseExpiresAt(opts.expiresAt),
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return { ok: true, id: res.room.id };
}

export async function updatePartnerRoomStatusAction(opts: {
  roomId: string;
  status: string;
}): Promise<PartnerRoomActionResult> {
  const user = await requireUser();

  if (!ROOM_STATUSES.has(opts.status as PartnerRoomStatus)) {
    return { ok: false, error: "Invalid room status" };
  }

  const res = await updatePartnerRoomStatus({
    workspaceId: user.workspaceId,
    actorId: user.id,
    roomId: opts.roomId,
    status: opts.status as PartnerRoomStatus,
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return { ok: true, id: res.room.id };
}

export async function regeneratePartnerRoomAccessLinkAction(opts: {
  roomId: string;
}): Promise<PartnerRoomActionResult> {
  const user = await requireUser();
  const res = await regeneratePartnerRoomAccessToken({
    workspaceId: user.workspaceId,
    actorId: user.id,
    roomId: opts.roomId,
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return {
    ok: true,
    id: res.room.id,
    accessPath: `/access/${res.accessToken}`,
  };
}
