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
  addExpectedGuest,
  createPartnerRoomForContact,
  createPartnerShare,
  getPartnerRoomBasic,
  listShareableDocsForRoom,
  recordPartnerShareTracking,
  regeneratePartnerRoomAccessToken,
  removeRoomMember,
  setContactLogoUrl,
  setPartnerRoomPasscode,
  setPartnerRoomSeatLimit,
  updatePartnerRoomDetails,
  updatePartnerRoomStatus,
  updatePartnerSharePermissions,
  type ShareableRoomDoc,
} from "@/db/queries/partner-access";
import {
  createPartnerRoomMessage,
  deletePartnerRoomMessage,
} from "@/db/queries/partner-messages";
import { isValidPartnerPasscode } from "@/lib/partner-room-gate.server";
import {
  createPartnerNextStep,
  completePartnerNextStep,
  uncompletePartnerNextStep,
  deletePartnerNextStep,
} from "@/db/queries/partner-next-steps";
import { deletePartnerUpload } from "@/db/queries/partner-uploads";
import { removeObjects } from "@/lib/project-files/storage";

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

export async function createPartnerNextStepAction(opts: {
  roomId: string;
  text: string;
  assignedTo: "owner" | "partner" | "both";
  dueAt?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const text = opts.text.trim();
  if (!text) return { ok: false, error: "Text is required" };

  const dueAt = opts.dueAt ? new Date(opts.dueAt) : null;
  const step = await createPartnerNextStep({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    text,
    assignedTo: opts.assignedTo,
    dueAt,
    sortOrder: 0,
    createdByUser: user.id,
  });

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true, id: step.id };
}

export async function togglePartnerNextStepAction(opts: {
  roomId: string;
  stepId: string;
  complete: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  if (opts.complete) {
    await completePartnerNextStep({ workspaceId: user.workspaceId, roomId: opts.roomId, stepId: opts.stepId, completedBy: "owner" });
  } else {
    await uncompletePartnerNextStep({ workspaceId: user.workspaceId, stepId: opts.stepId });
  }

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

export async function deletePartnerNextStepAction(opts: {
  roomId: string;
  stepId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await deletePartnerNextStep({ workspaceId: user.workspaceId, stepId: opts.stepId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

export async function deletePartnerUploadAction(opts: {
  roomId: string;
  uploadId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await deletePartnerUpload({ workspaceId: user.workspaceId, uploadId: opts.uploadId });
  if (row) await removeObjects([row.storagePath]).catch(() => {});
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

export async function setRoomClientLogoAction(opts: {
  roomId: string;
  contactId: string;
  logoUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const url = opts.logoUrl?.trim() || null;
  if (url) {
    // Accept absolute http(s) URLs or site-relative asset paths (e.g. /logos/x.svg).
    const ok = /^https?:\/\//i.test(url) || url.startsWith("/");
    if (!ok) {
      return { ok: false, error: "Enter an image URL (https://…) or /path" };
    }
    if (url.length > 2048) return { ok: false, error: "That URL is too long" };
  }

  const updated = await setContactLogoUrl({
    workspaceId: user.workspaceId,
    contactId: opts.contactId,
    logoUrl: url,
  });
  if (!updated) return { ok: false, error: "Contact not found" };

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  revalidatePath(`/contacts/${opts.contactId}`);
  return { ok: true };
}

export async function setRoomSeatLimitAction(opts: {
  roomId: string;
  seatLimit: number | null;
}): Promise<PartnerRoomActionResult> {
  const user = await requireUser();

  const seatLimit = opts.seatLimit;
  if (seatLimit !== null) {
    if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 1000) {
      return { ok: false, error: "Enter a seat count between 1 and 1000" };
    }
  }

  const updated = await setPartnerRoomSeatLimit({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    seatLimit,
  });
  if (!updated) return { ok: false, error: "Room not found" };

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true, id: opts.roomId };
}

export async function addExpectedGuestAction(opts: {
  roomId: string;
  name: string;
  roleLabel?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const name = opts.name.trim();
  if (!name) return { ok: false, error: "Enter a name" };

  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };

  const row = await addExpectedGuest({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    name,
    roleLabel: opts.roleLabel,
  });
  if (!row) return { ok: false, error: "Could not add guest" };

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true, id: row.id };
}

export async function removeRoomMemberAction(opts: {
  roomId: string;
  memberId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await removeRoomMember({ workspaceId: user.workspaceId, memberId: opts.memberId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

export async function createPartnerRoomAction(opts: {
  contactId: string;
  partnerKind: string;
  name?: string | null;
}): Promise<
  | { ok: true; roomId: string; accessPath: string | null; existed: boolean }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  if (!PARTNER_KINDS.has(opts.partnerKind as PartnerKind)) {
    return { ok: false, error: "Invalid partner type" };
  }

  const res = await createPartnerRoomForContact({
    workspaceId: user.workspaceId,
    actorId: user.id,
    contactId: opts.contactId,
    partnerKind: opts.partnerKind as PartnerKind,
    name: opts.name,
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return {
    ok: true,
    roomId: res.room.id,
    accessPath: res.accessToken ? `/access/${res.accessToken}` : null,
    existed: res.existed,
  };
}

export async function setPartnerRoomPasscodeAction(opts: {
  roomId: string;
  passcode: string | null;
}): Promise<PartnerRoomActionResult> {
  const user = await requireUser();

  if (opts.passcode !== null && !isValidPartnerPasscode(opts.passcode)) {
    return { ok: false, error: "The code must be exactly 4 digits" };
  }

  const res = await setPartnerRoomPasscode({
    workspaceId: user.workspaceId,
    actorId: user.id,
    roomId: opts.roomId,
    passcode: opts.passcode,
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return { ok: true, id: res.room.id };
}

export async function updateSharePermissionsAction(opts: {
  shareId: string;
  permissions: string[];
}): Promise<PartnerShareResult> {
  const user = await requireUser();
  const permissions = normalizePermissions(opts.permissions);

  const res = await updatePartnerSharePermissions({
    workspaceId: user.workspaceId,
    actorId: user.id,
    shareId: opts.shareId,
    permissions,
  });

  if (!res.ok) return res;

  if (res.contactId) revalidatePath(`/contacts/${res.contactId}`);
  if (res.roomId) revalidatePath(`/partner-access/rooms/${res.roomId}`);
  revalidatePath("/partner-access");
  return { ok: true, id: res.id, roomId: res.roomId ?? "" };
}

export async function listShareableRoomDocsAction(opts: {
  roomId: string;
}): Promise<
  { ok: true; docs: ShareableRoomDoc[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };

  const docs = await listShareableDocsForRoom({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  return { ok: true, docs };
}

export async function addRoomDocumentsAction(opts: {
  roomId: string;
  items: Array<{ linkId: string; lobId: string }>;
  allowDownload: boolean;
}): Promise<
  { ok: true; added: number; failed: number } | { ok: false; error: string }
> {
  const user = await requireUser();
  if (opts.items.length === 0) {
    return { ok: false, error: "Pick at least one document" };
  }

  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };
  if (room.status === "revoked") {
    return { ok: false, error: "Revoked rooms cannot receive documents" };
  }
  if (!room.primaryContactId) {
    return { ok: false, error: "This room has no contact attached" };
  }

  const permissions: PartnerPermission[] = opts.allowDownload
    ? ["view", "download"]
    : ["view"];

  let added = 0;
  let lastError: string | null = null;
  for (const item of opts.items) {
    const res = await createPartnerShare({
      workspaceId: user.workspaceId,
      actorId: user.id,
      projectId: item.lobId,
      projectLinkId: item.linkId,
      contactId: room.primaryContactId,
      partnerKind: room.partnerKind as PartnerKind,
      channel: "manual",
      permissions,
      roomId: room.id,
      preserveExistingShare: true,
    });
    if (res.ok) added++;
    else lastError = res.error;
  }

  if (added === 0) {
    return { ok: false, error: lastError ?? "Could not add documents" };
  }

  revalidatePartnerRoom(room.id, room.primaryContactId);
  const failed = opts.items.length - added;
  return { ok: true, added, failed };
}

export async function createRoomMessageAction(opts: {
  roomId: string;
  body: string;
}): Promise<
  | {
      ok: true;
      message: {
        id: string;
        body: string;
        authorKind: string;
        authorName: string | null;
        createdAt: string;
      };
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };

  const message = await createPartnerRoomMessage({
    workspaceId: user.workspaceId,
    roomId: room.id,
    authorKind: "owner",
    authorUserId: user.id,
    authorName: user.displayName ?? user.email,
    body: opts.body,
  });

  if (!message) return { ok: false, error: "Write a message first" };

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return {
    ok: true,
    message: {
      id: message.id,
      body: message.body,
      authorKind: message.authorKind,
      authorName: message.authorName,
      createdAt: message.createdAt.toISOString(),
    },
  };
}

export async function deleteRoomMessageAction(opts: {
  roomId: string;
  messageId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await deletePartnerRoomMessage({
    workspaceId: user.workspaceId,
    messageId: opts.messageId,
  });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}
