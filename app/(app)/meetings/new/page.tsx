import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { DbBanner } from "@/components/db-banner";
import { listContacts } from "@/db/queries/contacts";
import { listProjects } from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { createMeeting } from "../actions";

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function NewMeetingPage() {
  const user = await requireUser();

  const [contactsRes, projectsRes] = await Promise.all([
    safeRead(
      () => listContacts({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listContacts>>,
    ),
    safeRead(
      () => listProjects({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listProjects>>,
    ),
  ]);

  async function action(formData: FormData) {
    "use server";
    return createMeeting(null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href="/meetings"
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] sm:min-h-0"
        >
          <ChevronLeft className="h-4 w-4" /> Back to meetings
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New meeting</h1>
        </header>

        {(!contactsRes.ok || !projectsRes.ok) && (
          <DbBanner
            error={
              !contactsRes.ok ? contactsRes.error : projectsRes.ok ? "" : projectsRes.error
            }
          />
        )}

        <Card>
          <CardContent className="pt-6">
            <MeetingForm
              initial={{ scheduledAt: toLocalInput(new Date()) }}
              contacts={contactsRes.data.map((c) => ({
                id: c.id,
                name: c.name,
              }))}
              projects={projectsRes.data.map((p) => ({
                id: p.id,
                title: p.title,
              }))}
              action={action}
              submitLabel="Create meeting"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
