import Link from "next/link";
import { Plus, Filter } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { ProjectCard } from "@/components/projects/project-card";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import {
  FilterBar,
  type FilterDimension,
} from "@/components/work/filter-bar";
import { listProjects, type ProjectListItem } from "@/db/queries/projects";
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

  const allRes = await safeRead<ProjectListItem[]>(
    () => listProjects({ workspaceId: user.workspaceId }),
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

  // Split into Featured + the rest
  const featured = filtered.filter((p) => p.featured);
  const rest = filtered.filter((p) => !p.featured);

  const groups: Record<
    "active" | "waiting" | "done" | "lost",
    ProjectListItem[]
  > = { active: [], waiting: [], done: [], lost: [] };
  for (const p of rest) groups[p.status].push(p);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild size="sm">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Projects</h1>
          <p className="text-[13px] text-text-secondary">
            {allRes.data.length} venture{allRes.data.length === 1 ? "" : "s"} in your portfolio · each project has Business / Marketing / Tech sections inside.
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
                ? "No projects yet."
                : "No projects match these filters."}
            </p>
            {allRes.data.length === 0 && (
              <Button asChild size="sm" className="mt-3">
                <Link href="/projects/new">
                  <Plus className="h-4 w-4" /> New project
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Priority row at top (no label) ─────────────────────── */}
            {featured.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {featured.map((p) => (
                  <ProjectCard key={p.id} project={p} variant="featured" />
                ))}
              </div>
            )}

            {/* ── Rest, only labeled when status is NOT active ──────── */}
            {(["active", "waiting", "done", "lost"] as const).map((s) => {
              const items = groups[s];
              if (items.length === 0) return null;
              return (
                <section key={s}>
                  {s !== "active" && (
                    <h2 className="text-label text-text-secondary mb-3">
                      {s} · {items.length}
                    </h2>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => (
                      <ProjectCard key={p.id} project={p} />
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
