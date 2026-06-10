import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { WorkNav } from "@/components/work/work-nav";
import { safeRead } from "@/lib/db-status";
import { parseRoadmapMd, resolveSnapshotTokens } from "@/lib/roadmap-md";
import { computePlanDrift, type PlanDrift } from "@/lib/plan-drift";
import {
  buildRoadmapSnapshot,
  getLastCommittedPlan,
  listInitiativesNeedingOutcome,
  listUnlinkedActionItems,
  getPlanDocData,
} from "@/db/queries/roadmap";
import { PlanningClient } from "@/components/roadmap/planning-client";

/** Planning session (FR-PLN-1/2/3/4): what changed since the last committed
 *  plan, the unplanned-work triage queue, outcomes for completed initiatives,
 *  and one button to commit the new plan. */
export default async function PlanningSessionPage() {
  const user = await requireUser();

  const data = await safeRead(async () => {
    const [lastCommit, current, unlinked, needOutcome, planDoc] = await Promise.all([
      getLastCommittedPlan(user.workspaceId),
      buildRoadmapSnapshot(user.workspaceId),
      listUnlinkedActionItems(user.workspaceId),
      listInitiativesNeedingOutcome(user.workspaceId),
      getPlanDocData(user.workspaceId),
    ]);

    let drift: PlanDrift | null = null;
    if (lastCommit) {
      const baseParsed = parseRoadmapMd(lastCommit.snapshotMd);
      const base = resolveSnapshotTokens(baseParsed.initiatives, current);
      drift = computePlanDrift(base, current);
    }

    return {
      drift,
      lastCommit: lastCommit
        ? {
            version: lastCommit.version,
            committedAt: lastCommit.createdAt.toISOString(),
            note: lastCommit.note,
          }
        : null,
      unlinked,
      needOutcome,
      initiatives: planDoc.initiatives.map((i) => ({ id: i.id, title: i.title })),
    };
  }, null);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">
              Planning session
            </h1>
            <p className="text-[13px] text-text-secondary">
              {data.data?.lastCommit
                ? `Reviewing changes since plan v${data.data.lastCommit.version} (${new Date(
                    data.data.lastCommit.committedAt,
                  ).toLocaleDateString()})`
                : "First session — commit creates your baseline plan."}
            </p>
          </div>
          <Link
            href="/roadmap"
            className="text-[13px] text-text-secondary hover:text-text-primary"
          >
            ← Roadmap
          </Link>
        </header>
        <WorkNav />
        {data.data ? (
          <PlanningClient
            drift={data.data.drift}
            unlinked={data.data.unlinked.map((u) => ({
              ...u,
              createdAt: u.createdAt.toISOString(),
            }))}
            needOutcome={data.data.needOutcome}
            initiatives={data.data.initiatives}
            hasBaseline={data.data.lastCommit !== null}
          />
        ) : (
          <p className="text-[13px] text-text-secondary">
            Could not load planning data.
          </p>
        )}
      </main>
    </>
  );
}
