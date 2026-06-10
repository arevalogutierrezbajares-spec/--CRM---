import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { WorkNav } from "@/components/work/work-nav";
import { safeRead } from "@/lib/db-status";
import { DbBanner } from "@/components/db-banner";
import { listPlanVersions } from "@/db/queries/roadmap";

const SOURCE_LABEL: Record<string, string> = {
  export: "Export",
  import: "Import",
  commit: "Plan commit",
};

/** Plan history (FR-PLV-2) — the ledger behind exports, imports and commits. */
export default async function PlanHistoryPage() {
  const user = await requireUser();
  const res = await safeRead(
    () => listPlanVersions(user.workspaceId),
    [] as Awaited<ReturnType<typeof listPlanVersions>>,
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Plan history</h1>
          <p className="text-[13px] text-text-secondary">
            Every export, applied import, and plan commit — newest first.
          </p>
        </header>
        <WorkNav />
        {!res.ok && <DbBanner error={(res as { error?: string }).error ?? ""} />}

        {res.data.length === 0 ? (
          <p className="text-[13px] text-text-secondary py-6">
            No plan versions yet. Export the roadmap once to create v1.
          </p>
        ) : (
          <div
            className="rounded-lg border bg-card divide-y"
            style={{ borderColor: "var(--border-default)" }}
          >
            {res.data.map((v) => {
              const s = (v.summary ?? {}) as Record<string, number>;
              const summaryText =
                v.source === "import"
                  ? `${s.creates ?? 0} created · ${s.updates ?? 0} updated · ${s.archives ?? 0} archived`
                  : `${s.initiatives ?? "—"} initiatives`;
              return (
                <div
                  key={v.id}
                  className="px-3 py-2.5 flex items-center gap-3"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <span className="text-[13px] font-semibold w-12">v{v.version}</span>
                  <span className="text-tiny uppercase tracking-wide text-text-tertiary w-24">
                    {SOURCE_LABEL[v.source] ?? v.source}
                  </span>
                  <span className="text-[12.5px] text-text-secondary flex-1 truncate">
                    {v.note ?? summaryText}
                  </span>
                  <span className="text-[12px] text-text-tertiary">
                    {v.authorName ?? "—"}
                  </span>
                  <span className="text-[12px] text-text-tertiary">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
