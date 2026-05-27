import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { MeetingsList } from "@/components/meetings/meetings-list";
import { listMeetings } from "@/db/queries/meetings";
import { safeRead } from "@/lib/db-status";

export default async function MeetingsPage() {
  const user = await requireUser();
  const res = await safeRead(() => listMeetings({ workspaceId: user.workspaceId }), []);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild size="sm">
            <Link href="/meetings/new">
              <Plus className="h-4 w-4" /> New meeting
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Every meeting auto-logs a Touch on each attendee. Action items in
            minutes (lines starting with <code>[ ]</code>) become milestones on
            the linked project.
          </p>
        </header>

        {!res.ok && <DbBanner error={res.error} />}

        {res.data.length === 0 ? (
          <Card className="grid place-items-center px-6 py-10 text-center">
            <div className="space-y-3">
              <p className="text-sm font-medium">No meetings yet.</p>
              <Button asChild size="sm">
                <Link href="/meetings/new">
                  <Plus className="h-4 w-4" /> New meeting
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <MeetingsList meetings={res.data} />
        )}
      </main>
    </>
  );
}
