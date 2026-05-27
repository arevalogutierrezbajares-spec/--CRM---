import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { DbBanner } from "@/components/db-banner";
import { getMeeting } from "@/db/queries/meetings";
import { listContacts } from "@/db/queries/contacts";
import { listProjects } from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { updateMeeting } from "../../actions";

type Params = Promise<{ id: string }>;

function toLocalInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditMeetingPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [meetingRes, contactsRes, projectsRes] = await Promise.all([
    safeRead(() => getMeeting({ id, workspaceId: user.workspaceId }), null),
    safeRead(
      () => listContacts({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listContacts>>,
    ),
    safeRead(
      () => listProjects({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listProjects>>,
    ),
  ]);

  if (meetingRes.ok && !meetingRes.data) notFound();
  const meeting = meetingRes.data;

  async function action(formData: FormData) {
    "use server";
    return updateMeeting(id, null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href={`/meetings/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back to meeting
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {meeting?.title ?? "meeting"}
          </h1>
        </header>

        {!meetingRes.ok && <DbBanner error={meetingRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <MeetingForm
              contacts={contactsRes.data.map((c) => ({
                id: c.id,
                name: c.name,
              }))}
              projects={projectsRes.data.map((p) => ({
                id: p.id,
                title: p.title,
              }))}
              initial={
                meeting
                  ? {
                      id: meeting.id,
                      title: meeting.title,
                      scheduledAt: toLocalInput(meeting.scheduledAt),
                      endedAt: meeting.endedAt
                        ? toLocalInput(meeting.endedAt)
                        : null,
                      type: meeting.type,
                      location: meeting.location,
                      agenda: meeting.agenda,
                      minutes: meeting.minutes,
                      metAtTag: meeting.metAtTag,
                      linkedProjectId: meeting.linkedProjectId,
                      attendeeIds: meeting.attendees.map((c) => c.id),
                    }
                  : undefined
              }
              action={action}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
