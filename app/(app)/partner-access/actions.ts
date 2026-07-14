"use server";

import { revalidatePath } from "next/cache";
import { withActionGuard } from "@/lib/server-action-guard";
import { requireUser } from "@/lib/current-user";
import {
  PARTNER_KIND_OPTIONS,
  PARTNER_PERMISSION_OPTIONS,
  PARTNER_ROOM_STATUS_OPTIONS,
  PARTNER_SHARE_CHANNEL_OPTIONS,
  REPO_SECTION_VALUES,
  type PartnerKind,
  type PartnerPermission,
  type PartnerRoomStatus,
  type PartnerShareChannel,
} from "@/lib/partner-access";
import { resolveRoomLocale } from "@/lib/partner-room-i18n";
import { roomHeroVideo } from "@/lib/partner-room-videos";
import {
  addExpectedGuest,
  addRoomTeamMember,
  createPartnerRoomForContact,
  createPartnerShare,
  getPartnerRoomBasic,
  listShareableDocsForContact,
  listShareableDocsForRoom,
  recordPartnerShareTracking,
  regeneratePartnerRoomAccessToken,
  removeRoomMember,
  removeRoomTeamMember,
  setPartnerShareRoomSection,
  setRoomBrandLobIds,
  setRoomDemoLink,
  setRoomHeroVideo,
  updateContactLogo,
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
import {
  addItemComment,
  createRoomItem,
  deleteItemComment,
  deleteRoomItem,
  updateRoomItem,
} from "@/db/queries/partner-repository";
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

async function _shareProjectLinkAction(opts: {
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

async function _trackPartnerShareAction(opts: {
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

async function _updatePartnerRoomDetailsAction(opts: {
  roomId: string;
  name: string;
  partnerKind: string;
  language?: string | null;
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
    locale: opts.language ? resolveRoomLocale(opts.language) : undefined,
    summary: opts.summary,
    welcomeMessage: opts.welcomeMessage,
    expiresAt: parseExpiresAt(opts.expiresAt),
  });

  if (!res.ok) return res;

  revalidatePartnerRoom(res.room.id, res.room.primaryContactId);
  return { ok: true, id: res.room.id };
}

async function _updatePartnerRoomStatusAction(opts: {
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

async function _regeneratePartnerRoomAccessLinkAction(opts: {
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

async function _createPartnerNextStepAction(opts: {
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

async function _togglePartnerNextStepAction(opts: {
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

async function _deletePartnerNextStepAction(opts: {
  roomId: string;
  stepId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await deletePartnerNextStep({ workspaceId: user.workspaceId, stepId: opts.stepId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _deletePartnerUploadAction(opts: {
  roomId: string;
  uploadId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await deletePartnerUpload({ workspaceId: user.workspaceId, uploadId: opts.uploadId });
  if (row) await removeObjects([row.storagePath]).catch(() => {});
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _setRoomClientLogoAction(opts: {
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

  const updated = await updateContactLogo({
    workspaceId: user.workspaceId,
    contactId: opts.contactId,
    logoUrl: url,
    logoStoragePath: null,
  });
  if (!updated) return { ok: false, error: "Contact not found" };
  if (updated.previousPath) {
    await removeObjects([updated.previousPath]).catch(() => {});
  }

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  revalidatePath(`/contacts/${opts.contactId}`);
  return { ok: true };
}

async function _setRoomSeatLimitAction(opts: {
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

async function _addExpectedGuestAction(opts: {
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

async function _removeRoomMemberAction(opts: {
  roomId: string;
  memberId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await removeRoomMember({ workspaceId: user.workspaceId, memberId: opts.memberId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

/** Normalize a repository-section input: preset value or null (default section). */
function parseRepoSection(value: string | null | undefined): string | null {
  return value && REPO_SECTION_VALUES.has(value) ? value : null;
}

async function _addRoomLinkAction(opts: {
  roomId: string;
  title: string;
  url: string;
  description?: string | null;
  category?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const title = opts.title.trim();
  const url = opts.url.trim();
  if (!title) return { ok: false, error: "Add a title" };
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Enter a valid URL (https://…)" };

  const room = await getPartnerRoomBasic({ workspaceId: user.workspaceId, roomId: opts.roomId });
  if (!room) return { ok: false, error: "Room not found" };

  const item = await createRoomItem({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    kind: "link",
    title,
    url,
    description: opts.description ?? null,
    category: parseRepoSection(opts.category),
    addedBy: user.id,
  });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true, id: item.id };
}

async function _updateRoomItemAction(opts: {
  roomId: string;
  itemId: string;
  title?: string;
  description?: string | null;
  category?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (opts.title !== undefined && !opts.title.trim()) {
    return { ok: false, error: "Title can't be empty" };
  }
  const row = await updateRoomItem({
    workspaceId: user.workspaceId,
    itemId: opts.itemId,
    title: opts.title,
    description: opts.description,
    category:
      opts.category === undefined ? undefined : parseRepoSection(opts.category),
  });
  if (!row) return { ok: false, error: "Item not found" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _setShareRoomSectionAction(opts: {
  roomId: string;
  shareId: string;
  section: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await setPartnerShareRoomSection({
    workspaceId: user.workspaceId,
    shareId: opts.shareId,
    roomSection: parseRepoSection(opts.section),
  });
  if (!row) return { ok: false, error: "Share not found" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _setRoomHeroVideoAction(opts: {
  roomId: string;
  heroVideoKey: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (opts.heroVideoKey !== null && !roomHeroVideo(opts.heroVideoKey)) {
    return { ok: false, error: "Unknown video" };
  }
  const row = await setRoomHeroVideo({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    heroVideoKey: opts.heroVideoKey,
  });
  if (!row) return { ok: false, error: "Room not found" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _setRoomDemoLinkAction(opts: {
  roomId: string;
  demoLinkId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await setRoomDemoLink({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    demoLinkId: opts.demoLinkId,
  });
  if (!row) return { ok: false, error: "Room not found" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _deleteRoomItemAction(opts: {
  roomId: string;
  itemId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await deleteRoomItem({ workspaceId: user.workspaceId, itemId: opts.itemId });
  if (row?.storagePath) await removeObjects([row.storagePath]).catch(() => {});
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _addRoomCommentAction(opts: {
  roomId: string;
  targetKind: "share" | "item";
  targetId: string;
  body: string;
}): Promise<
  | {
      ok: true;
      comment: {
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
  const room = await getPartnerRoomBasic({ workspaceId: user.workspaceId, roomId: opts.roomId });
  if (!room) return { ok: false, error: "Room not found" };

  const comment = await addItemComment({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    targetKind: opts.targetKind,
    targetId: opts.targetId,
    authorKind: "owner",
    authorUserId: user.id,
    authorName: user.displayName ?? user.email,
    body: opts.body,
  });
  if (!comment) return { ok: false, error: "Write a comment first" };

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return {
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      authorKind: comment.authorKind,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
    },
  };
}

async function _deleteRoomCommentAction(opts: {
  roomId: string;
  commentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await deleteItemComment({ workspaceId: user.workspaceId, commentId: opts.commentId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _setRoomBrandLogosAction(opts: {
  roomId: string;
  brandLobIds: string[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const ids =
    opts.brandLobIds && opts.brandLobIds.length > 0
      ? Array.from(new Set(opts.brandLobIds)).slice(0, 12)
      : null;
  const updated = await setRoomBrandLobIds({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    brandLobIds: ids,
  });
  if (!updated) return { ok: false, error: "Room not found" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _assignRoomTeamMemberAction(opts: {
  roomId: string;
  userId: string;
  title?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const room = await getPartnerRoomBasic({ workspaceId: user.workspaceId, roomId: opts.roomId });
  if (!room) return { ok: false, error: "Room not found" };

  const row = await addRoomTeamMember({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    userId: opts.userId,
    title: opts.title,
  });
  if (!row) return { ok: false, error: "That teammate isn't in your workspace" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _removeRoomTeamMemberAction(opts: {
  roomId: string;
  teamId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  await removeRoomTeamMember({ workspaceId: user.workspaceId, teamId: opts.teamId });
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

async function _createPartnerRoomAction(opts: {
  contactId: string;
  partnerKind: string;
  language?: string | null;
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
    locale: resolveRoomLocale(opts.language),
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

async function _setPartnerRoomPasscodeAction(opts: {
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

async function _updateSharePermissionsAction(opts: {
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

async function _listShareableRoomDocsAction(opts: {
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

async function _addRoomDocumentsAction(opts: {
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

async function _listShareableDocsForContactAction(opts: {
  contactId: string;
}): Promise<
  { ok: true; docs: ShareableRoomDoc[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  const docs = await listShareableDocsForContact({
    workspaceId: user.workspaceId,
    contactId: opts.contactId,
  });
  return { ok: true, docs };
}

/**
 * One-tap "Share materials" from a contact: create (or reuse) the contact's
 * ungated, no-login room, attach the picked documents, and hand back a private
 * link. The room is the lite default — no passcode, no seat limit — so the
 * recipient taps the link and views on their phone. Every open/view/download is
 * tracked automatically (recordPublicPartnerShareEvent), so feedback stays
 * optional while engagement is always captured.
 */
async function _quickShareWithContactAction(opts: {
  contactId: string;
  partnerKind?: string | null;
  docs: Array<{ linkId: string; lobId: string }>;
  allowDownload: boolean;
  channel: string;
  message?: string | null;
  freshLink?: boolean;
}): Promise<
  | {
      ok: true;
      roomId: string;
      accessPath: string | null;
      added: number;
      existed: boolean;
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  if (opts.docs.length === 0) {
    return { ok: false, error: "Pick at least one document" };
  }
  if (!CHANNELS.has(opts.channel as PartnerShareChannel)) {
    return { ok: false, error: "Invalid channel" };
  }
  const partnerKind = (
    opts.partnerKind && PARTNER_KINDS.has(opts.partnerKind as PartnerKind)
      ? opts.partnerKind
      : "client"
  ) as PartnerKind;
  const permissions: PartnerPermission[] = opts.allowDownload
    ? ["view", "download"]
    : ["view"];

  let roomId: string | undefined;
  let mintedToken: string | null = null;
  let added = 0;
  let lastError: string | null = null;

  for (const doc of opts.docs) {
    const res = await createPartnerShare({
      workspaceId: user.workspaceId,
      actorId: user.id,
      projectId: doc.lobId,
      projectLinkId: doc.linkId,
      contactId: opts.contactId,
      partnerKind,
      channel: opts.channel as PartnerShareChannel,
      permissions,
      message: opts.message ?? null,
      roomId,
      preserveExistingShare: true,
    });
    if (!res.ok) {
      lastError = res.error;
      continue;
    }
    // First successful share fixes the room; a token comes back only when the
    // room (or its link) was freshly created.
    if (!roomId) {
      roomId = res.room.id;
      mintedToken = res.accessToken;
    }
    added++;
  }

  if (!roomId || added === 0) {
    return { ok: false, error: lastError ?? "Could not share these documents" };
  }

  const existed = mintedToken === null;
  let accessPath: string | null = mintedToken ? `/access/${mintedToken}` : null;

  // An existing room's raw token can't be recovered (only the hash is stored),
  // so a fresh shareable URL is issued only when the user opts in — which
  // invalidates any previously-sent link for that room.
  if (existed && opts.freshLink) {
    const regen = await regeneratePartnerRoomAccessToken({
      workspaceId: user.workspaceId,
      actorId: user.id,
      roomId,
    });
    if (regen.ok) accessPath = `/access/${regen.accessToken}`;
  }

  revalidatePath(`/contacts/${opts.contactId}`);
  revalidatePath("/partner-access");
  revalidatePath(`/partner-access/rooms/${roomId}`);
  return { ok: true, roomId, accessPath, added, existed };
}

async function _createRoomMessageAction(opts: {
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

async function _deleteRoomMessageAction(opts: {
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

// Every action is wrapped so an unexpected throw (DB drift, FK violation,
// network) returns { ok: false } instead of crashing to the digest error page.
export const shareProjectLinkAction = withActionGuard("shareProjectLinkAction", _shareProjectLinkAction);
export const trackPartnerShareAction = withActionGuard("trackPartnerShareAction", _trackPartnerShareAction);
export const updatePartnerRoomDetailsAction = withActionGuard("updatePartnerRoomDetailsAction", _updatePartnerRoomDetailsAction);
export const updatePartnerRoomStatusAction = withActionGuard("updatePartnerRoomStatusAction", _updatePartnerRoomStatusAction);
export const regeneratePartnerRoomAccessLinkAction = withActionGuard("regeneratePartnerRoomAccessLinkAction", _regeneratePartnerRoomAccessLinkAction);
export const createPartnerNextStepAction = withActionGuard("createPartnerNextStepAction", _createPartnerNextStepAction);
export const togglePartnerNextStepAction = withActionGuard("togglePartnerNextStepAction", _togglePartnerNextStepAction);
export const deletePartnerNextStepAction = withActionGuard("deletePartnerNextStepAction", _deletePartnerNextStepAction);
export const deletePartnerUploadAction = withActionGuard("deletePartnerUploadAction", _deletePartnerUploadAction);
export const setRoomClientLogoAction = withActionGuard("setRoomClientLogoAction", _setRoomClientLogoAction);
export const setRoomSeatLimitAction = withActionGuard("setRoomSeatLimitAction", _setRoomSeatLimitAction);
export const addExpectedGuestAction = withActionGuard("addExpectedGuestAction", _addExpectedGuestAction);
export const removeRoomMemberAction = withActionGuard("removeRoomMemberAction", _removeRoomMemberAction);
export const addRoomLinkAction = withActionGuard("addRoomLinkAction", _addRoomLinkAction);
export const updateRoomItemAction = withActionGuard("updateRoomItemAction", _updateRoomItemAction);
export const setShareRoomSectionAction = withActionGuard("setShareRoomSectionAction", _setShareRoomSectionAction);
export const setRoomHeroVideoAction = withActionGuard("setRoomHeroVideoAction", _setRoomHeroVideoAction);
export const setRoomDemoLinkAction = withActionGuard("setRoomDemoLinkAction", _setRoomDemoLinkAction);
export const deleteRoomItemAction = withActionGuard("deleteRoomItemAction", _deleteRoomItemAction);
export const addRoomCommentAction = withActionGuard("addRoomCommentAction", _addRoomCommentAction);
export const deleteRoomCommentAction = withActionGuard("deleteRoomCommentAction", _deleteRoomCommentAction);
export const setRoomBrandLogosAction = withActionGuard("setRoomBrandLogosAction", _setRoomBrandLogosAction);
export const assignRoomTeamMemberAction = withActionGuard("assignRoomTeamMemberAction", _assignRoomTeamMemberAction);
export const removeRoomTeamMemberAction = withActionGuard("removeRoomTeamMemberAction", _removeRoomTeamMemberAction);
export const createPartnerRoomAction = withActionGuard("createPartnerRoomAction", _createPartnerRoomAction);
export const setPartnerRoomPasscodeAction = withActionGuard("setPartnerRoomPasscodeAction", _setPartnerRoomPasscodeAction);
export const updateSharePermissionsAction = withActionGuard("updateSharePermissionsAction", _updateSharePermissionsAction);
export const listShareableRoomDocsAction = withActionGuard("listShareableRoomDocsAction", _listShareableRoomDocsAction);
export const listShareableDocsForContactAction = withActionGuard("listShareableDocsForContactAction", _listShareableDocsForContactAction);
export const quickShareWithContactAction = withActionGuard("quickShareWithContactAction", _quickShareWithContactAction);
export const addRoomDocumentsAction = withActionGuard("addRoomDocumentsAction", _addRoomDocumentsAction);
export const createRoomMessageAction = withActionGuard("createRoomMessageAction", _createRoomMessageAction);
export const deleteRoomMessageAction = withActionGuard("deleteRoomMessageAction", _deleteRoomMessageAction);

// ── E-signatures ─────────────────────────────────────────────────────────────

async function _requestSignatureAction(opts: {
  roomId: string;
  targetKind: "share" | "item";
  targetId: string;
  title: string;
  message?: string | null;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };
  const title = opts.title.trim();
  if (!title) return { ok: false, error: "Title is required" };

  const { createSignatureRequest } = await import("@/db/queries/partner-signatures");
  const result = await createSignatureRequest({
    workspaceId: user.workspaceId,
    actorId: user.id,
    roomId: opts.roomId,
    targetKind: opts.targetKind,
    targetId: opts.targetId,
    title,
    message: opts.message ?? null,
  });
  if (!result.ok) return result;

  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true, requestId: result.request.id };
}

async function _voidSignatureRequestAction(opts: {
  roomId: string;
  requestId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const { voidSignatureRequest } = await import("@/db/queries/partner-signatures");
  const ok = await voidSignatureRequest({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
    requestId: opts.requestId,
  });
  if (!ok) return { ok: false, error: "Request is not pending" };
  revalidatePath(`/partner-access/rooms/${opts.roomId}`);
  return { ok: true };
}

/** Short-lived download URL for the stamped signed PDF (owner side). */
async function _getSignedPdfUrlAction(opts: {
  roomId: string;
  requestId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const room = await getPartnerRoomBasic({
    workspaceId: user.workspaceId,
    roomId: opts.roomId,
  });
  if (!room) return { ok: false, error: "Room not found" };

  const { getSignatureForRequest } = await import("@/db/queries/partner-signatures");
  const signature = await getSignatureForRequest({
    roomId: opts.roomId,
    requestId: opts.requestId,
  });
  if (!signature?.signedPdfPath) return { ok: false, error: "No signed copy yet" };

  const { createSignedDownloadUrl } = await import("@/lib/project-files/storage");
  const signed = await createSignedDownloadUrl(signature.signedPdfPath);
  if (!signed.ok) return { ok: false, error: "File unavailable" };
  return { ok: true, url: signed.url };
}

export const requestSignatureAction = withActionGuard("requestSignatureAction", _requestSignatureAction);
export const voidSignatureRequestAction = withActionGuard("voidSignatureRequestAction", _voidSignatureRequestAction);
export const getSignedPdfUrlAction = withActionGuard("getSignedPdfUrlAction", _getSignedPdfUrlAction);
