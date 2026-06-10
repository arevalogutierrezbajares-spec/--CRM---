import Link from "next/link";
import { Plus, Filter } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { ProjectCard } from "@/components/lob/project-card";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import {
  FilterBar,
  type FilterDimension,
} from "@/components/work/filter-bar";
import {
  listBusinessLinksForLobs,
  listLines,
  type BusinessRef,
  type LobListItem,
} from "@/db/queries/lines-of-business";
import { safeRead } from "@/lib/db-status";

type SearchParams = Promise<{
  status?: string;
  health?: string;
}>;

const ALLOWED_STATUS = ["active", "waiting", "done", "lost"] as const;
const ALLOWED_HEALTH = ["green", "amber", "red"] as const;

export default async function ProjectsPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const allRes = await safeRead<LobListItem[]>(
    () => listLines({ workspaceId: user.workspaceId }),
    [],
  );

  let filtered = allRes.data;
  if (sp.status && ALLOWED_STATUS.includes(sp.status as (typeof ALLOWED_STATUS)[number])) {
    filtered = filtered.filter((p) => p.status === sp.status);
  }
  if (sp.health && ALLOWED_HEALTH.includes(sp.health as (typeof ALLOWED_HEALTH)[number])) {
    filtered = filtered.filter((p) => p.computedHealth === sp.health);
  }

  const statusCounts = new Map<string, number>();
  const healthCounts = new Map<string, number>();
  for (const p of allRes.data) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
    healthCounts.set(
      p.computedHealth,
      (healthCounts.get(p.computedHealth) ?? 0) + 1,
    );
  }

  const dimensions: FilterDimension[] = [
    {
      key: "status",
      label: "Status",
      options: ALLOWED_STATUS.map((s) => ({
        value: s,
        label: s,
        count: statusCounts.get(s) ?? 0,
      })).filter((o) => (o.count ?? 0) > 0),
    },
    {
      key: "health",
      label: "Health",
      options: ALLOWED_HEALTH.map((h) => ({
        value: h,
        label: h,
        count: healthCounts.get(h) ?? 0,
        color: h === "green" ? "#1D9E75" : h === "amber" ? "#BA7517" : "#E24B4A",
      })).filter((o) => (o.count ?? 0) > 0),
    },
  ];

  // Kind-driven grouping: the standing Businesses (VAV, CaneyCloud) render
  // large on top — stacked vertically in founding order, not last-touched,
  // so the gallery doesn't reshuffle every time one gets an edit. Sub-modules
  // keep their row; everything else is a Project, grouped by status below.
  // (`featured` stays in the DB but no longer drives the gallery.)
  const businesses = filtered
    .filter((p) => p.kind === "business" && !p.parentLobId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const modules = filtered.filter((p) => p.parentLobId);
  const projectRows = filtered.filter((p) => p.kind === "project" && !p.parentLobId);

  const groups: Record<
    "active" | "waiting" | "done" | "lost",
    LobListItem[]
  > = { active: [], waiting: [], done: [], lost: [] };
  for (const p of projectRows) groups[p.status].push(p);

  // Linked-business chips for the project cards (one batched query).
  const businessLinks = await safeRead<Map<string, BusinessRef[]>>(
    () =>
      listBusinessLinksForLobs(
        user.workspaceId,
        projectRows.map((p) => p.id),
      ),
    new Map(),
  );

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild size="sm">
            <Link href="/lob/new">
              <Plus className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Business</h1>
          <p className="text-[13px] text-text-secondary">
            {allRes.data.filter((p) => p.kind === "business").length} business
            {allRes.data.filter((p) => p.kind === "business").length === 1 ? "" : "es"} ·{" "}
            {allRes.data.filter((p) => p.kind === "project").length} project
            {allRes.data.filter((p) => p.kind === "project").length === 1 ? "" : "s"} — each
            groups its workstreams, links, docs &amp; contacts.
          </p>
        </header>

        {!allRes.ok && <DbBanner error={allRes.error} />}

        {dimensions.some((d) => d.options.length > 0) && (
          <DashCard>
            <SectionLabel icon={Filter}>Filter</SectionLabel>
            <FilterBar dimensions={dimensions} />
          </DashCard>
        )}

        {filtered.length === 0 ? (
          <div
            className="rounded-lg border bg-card p-6 text-center"
            style={{ borderColor: "var(--border-default)" }}
          >
            <p className="text-[13px] text-text-secondary">
              {allRes.data.length === 0
                ? "No businesses or projects yet."
                : "No businesses or projects match these filters."}
            </p>
            {allRes.data.length === 0 && (
              <Button asChild size="sm" className="mt-3">
                <Link href="/lob/new">
                  <Plus className="h-4 w-4" /> New project
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Businesses at the top — VAV then CaneyCloud, stacked
                   full-width, one per row (not side by side) ──────────── */}
            {businesses.length > 0 && (
              <div className="grid gap-4">
                {businesses.map((p) => (
                  <ProjectCard key={p.id} project={p} variant="featured" />
                ))}
              </div>
            )}

            {/* ── Active sub-modules (children of a business) ─────────── */}
            {modules.length > 0 && (
              <section>
                <h2 className="text-label text-text-secondary mb-3">
                  Modules · {modules.length}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Projects (shaded / back-burner), grouped by status ──── */}
            {(["active", "waiting", "done", "lost"] as const).map((s) => {
              const items = groups[s];
              if (items.length === 0) return null;
              return (
                <section key={s}>
                  <h2 className="text-label text-text-secondary mb-3">
                    {s === "active" ? "Projects" : s} · {items.length}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        variant="muted"
                        businesses={businessLinks.data.get(p.id) ?? []}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
