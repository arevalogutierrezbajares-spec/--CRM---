import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { todayInTz } from "@/lib/date/today";
import { listWorkspaceMembers } from "@/db/queries/team";
import {
  listObjectives,
  listQuarters,
  quarterOf,
  type ObjectiveView,
} from "@/db/queries/okrs";
import { PrioritiesBoard } from "@/components/priorities/priorities-board";

type SearchParams = Promise<{ q?: string }>;

export default async function PrioritiesPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  // Default to the current quarter in the user's timezone (so a quarter-end
  // evening in UTC-4 doesn't jump to the next, empty quarter).
  const quarter = sp.q || quarterOf(new Date(todayInTz(user.timezone)));

  const [objectivesRes, quartersRes, membersRes] = await Promise.all([
    safeRead<ObjectiveView[]>(() => listObjectives(user.workspaceId, quarter), []),
    safeRead<string[]>(() => listQuarters(user.workspaceId), [quarter]),
    safeRead<{ userId: string; displayName: string }[]>(
      () => listWorkspaceMembers(user.workspaceId).then((ms) => ms.map((m) => ({ userId: m.userId, displayName: m.displayName }))),
      [],
    ),
  ]);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} title="Priorities" />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {!objectivesRes.ok && <DbBanner error={objectivesRes.error} />}
        <PrioritiesBoard
          quarter={quarter}
          quarters={quartersRes.data}
          objectives={objectivesRes.data}
          members={membersRes.data}
        />
      </div>
    </>
  );
}
