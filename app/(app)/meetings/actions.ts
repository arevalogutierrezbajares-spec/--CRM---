"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  parseMeetingFormData,
  parseActionItems,
  type MeetingFormInput,
} from "@/lib/validation/meeting";
import {
  addMeetingMaterial,
  removeMeetingMaterial,
  reorderMeetingMaterials,
  listMeetingMaterials,
} from "@/db/queries/meeting-materials";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { wallClockToDate } from "@/lib/date/meeting-time";
import {
  createPartnerShare,
  regeneratePartnerRoomAccessToken,
} from "@/db/queries/partner-access";

const { meetings, meetingAttendees, touches, milestones, contacts } = schema;

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function syncAttendees(meetingId: string, contactIds: string[]) {
  await db
    .delete(meetingAttendees)
    .where(eq(meetingAttendees.meetingId, meetingId));
  if (contactIds.length === 0) return;
  await db
    .insert(meetingAttendees)
    .values(contactIds.map((contactId) => ({ meetingId, contactId })));
}

/**
 * Batch encounter: insert one Touch per attendee tied to this meeting +
 * update last_touch_at for every attendee in a single transaction.
 * Drizzle's `db` is the postgres-js client which supports `.transaction()`.
 */
async function bulkTouchForAttendees(opts: {
  meetingId: string;
  contactIds: string[];
  workspaceId: string;
  createdBy: string;
  body: string;
  projectId: string | null;
}) {
  if (opts.contactIds.length === 0) return;
  await db.insert(touches).values(
    opts.contactIds.map((contactId) => ({
      meetingId: opts.meetingId,
      contactId,
      projectId: opts.projectId,
      channel: "meeting" as const,
      body: opts.body,
      workspaceId: opts.workspaceId,
      createdBy: opts.createdBy,
    })),
  );
  const now = new Date();
  for (const id of opts.contactIds) {
    await db
      .update(contacts)
      .set({ lastTouchAt: now, updatedAt: now })
      .where(eq(contacts.id, id));
  }
}

async function createMilestonesFromActionItems(opts: {
  projectId: string;
  workspaceId: string;
  createdBy: string;
  meetingId: string;
  items: string[];
}) {
  if (opts.items.length === 0) return;
  await db.insert(milestones).values(
    opts.items.map((title) => ({
      projectId: opts.projectId,
      title,
      workspaceId: opts.workspaceId,
      createdBy: opts.createdBy,
      sourceMeetingId: opts.meetingId,
    })),
  );
}

export async function createMeeting(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: MeetingFormInput;
  try {
    parsed = parseMeetingFormData(formData);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid input",
    };
  }

  const scheduledAt = wallClockToDate(parsed.scheduledAt);
  if (!scheduledAt) return { ok: false, error: "Invalid date + time" };

  const [inserted] = await db
    .insert(meetings)
    .values({
      title: parsed.title,
      scheduledAt,
      endedAt: wallClockToDate(parsed.endedAt),
      type: parsed.type,
      location: parsed.location ?? null,
      agenda: parsed.agenda ?? null,
      minutes: parsed.minutes ?? null,
      metAtTag: parsed.metAtTag ?? null,
      linkedProjectId: parsed.linkedProjectId ?? null,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({ id: meetings.id });

  await syncAttendees(inserted.id, parsed.attendeeIds);

  // Batch encounter (AGB-301): one Touch per attendee.
  if (parsed.attendeeIds.length > 0) {
    await bulkTouchForAttendees({
      meetingId: inserted.id,
      contactIds: parsed.attendeeIds,
      workspaceId: user.workspaceId,
      createdBy: user.id,
      body: `Meeting: ${parsed.title}${parsed.metAtTag ? ` · ${parsed.metAtTag}` : ""}`,
      projectId: parsed.linkedProjectId ?? null,
    });
  }

  // Action items → Milestones (only if a project is linked).
  const items = parseActionItems(parsed.minutes);
  if (items.length > 0 && parsed.linkedProjectId) {
    await createMilestonesFromActionItems({
      projectId: parsed.linkedProjectId,
      workspaceId: user.workspaceId,
      createdBy: user.id,
      meetingId: inserted.id,
      items,
    });
  }

  revalidatePath("/meetings");
  if (parsed.linkedProjectId) revalidatePath(`/projects/${parsed.linkedProjectId}`);
  redirect(`/meetings/${inserted.id}`);
}

export async function updateMeeting(
  id: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: MeetingFormInput;
  try {
    parsed = parseMeetingFormData(formData);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid input",
    };
  }

  const scheduledAt = wallClockToDate(parsed.scheduledAt);
  if (!scheduledAt) return { ok: false, error: "Invalid date + time" };

  const [updated] = await db
    .update(meetings)
    .set({
      title: parsed.title,
      scheduledAt,
      endedAt: wallClockToDate(parsed.endedAt),
      type: parsed.type,
      location: parsed.location ?? null,
      agenda: parsed.agenda ?? null,
      minutes: parsed.minutes ?? null,
      metAtTag: parsed.metAtTag ?? null,
      linkedProjectId: parsed.linkedProjectId ?? null,
    })
    .where(and(eq(meetings.id, id), eq(meetings.workspaceId, user.workspaceId)))
    .returning({ id: meetings.id });

  if (!updated) return { ok: false, error: "Meeting not found" };

  await syncAttendees(updated.id, parsed.attendeeIds);
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  return { ok: true, id: updated.id };
}

/** Re-parse minutes and create any missing action-item Milestones. */
export async function generateMilestonesFromMeeting(meetingId: string) {
  const user = await requireUser();
  const [m] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)))
    .limit(1);
  if (!m) return { ok: false as const, error: "Meeting not found" };
  if (!m.linkedProjectId)
    return { ok: false as const, error: "Link a project first" };

  const items = parseActionItems(m.minutes);
  if (items.length === 0)
    return { ok: false as const, error: "No action items in minutes" };

  await createMilestonesFromActionItems({
    projectId: m.linkedProjectId,
    workspaceId: user.workspaceId,
    createdBy: user.id,
    meetingId: m.id,
    items,
  });
  revalidatePath(`/projects/${m.linkedProjectId}`);
  revalidatePath(`/meetings/${m.id}`);
  return { ok: true as const, count: items.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// MEETING MATERIALS — curate the decks/docs shown in a meeting + present mode
// ─────────────────────────────────────────────────────────────────────────────

export async function attachMeetingMaterial(
  meetingId: string,
  projectLinkId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await addMeetingMaterial({
      meetingId,
      projectLinkId,
      workspaceId: user.workspaceId,
      addedBy: user.id,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to attach" };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true, id: projectLinkId };
}

export async function detachMeetingMaterial(
  meetingId: string,
  projectLinkId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  await removeMeetingMaterial({
    meetingId,
    projectLinkId,
    workspaceId: user.workspaceId,
  });
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true, id: projectLinkId };
}

export async function reorderMeetingMaterialsAction(
  meetingId: string,
  orderedLinkIds: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  await reorderMeetingMaterials({
    meetingId,
    workspaceId: user.workspaceId,
    orderedLinkIds,
  });
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true, id: meetingId };
}

/**
 * Short-lived signed URL for a stored material, minted on demand (not at page
 * load) so present mode and the materials panel can open files securely.
 */
export async function getMaterialUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireUser();
  if (!storagePath) return { ok: false, error: "No file" };
  return createSignedDownloadUrl(storagePath);
}

/**
 * Share every material in a meeting with one attendee as a curated, tracked
 * client room (reuses the partner-access system). All materials land in a
 * single room → one /access/[token] link the client opens on any device.
 */
export async function shareMeetingMaterialsAction(
  meetingId: string,
  contactId: string,
  opts?: { allowDownload?: boolean; message?: string | null },
): Promise<
  { ok: true; url: string; count: number } | { ok: false; error: string }
> {
  const user = await requireUser();

  const materials = await listMeetingMaterials({
    meetingId,
    workspaceId: user.workspaceId,
  });
  if (materials.length === 0) {
    return { ok: false, error: "No materials to share yet" };
  }

  const permissions: Array<"view" | "download"> = opts?.allowDownload
    ? ["view", "download"]
    : ["view"];

  let roomId: string | null = null;
  let accessToken: string | null = null;
  let shared = 0;
  let lastError: string | null = null;

  for (const m of materials) {
    const res = await createPartnerShare({
      workspaceId: user.workspaceId,
      actorId: user.id,
      projectId: m.lobId,
      projectLinkId: m.projectLinkId,
      contactId,
      partnerKind: "client",
      channel: "meeting",
      permissions,
      message: opts?.message ?? null,
      expiresAt: null,
    });
    if (!res.ok) {
      lastError = res.error;
      continue;
    }
    roomId = res.room.id;
    if (res.accessToken) accessToken = res.accessToken;
    shared++;
  }

  if (!roomId) {
    return { ok: false, error: lastError ?? "Could not share materials" };
  }

  // Existing rooms keep a hashed token we can't read back — mint a fresh,
  // sendable link so the user always walks away with a working URL.
  if (!accessToken) {
    const regen = await regeneratePartnerRoomAccessToken({
      workspaceId: user.workspaceId,
      actorId: user.id,
      roomId,
    });
    if (!regen.ok) return { ok: false, error: regen.error };
    accessToken = regen.accessToken;
  }

  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true, url: `/access/${accessToken}`, count: shared };
}
