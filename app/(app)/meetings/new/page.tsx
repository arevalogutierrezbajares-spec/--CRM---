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

export default async function NewMeetingPage() {
  const user = await requireUser();

  const [contactsRes, projectsRes] = await Promise.all([
    safeRead(
      () => listContacts({ ownerId: user.id }),
      [] as Awaited<ReturnType<typeof listContacts>>,
    ),
    safeRead(
      () => listProjects({ ownerId: user.id }),
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
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
