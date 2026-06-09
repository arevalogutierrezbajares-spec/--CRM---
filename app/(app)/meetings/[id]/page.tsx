import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ListChecks, Radio } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { getMeeting } from "@/db/queries/meetings";
import { safeRead } from "@/lib/db-status";
import { formatMeetingDateTime } from "@/lib/date/meeting-time";
import { parseActionItems } from "@/lib/validation/meeting"; // used for server-side spawn button count
import { InlineNotes } from "@/components/meetings/inline-notes";
import { LiveMeeting } from "@/components/meetings/live-meeting";
import { PreMeetingBrief } from "@/components/meetings/pre-meeting-brief";
import { MeetingMaterials } from "@/components/meetings/meeting-materials";
import { MeetingHeaderEditor } from "@/components/meetings/meeting-header-editor";
import { MeetingAttendeesEditor } from "@/components/meetings/meeting-attendees-editor";
import {
  getAttendeeContext,
  listRecentTouchesForContacts,
  listPriorMeetingsForContacts,
} from "@/db/queries/meetings";
import { listProjects } from "@/db/queries/projects";
import { listContacts } from "@/db/queries/contacts";
import {
  listMeetingMaterials,
  listAttachableMaterials,
} from "@/db/queries/meeting-materials";
import {
  generateMilestonesFromMeeting,
} from "../actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ live?: string }>;

export default async function MeetingDetailPage(props: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const isLive = sp.live === "1";

  const res = await safeRead(() => getMeeting({ id, workspaceId: user.workspaceId }), null);
  if (res.ok && !res.data) notFound();
  const meeting = res.data;

  // Load attendee context for pre-meeting brief (parallel, best-effort)
  const attendeeContexts = meeting?.attendees.length
    ? await Promise.all(
        meeting.attendees.map(async (c) => {
          const ctx = await getAttendeeContext({
            contactId: c.id,
            workspaceId: user.workspaceId,
          }).catch(() => null);
          return {
            contactId: c.id,
            name: c.name,
            organization: c.organization,
            lastTouchAt: ctx?.lastTouchAt ?? null,
            openActionItems: ctx?.openActionItems ?? 0,
            previousMeetingId: ctx?.previousMeetingId ?? null,
            previousMeetingTitle: ctx?.previousMeetingTitle ?? null,
          };
        }),
      )
    : [];

  // Materials shown in this meeting + everything attachable from the workspace.
  const [materials, attachable] = meeting
    ? await Promise.all([
        safeRead(
          () => listMeetingMaterials({ meetingId: id, workspaceId: user.workspaceId }),
          [],
        ).then((r) => r.data),
        safeRead(
          () =>
            listAttachableMaterials({ meetingId: id, workspaceId: user.workspaceId }),
          [],
        ).then((r) => r.data),
      ])
    : [[], []];

  // Inline-edit + dynamic-attendee data: projects (linked-project select), all
  // contacts (attendee search), and each attendee's recent CRM activity (pulled
  // into the meeting for two-way context).
  const attendeeIds = meeting?.attendees.map((c) => c.id) ?? [];
  const [projects, allContacts, recentTouches, priorMeetings] = meeting
    ? await Promise.all([
        safeRead(() => listProjects({ workspaceId: user.workspaceId }), [] as Awaited<ReturnType<typeof listProjects>>).then((r) => r.data),
        safeRead(() => listContacts({ workspaceId: user.workspaceId }), [] as Awaited<ReturnType<typeof listContacts>>).then((r) => r.data),
        attendeeIds.length
          ? safeRead(
              () =>
                listRecentTouchesForContacts({
                  contactIds: attendeeIds,
                  workspaceId: user.workspaceId,
                  excludeMeetingId: id,
                  perContactLimit: 3,
                }),
              [] as Awaited<ReturnType<typeof listRecentTouchesForContacts>>,
            ).then((r) => r.data)
          : [],
        attendeeIds.length
          ? safeRead(
              () =>
                listPriorMeetingsForContacts({
                  contactIds: attendeeIds,
                  workspaceId: user.workspaceId,
                  excludeMeetingId: id,
                  limit: 8,
                }),
              [] as Awaited<ReturnType<typeof listPriorMeetingsForContacts>>,
            ).then((r) => r.data)
          : [],
      ])
    : [[], [], [], []];

  const recentByContact: Record<
    string,
    Awaited<ReturnType<typeof listRecentTouchesForContacts>>
  > = {};
  for (const t of recentTouches) {
    (recentByContact[t.contactId] ??= []).push(t);
  }

  async function spawn() {
    "use server";
    await generateMilestonesFromMeeting(id);
  }

  const items = parseActionItems(meeting?.minutes);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/meetings/${id}?live=1`}>
              <Radio className="h-4 w-4" /> Go Live
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All meetings
        </Link>

        {!res.ok && (
          <div className="mt-4">
            <DbBanner error={res.error} />
          </div>
        )}

        {meeting && (
          <>
            {isLive ? (
              <div className="mt-4">
                <LiveMeeting
                  meetingId={id}
                  title={meeting.title}
                  scheduledAt={meeting.scheduledAt}
                  startedAt={meeting.startedAt ?? null}
                  agenda={meeting.agenda}
                  minutes={meeting.minutes}
                  attendees={meeting.attendees}
                  linkedProjectId={meeting.linkedProjectId}
                />
              </div>
            ) : (
              <>
                <MeetingHeaderEditor
                  meetingId={id}
                  initialTitle={meeting.title}
                  initialScheduledInput={toLocalInput(meeting.scheduledAt)}
                  initialLocation={meeting.location}
                  initialType={meeting.type}
                  initialLinkedProjectId={meeting.linkedProjectId}
                  initialMetAtTag={meeting.metAtTag}
                  projects={projects.map((p) => ({ id: p.id, title: p.title }))}
                />

                <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                  <div className="space-y-6">
                    {attendeeContexts.length > 0 && (
                      <PreMeetingBrief attendees={attendeeContexts} />
                    )}

                    <MeetingMaterials
                      meetingId={id}
                      materials={materials}
                      attachable={attachable}
                      attendees={meeting.attendees.map((c) => ({
                        id: c.id,
                        name: c.name,
                        organization: c.organization,
                      }))}
                    />

                    {priorMeetings.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Previous meetings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {priorMeetings.map((pm) => (
                            <div
                              key={pm.id}
                              className="border-l-2 border-[var(--border)] pl-3"
                            >
                              <Link
                                href={`/meetings/${pm.id}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {pm.title}
                              </Link>
                              <div className="text-xs text-[var(--muted-foreground)]">
                                {formatMeetingDateTime(pm.scheduledAt)}
                              </div>
                              {pm.minutes?.trim() ? (
                                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">
                                  {pm.minutes.trim()}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs italic text-[var(--muted-foreground)]">
                                  No notes recorded.
                                </p>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle>Agenda</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <InlineNotes
                          meetingId={id}
                          field="agenda"
                          initialValue={meeting.agenda}
                          placeholder="Add agenda items, talking points, goals…"
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle>Minutes</CardTitle>
                        {items.length > 0 && meeting.linkedProjectId && (
                          <form action={spawn}>
                            <Button type="submit" size="sm" variant="outline">
                              <ListChecks className="h-4 w-4" />
                              Spawn {items.length} milestone
                              {items.length === 1 ? "" : "s"}
                            </Button>
                          </form>
                        )}
                      </CardHeader>
                      <CardContent>
                        <InlineNotes
                          meetingId={id}
                          field="minutes"
                          initialValue={meeting.minutes}
                          placeholder={"Take notes here. Use [ ] to mark action items.\nExample: [ ] Follow up on proposal"}
                          showActionItems
                          linkedProjectId={meeting.linkedProjectId}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  <aside className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Attendees</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <MeetingAttendeesEditor
                          meetingId={id}
                          attendees={meeting.attendees.map((c) => ({
                            id: c.id,
                            name: c.name,
                            organization: c.organization,
                            relationshipType: c.relationshipType,
                          }))}
                          allContacts={allContacts.map((c) => ({
                            id: c.id,
                            name: c.name,
                            organization: c.organization,
                          }))}
                          recentByContact={recentByContact}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Touches logged</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm">
                        {meeting.touches.length === 0 ? (
                          <p className="text-[var(--muted-foreground)]">None.</p>
                        ) : (
                          <p>
                            {meeting.touches.length} touch
                            {meeting.touches.length === 1 ? "" : "es"} — one per
                            attendee at creation.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Meta</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <Row label="Type" value={<Badge variant="outline">{meeting.type}</Badge>} />
                        <Row label="Source" value={meeting.source} />
                        <Row
                          label="Met-at tag"
                          value={meeting.metAtTag ?? "—"}
                        />
                      </CardContent>
                    </Card>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** Date → datetime-local input value (mirrors the meeting edit page). */
function toLocalInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}
