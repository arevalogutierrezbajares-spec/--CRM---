import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import {
  listReconnectCandidates,
  RECONNECT_THRESHOLD_DAYS,
  type ReconnectCandidate,
} from "@/db/queries/reconnect";
import { ReconnectCards } from "./reconnect-cards";

export default async function ReconnectPage() {
  const user = await requireUser();

  const res = await safeRead<ReconnectCandidate[]>(
    () => listReconnectCandidates(user.workspaceId),
    [],
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-6 space-y-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-text-primary">
            Reconnect
          </h1>
          <p className="text-[13px] text-text-secondary">
            Warm contacts (friends + partners) you haven&apos;t touched in{" "}
            {RECONNECT_THRESHOLD_DAYS}+ days — coldest first. Draft an opener and
            mark it done to reset the clock.
          </p>
        </div>

        {!res.ok ? (
          <DbBanner error={(res as { error?: string }).error ?? ""} />
        ) : (
          <ReconnectCards candidates={res.data} />
        )}
      </main>
    </>
  );
}
