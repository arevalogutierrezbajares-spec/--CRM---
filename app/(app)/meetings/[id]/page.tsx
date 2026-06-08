import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ListChecks, Pencil, Radio } from "lucide-react";
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
import { getAttendeeContext } from "@/db/queries/meetings";
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
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/meetings/${id}?live=1`}>
                <Radio className="h-4 w-4" /> Go Live
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/meetings/${id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          </div>
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
                <header className="mt-4 mb-6">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {meeting.title}
                  </h1>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-[var(--muted-foreground)]">
                    <span>{formatMeetingDateTime(meeting.scheduledAt)}</span>
                    {meeting.location && <span>· {meeting.location}</span>}
                    {meeting.projectTitle && (
                      <span>· {meeting.projectTitle}</span>
                    )}
                  </div>
                </header>

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
                        {meeting.attendees.length === 0 ? (
                          <p className="text-sm text-[var(--muted-foreground)]">
                            None.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {meeting.attendees.map((c) => (
                              <li key={c.id} className="text-sm">
                                <Link
                                  href={`/contacts/${c.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {c.name}
                                </Link>
                                <div className="text-xs text-[var(--muted-foreground)]">
                                  {c.relationshipType}
                                  {c.organization ? ` · ${c.organization}` : ""}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
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
