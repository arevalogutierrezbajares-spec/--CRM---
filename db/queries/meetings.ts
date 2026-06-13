import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  meetings,
  meetingAttendees,
  contacts,
  projects,
  touches,
  milestones,
  callRecordings,
} = schema;

export type MeetingRow = typeof meetings.$inferSelect;

/**
 * Create the Meeting that represents a filed call. Every recording captured via
 * /record becomes a meeting (type='call', source='voice') so it lives in the
 * meeting module and rolls up onto the contact's history instead of hanging
 * orphan. When a contact matched, they're added as the sole attendee. Returns
 * the new meeting id so the caller can back-link the recording + touch.
 */
export async function createCallMeeting(opts: {
  workspaceId: string;
  createdBy: string;
  title: string;
  minutes: string | null;
  occurredAt?: Date;
  durationSecs?: number | null;
  contactId?: string | null;
}): Promise<string> {
  const occurredAt = opts.occurredAt ?? new Date();
  const endedAt =
    opts.durationSecs && opts.durationSecs > 0
      ? new Date(occurredAt.getTime() + opts.durationSecs * 1000)
      : null;
  const [m] = await db
    .insert(meetings)
    .values({
      workspaceId: opts.workspaceId,
      createdBy: opts.createdBy,
      title: opts.title,
      type: "call",
      source: "voice",
      scheduledAt: occurredAt,
      startedAt: occurredAt,
      endedAt,
      minutes: opts.minutes,
    })
    .returning({ id: meetings.id });
  if (opts.contactId) {
    await db
      .insert(meetingAttendees)
      .values({ meetingId: m.id, contactId: opts.contactId })
      .onConflictDoNothing();
  }
  return m.id;
}

/** Minimal meeting lookup (id + title), workspace-fenced — for cross-links. */
export async function getMeetingSummary(opts: {
  id: string;
  workspaceId: string;
}): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: meetings.id, title: meetings.title })
    .from(meetings)
    .where(
      and(eq(meetings.id, opts.id), eq(meetings.workspaceId, opts.workspaceId)),
    )
    .limit(1);
  return row ?? null;
}

export type MeetingRecordingItem = {
  id: string;
  title: string;
  durationSecs: number | null;
  createdAt: Date;
};

/** Call recordings linked to a meeting, newest first (for the meeting detail). */
export async function listRecordingsForMeeting(opts: {
  meetingId: string;
  workspaceId: string;
}): Promise<MeetingRecordingItem[]> {
  return db
    .select({
      id: callRecordings.id,
      title: callRecordings.title,
      durationSecs: callRecordings.durationSecs,
      createdAt: callRecordings.createdAt,
    })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.meetingId, opts.meetingId),
        eq(callRecordings.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(callRecordings.createdAt));
}
export type MeetingListItem = MeetingRow & {
  attendeeCount: number;
  attendeeNames: string[];
  projectTitle: string | null;
  openActionItems: number;
};

export async function listMeetings(opts: {
  workspaceId: string;
}): Promise<MeetingListItem[]> {
  const rows = await db
    .select({ meeting: meetings, projectTitle: projects.title })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.linkedProjectId))
    .where(eq(meetings.workspaceId, opts.workspaceId))
    .orderBy(desc(meetings.scheduledAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.meeting.id);

  const [attendeeRows, openMilestoneRows] = await Promise.all([
    db
      .select({ meetingId: meetingAttendees.meetingId, name: contacts.name })
      .from(meetingAttendees)
      .innerJoin(contacts, eq(contacts.id, meetingAttendees.contactId))
      .where(inArray(meetingAttendees.meetingId, ids)),
    db
      .select({ meetingId: milestones.sourceMeetingId })
      .from(milestones)
      .where(
        and(
          inArray(milestones.sourceMeetingId, ids),
          sql`${milestones.status} IN ('pending','blocked')`,
        ),
      ),
  ]);

  return rows.map(({ meeting, projectTitle }) => {
    const myAttendees = attendeeRows.filter((a) => a.meetingId === meeting.id);
    return {
      ...meeting,
      attendeeCount: myAttendees.length,
      attendeeNames: myAttendees.map((a) => a.name),
      projectTitle,
      openActionItems: openMilestoneRows.filter((ms) => ms.meetingId === meeting.id).length,
    };
  });
}

export async function getMeeting(opts: { id: string; workspaceId: string }) {
  const [row] = await db
    .select({ meeting: meetings, projectTitle: projects.title })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.linkedProjectId))
    .where(
      and(eq(meetings.id, opts.id), eq(meetings.workspaceId, opts.workspaceId)),
    )
    .limit(1);
  if (!row) return null;

  const [attendeeRows, touchRows] = await Promise.all([
    db
      .select({ contact: contacts })
      .from(meetingAttendees)
      .innerJoin(contacts, eq(contacts.id, meetingAttendees.contactId))
      .where(eq(meetingAttendees.meetingId, row.meeting.id)),
    db
      .select()
      .from(touches)
      .where(eq(touches.meetingId, row.meeting.id))
      .orderBy(desc(touches.createdAt)),
  ]);

  return {
    ...row.meeting,
    projectTitle: row.projectTitle,
    attendees: attendeeRows.map((a) => a.contact),
    touches: touchRows,
  };
}

export type ContactMeetingItem = {
  id: string;
  title: string;
  scheduledAt: Date;
  type: "one_on_one" | "group" | "event" | "call";
  minutes: string | null;
  attendeeCount: number;
  openActionItems: number;
};

export type PriorMeetingNote = {
  id: string;
  title: string;
  scheduledAt: Date;
  minutes: string | null;
};

/**
 * Prior meetings any of these contacts attended (newest first), with their
 * notes — so a new meeting can link to and surface the history with the same
 * people. Excludes the current meeting; dedupes across shared attendees.
 */
export async function listPriorMeetingsForContacts(opts: {
  contactIds: string[];
  workspaceId: string;
  excludeMeetingId: string;
  limit?: number;
}): Promise<PriorMeetingNote[]> {
  if (opts.contactIds.length === 0) return [];
  return db
    .selectDistinct({
      id: meetings.id,
      title: meetings.title,
      scheduledAt: meetings.scheduledAt,
      minutes: meetings.minutes,
    })
    .from(meetingAttendees)
    .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
    .where(
      and(
        inArray(meetingAttendees.contactId, opts.contactIds),
        eq(meetings.workspaceId, opts.workspaceId),
        ne(meetings.id, opts.excludeMeetingId),
      ),
    )
    .orderBy(desc(meetings.scheduledAt))
    .limit(opts.limit ?? 8);
}

/** All meetings a contact attended, newest first, with open action-item count. */
export async function listMeetingsForContact(opts: {
  contactId: string;
  workspaceId: string;
  limit?: number;
}): Promise<ContactMeetingItem[]> {
  const rows = await db
    .select({ meeting: meetings })
    .from(meetingAttendees)
    .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
    .where(
      and(
        eq(meetingAttendees.contactId, opts.contactId),
        eq(meetings.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(meetings.scheduledAt))
    .limit(opts.limit ?? 20);

  if (rows.length === 0) return [];

  const meetingIds = rows.map((r) => r.meeting.id);

  // attendee counts
  const allAttendees = await db
    .select({ meetingId: meetingAttendees.meetingId })
    .from(meetingAttendees)
    .where(inArray(meetingAttendees.meetingId, meetingIds));

  // open milestones sourced from these meetings (status = 'pending' or 'blocked')
  const openMilestones = await db
    .select({ meetingId: milestones.sourceMeetingId })
    .from(milestones)
    .where(
      and(
        inArray(milestones.sourceMeetingId, meetingIds),
        sql`${milestones.status} IN ('pending','blocked')`,
      ),
    );

  return rows.map(({ meeting: m }) => ({
    id: m.id,
    title: m.title,
    scheduledAt: m.scheduledAt,
    type: m.type,
    minutes: m.minutes,
    attendeeCount: allAttendees.filter((a) => a.meetingId === m.id).length,
    openActionItems: openMilestones.filter((ms) => ms.meetingId === m.id).length,
  }));
}

/** Composed body for the meeting's entry on an attendee's contact timeline. */
export function meetingTouchBody(title: string, minutes: string | null): string {
  const trimmed = (minutes ?? "").trim();
  return trimmed ? `Meeting: ${title}\n\n${trimmed}` : `Meeting: ${title}`;
}

/**
 * Two-way sync (meeting → contact): upsert one "meeting" touch per attendee
 * carrying the meeting's minutes, so the meeting + its notes appear on each
 * attendee's contact timeline (and update when the minutes are edited). One
 * touch per (meeting, contact, channel='meeting') — matched, never duplicated.
 */
export async function syncMeetingNotesToContacts(opts: {
  meetingId: string;
  workspaceId: string;
  createdBy: string;
}): Promise<void> {
  const [m] = await db
    .select({ title: meetings.title, minutes: meetings.minutes })
    .from(meetings)
    .where(
      and(
        eq(meetings.id, opts.meetingId),
        eq(meetings.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  if (!m) return;

  const att = await db
    .select({ contactId: meetingAttendees.contactId })
    .from(meetingAttendees)
    .where(eq(meetingAttendees.meetingId, opts.meetingId));
  if (att.length === 0) return;

  const body = meetingTouchBody(m.title, m.minutes);
  const now = new Date();
  for (const a of att) {
    const [existing] = await db
      .select({ id: touches.id })
      .from(touches)
      .where(
        and(
          eq(touches.meetingId, opts.meetingId),
          eq(touches.contactId, a.contactId),
          eq(touches.channel, "meeting"),
        ),
      )
      .limit(1);
    if (existing) {
      await db.update(touches).set({ body }).where(eq(touches.id, existing.id));
    } else {
      await db.insert(touches).values({
        meetingId: opts.meetingId,
        contactId: a.contactId,
        channel: "meeting",
        body,
        workspaceId: opts.workspaceId,
        createdBy: opts.createdBy,
      });
    }
    await db
      .update(contacts)
      .set({ lastTouchAt: now, updatedAt: now })
      .where(eq(contacts.id, a.contactId));
  }
}

export type ContactTouchItem = {
  id: string;
  contactId: string;
  channel: string;
  body: string;
  createdAt: Date;
};

/**
 * Two-way sync (contact → meeting): recent timeline touches for a set of
 * contacts, so a meeting can surface each attendee's CRM history. Excludes this
 * meeting's own touches (keeps unrelated null-meeting touches). Top N per contact.
 */
export async function listRecentTouchesForContacts(opts: {
  contactIds: string[];
  workspaceId: string;
  excludeMeetingId?: string;
  perContactLimit?: number;
}): Promise<ContactTouchItem[]> {
  if (opts.contactIds.length === 0) return [];
  const rows = await db
    .select({
      id: touches.id,
      contactId: touches.contactId,
      channel: touches.channel,
      body: touches.body,
      createdAt: touches.createdAt,
    })
    .from(touches)
    .where(
      and(
        inArray(touches.contactId, opts.contactIds),
        eq(touches.workspaceId, opts.workspaceId),
        opts.excludeMeetingId
          ? or(
              isNull(touches.meetingId),
              ne(touches.meetingId, opts.excludeMeetingId),
            )
          : undefined,
      ),
    )
    .orderBy(desc(touches.createdAt));

  const limit = opts.perContactLimit ?? 3;
  const perContact = new Map<string, number>();
  const out: ContactTouchItem[] = [];
  for (const r of rows) {
    const n = perContact.get(r.contactId) ?? 0;
    if (n >= limit) continue;
    perContact.set(r.contactId, n + 1);
    out.push(r);
  }
  return out;
}

/** Lightweight query used by pre-meeting brief: context for each attendee. */
export async function getAttendeeContext(opts: {
  contactId: string;
  workspaceId: string;
}): Promise<{
  lastTouchAt: Date | null;
  openActionItems: number;
  previousMeetingId: string | null;
  previousMeetingTitle: string | null;
}> {
  // Most recent meeting this contact attended (excluding the current one isn't
  // needed here — callers pass a different contactId per attendee).
  const [lastMeeting] = await db
    .select({ id: meetings.id, title: meetings.title })
    .from(meetingAttendees)
    .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
    .where(
      and(
        eq(meetingAttendees.contactId, opts.contactId),
        eq(meetings.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(meetings.scheduledAt))
    .limit(1);

  const [contact] = await db
    .select({ lastTouchAt: contacts.lastTouchAt })
    .from(contacts)
    .where(eq(contacts.id, opts.contactId))
    .limit(1);

  const openCount = lastMeeting
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(milestones)
        .where(
          and(
            eq(milestones.sourceMeetingId, lastMeeting.id),
            sql`${milestones.status} IN ('pending','blocked')`,
          ),
        )
        .then((r) => r[0]?.count ?? 0)
    : 0;

  return {
    lastTouchAt: contact?.lastTouchAt ?? null,
    openActionItems: openCount,
    previousMeetingId: lastMeeting?.id ?? null,
    previousMeetingTitle: lastMeeting?.title ?? null,
  };
}
