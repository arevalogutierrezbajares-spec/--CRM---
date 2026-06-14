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
import { syncMeetingNotesToContacts } from "@/db/queries/meetings";
import {
  createPartnerShare,
  regeneratePartnerRoomAccessToken,
} from "@/db/queries/partner-access";
import { createRoomItem } from "@/db/queries/partner-repository";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";
import { modelForWorkload } from "@/lib/anthropic-budget";

type RelationshipType = "friend" | "lead" | "partner" | "prospect";
type MeetingTypeValue = "one_on_one" | "group" | "event" | "call";

const { meetings, meetingAttendees, touches, milestones, contacts, partnerRooms } = schema;

/**
 * Share a meeting's minutes into a partner room as a note item. mode "raw"
 * posts the minutes verbatim; "brief" first asks Claude to turn the internal
 * notes into a clean client-facing recap (falls back to raw if Claude is off
 * or errors). The matched room is surfaced on the meeting's Partner Rooms panel.
 */
export async function shareMeetingMinutesToRoom(
  meetingId: string,
  roomId: string,
  mode: "raw" | "brief",
): Promise<{ ok: true; usedAi: boolean } | { ok: false; error: string }> {
  const user = await requireUser();

  const [meeting] = await db
    .select({ id: meetings.id, title: meetings.title, minutes: meetings.minutes })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)))
    .limit(1);
  if (!meeting) return { ok: false, error: "Meeting not found" };

  const raw = meeting.minutes?.trim();
  if (!raw) return { ok: false, error: "This meeting has no minutes yet" };

  const [room] = await db
    .select({ id: partnerRooms.id })
    .from(partnerRooms)
    .where(and(eq(partnerRooms.id, roomId), eq(partnerRooms.workspaceId, user.workspaceId)))
    .limit(1);
  if (!room) return { ok: false, error: "Partner room not found" };

  let body = raw;
  let usedAi = false;
  if (mode === "brief" && isAnthropicConfigured()) {
    const res = await claudeChat({
      model: modelForWorkload("briefing"),
      system:
        "You turn a founder's raw internal meeting notes into a concise, client-facing recap to post in a shared partner room. Keep what's useful to the client: decisions, agreed next steps, and dates. Drop internal-only asides, candid commentary, pricing strategy, and anything not meant for the client's eyes. Warm, professional, first person plural ('we'). Output the recap body only — no preamble, no sign-off.",
      prompt: `Meeting: ${meeting.title}\n\nRaw notes:\n${raw}`,
      maxTokens: 700,
      spend: {
        workspaceId: user.workspaceId,
        userId: user.id,
        direction: "out",
        trackUsage: true,
        payload: { route: "meeting:share-minutes-brief", meetingId, roomId },
      },
    });
    if (res.ok && res.text.trim()) {
      body = res.text.trim();
      usedAi = true;
    }
  }

  await createRoomItem({
    workspaceId: user.workspaceId,
    roomId,
    kind: "note",
    title: `Minutes — ${meeting.title}`,
    description: body,
    category: "Notes",
    addedBy: user.id,
  });

  revalidatePath(`/partner-access/rooms/${roomId}`);
  return { ok: true, usedAi };
}

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
// INLINE EDIT — edit meeting fields directly from the detail page (no edit page)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateMeetingFieldsAction(
  meetingId: string,
  patch: {
    title?: string;
    scheduledAt?: string; // wall-clock "YYYY-MM-DDTHH:mm"
    location?: string;
    type?: MeetingTypeValue;
    linkedProjectId?: string | null;
    metAtTag?: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  const set: Partial<typeof schema.meetings.$inferInsert> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty" };
    set.title = t;
  }
  if (patch.scheduledAt !== undefined) {
    const d = wallClockToDate(patch.scheduledAt);
    if (!d) return { ok: false, error: "Invalid date + time" };
    set.scheduledAt = d;
  }
  if (patch.location !== undefined) set.location = patch.location.trim() || null;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.linkedProjectId !== undefined)
    set.linkedProjectId = patch.linkedProjectId || null;
  if (patch.metAtTag !== undefined) set.metAtTag = patch.metAtTag.trim() || null;
  if (Object.keys(set).length === 0) return { ok: true, id: meetingId };

  const [updated] = await db
    .update(meetings)
    .set(set)
    .where(
      and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)),
    )
    .returning({ id: meetings.id });
  if (!updated) return { ok: false, error: "Meeting not found" };

  // Title is part of the synced timeline entry — refresh it when it changes.
  if (patch.title !== undefined) {
    await syncMeetingNotesToContacts({
      meetingId,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    });
  }
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true, id: updated.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDEES — add/remove CRM contacts dynamically; create + attach non-CRM people
// ─────────────────────────────────────────────────────────────────────────────

export async function addMeetingAttendeeAction(
  meetingId: string,
  contactId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const [m] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)))
    .limit(1);
  if (!m) return { ok: false, error: "Meeting not found" };
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, user.workspaceId)))
    .limit(1);
  if (!c) return { ok: false, error: "Contact not found" };

  await db
    .insert(meetingAttendees)
    .values({ meetingId, contactId })
    .onConflictDoNothing();
  // Drop the meeting (+ its notes) onto the new attendee's contact timeline.
  await syncMeetingNotesToContacts({
    meetingId,
    workspaceId: user.workspaceId,
    createdBy: user.id,
  });
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, id: contactId };
}

export async function removeMeetingAttendeeAction(
  meetingId: string,
  contactId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const [m] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)))
    .limit(1);
  if (!m) return { ok: false, error: "Meeting not found" };

  await db
    .delete(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.meetingId, meetingId),
        eq(meetingAttendees.contactId, contactId),
      ),
    );
  // Remove the auto meeting-touch from their timeline (keeps it tidy/in sync).
  await db
    .delete(touches)
    .where(
      and(
        eq(touches.meetingId, meetingId),
        eq(touches.contactId, contactId),
        eq(touches.channel, "meeting"),
      ),
    );
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, id: contactId };
}

export type AttendeeContactResult =
  | {
      ok: true;
      contact: {
        id: string;
        name: string;
        organization: string | null;
        relationshipType: RelationshipType;
      };
    }
  | { ok: false; error: string };

/** Create a brand-new CRM contact AND attach them to the meeting (the "add this
 *  person to your CRM?" path for non-CRM attendees). */
export async function createContactForMeetingAction(
  meetingId: string,
  input: {
    name: string;
    email?: string;
    organization?: string;
    relationshipType?: RelationshipType;
  },
): Promise<AttendeeContactResult> {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name required" };
  const [m] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.workspaceId, user.workspaceId)))
    .limit(1);
  if (!m) return { ok: false, error: "Meeting not found" };

  const [inserted] = await db
    .insert(contacts)
    .values({
      name,
      type: "person",
      organization: input.organization?.trim() || null,
      relationshipType: input.relationshipType ?? "prospect",
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({
      id: contacts.id,
      name: contacts.name,
      organization: contacts.organization,
      relationshipType: contacts.relationshipType,
    });

  const email = input.email?.trim();
  if (email) {
    await db.insert(schema.contactChannels).values({
      contactId: inserted.id,
      kind: "email",
      value: email,
      isPrimary: true,
    });
  }

  await db
    .insert(meetingAttendees)
    .values({ meetingId, contactId: inserted.id })
    .onConflictDoNothing();
  await syncMeetingNotesToContacts({
    meetingId,
    workspaceId: user.workspaceId,
    createdBy: user.id,
  });

  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/contacts");
  return { ok: true, contact: inserted };
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
      meetingId,
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
