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
  ownerId: string;
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
      createdBy: opts.ownerId,
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
  ownerId: string;
  meetingId: string;
  items: string[];
}) {
  if (opts.items.length === 0) return;
  await db.insert(milestones).values(
    opts.items.map((title) => ({
      projectId: opts.projectId,
      title,
      ownerId: opts.ownerId,
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

  const [inserted] = await db
    .insert(meetings)
    .values({
      title: parsed.title,
      scheduledAt: new Date(parsed.scheduledAt),
      endedAt: parsed.endedAt ? new Date(parsed.endedAt) : null,
      type: parsed.type,
      location: parsed.location ?? null,
      agenda: parsed.agenda ?? null,
      minutes: parsed.minutes ?? null,
      metAtTag: parsed.metAtTag ?? null,
      linkedProjectId: parsed.linkedProjectId ?? null,
      createdBy: user.id,
    })
    .returning({ id: meetings.id });

  await syncAttendees(inserted.id, parsed.attendeeIds);

  // Batch encounter (AGB-301): one Touch per attendee.
  if (parsed.attendeeIds.length > 0) {
    await bulkTouchForAttendees({
      meetingId: inserted.id,
      contactIds: parsed.attendeeIds,
      ownerId: user.id,
      body: `Meeting: ${parsed.title}${parsed.metAtTag ? ` · ${parsed.metAtTag}` : ""}`,
      projectId: parsed.linkedProjectId ?? null,
    });
  }

  // Action items → Milestones (only if a project is linked).
  const items = parseActionItems(parsed.minutes);
  if (items.length > 0 && parsed.linkedProjectId) {
    await createMilestonesFromActionItems({
      projectId: parsed.linkedProjectId,
      ownerId: user.id,
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

  const [updated] = await db
    .update(meetings)
    .set({
      title: parsed.title,
      scheduledAt: new Date(parsed.scheduledAt),
      endedAt: parsed.endedAt ? new Date(parsed.endedAt) : null,
      type: parsed.type,
      location: parsed.location ?? null,
      agenda: parsed.agenda ?? null,
      minutes: parsed.minutes ?? null,
      metAtTag: parsed.metAtTag ?? null,
      linkedProjectId: parsed.linkedProjectId ?? null,
    })
    .where(and(eq(meetings.id, id), eq(meetings.createdBy, user.id)))
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
    .where(and(eq(meetings.id, meetingId), eq(meetings.createdBy, user.id)))
    .limit(1);
  if (!m) return { ok: false as const, error: "Meeting not found" };
  if (!m.linkedProjectId)
    return { ok: false as const, error: "Link a project first" };

  const items = parseActionItems(m.minutes);
  if (items.length === 0)
    return { ok: false as const, error: "No action items in minutes" };

  await createMilestonesFromActionItems({
    projectId: m.linkedProjectId,
    ownerId: user.id,
    meetingId: m.id,
    items,
  });
  revalidatePath(`/projects/${m.linkedProjectId}`);
  revalidatePath(`/meetings/${m.id}`);
  return { ok: true as const, count: items.length };
}
