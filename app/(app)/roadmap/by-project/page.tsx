import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import { safeRead } from "@/lib/db-status";
import { getPlanDocData, type PlanDocData } from "@/db/queries/roadmap";
import { RoadmapMatrix } from "@/components/roadmap/roadmap-matrix";

/**
 * FR-E6 — the master-plan matrix: functions (horizontals) × LoBs (verticals).
 * Every initiative ties to both axes; the reserved Uncategorized row / Unassigned
 * column surface anything missing one, so nothing is orphaned.
 */
export default async function RoadmapByProjectPage() {
  const user = await requireUser();
  const planRes = await safeRead<PlanDocData>(
    () => getPlanDocData(user.workspaceId),
    { initiatives: [], members: [], lobs: [], functions: [] },
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Roadmap — by project</h1>
            <p className="text-[13px] text-text-secondary">
              The master plan as a matrix: functions across the top of each line of business.
            </p>
          </div>
          <Link
            href="/roadmap"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] text-text-secondary hover:text-text-primary"
            style={{ borderColor: "var(--border-default)" }}
          >
            <ArrowLeft size={14} /> Timeline view
          </Link>
        </header>

        <WorkNav />

        {!planRes.ok && <DbBanner error={(planRes as { error?: string }).error ?? ""} />}

        <RoadmapMatrix data={planRes.data} />
      </main>
    </>
  );
}
