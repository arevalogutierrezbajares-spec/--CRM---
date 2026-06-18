import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import { safeRead } from "@/lib/db-status";
import {
  listFortnightTasks,
  listWorkspaceMembers,
  type WorkTask,
} from "@/db/queries/work";
import { FortnightBoard, type FTask } from "@/components/work/fortnight-board";

const WINDOW_DAYS = 14;

export default async function SprintPage() {
  const user = await requireUser();
  const end = new Date();
  end.setDate(end.getDate() + WINDOW_DAYS);
  const windowEnd = end.toISOString().slice(0, 10);

  const [tasksRes, membersRes] = await Promise.all([
    safeRead<WorkTask[]>(() => listFortnightTasks(user.workspaceId, WINDOW_DAYS), []),
    safeRead<Array<{ id: string; displayName: string }>>(
      () => listWorkspaceMembers(user.workspaceId),
      [],
    ),
  ]);

  const tasks: FTask[] = tasksRes.data.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    status: t.status,
    project: t.project ?? null,
    initiativeTitle: t.initiativeTitle,
    ownerUserId: t.ownerUserId,
    ownerName: t.assigneeName,
  }));

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">This Fortnight</h1>
            <p className="text-[13px] text-text-secondary">
              Everything on the table for the next two weeks — due soon, overdue, or in progress. Auto-pulled from the roadmap.
            </p>
          </div>
          <Link href="/roadmap" className="text-[12px] text-text-secondary hover:text-text-primary">
            ← Roadmap
          </Link>
        </header>

        <WorkNav />

        {!tasksRes.ok && <DbBanner error={(tasksRes as { error?: string }).error ?? ""} />}

        <FortnightBoard tasks={tasks} members={membersRes.data} windowEnd={windowEnd} />
      </main>
    </>
  );
}
