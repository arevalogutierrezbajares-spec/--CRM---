import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  meetings,
  meetingAttendees,
  contacts,
  projects,
  touches,
} = schema;

export type MeetingRow = typeof meetings.$inferSelect;
export type MeetingListItem = MeetingRow & {
  attendeeCount: number;
  projectTitle: string | null;
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
  const attendees = await db
    .select()
    .from(meetingAttendees)
    .where(inArray(meetingAttendees.meetingId, ids));

  return rows.map(({ meeting, projectTitle }) => ({
    ...meeting,
    attendeeCount: attendees.filter((a) => a.meetingId === meeting.id).length,
    projectTitle,
  }));
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
