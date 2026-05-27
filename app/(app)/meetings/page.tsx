import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { listMeetings } from "@/db/queries/meetings";
import { safeRead } from "@/lib/db-status";
import { formatDateTime } from "@/lib/utils";

const typeLabel: Record<"one_on_one" | "group" | "event" | "call", string> = {
  one_on_one: "1:1",
  group: "group",
  event: "event",
  call: "call",
};

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
          <Card className="overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {res.data.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/meetings/${m.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.title}
                      </Link>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {formatDateTime(m.scheduledAt)}
                        {m.location ? ` · ${m.location}` : ""}
                        {m.projectTitle ? ` · ${m.projectTitle}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{typeLabel[m.type]}</Badge>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {m.attendeeCount} attendee
                        {m.attendeeCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
