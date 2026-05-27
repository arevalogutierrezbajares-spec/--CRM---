import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  meetings,
  meetingAttendees,
  contacts,
  projects,
  touches,
  milestones,
} = schema;

export type MeetingRow = typeof meetings.$inferSelect;
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
  attendeeCount: number;
  openActionItems: number;
};

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
    attendeeCount: allAttendees.filter((a) => a.meetingId === m.id).length,
    openActionItems: openMilestones.filter((ms) => ms.meetingId === m.id).length,
  }));
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
