import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HealthBadge } from "@/components/ui/health-badge";
import { DbBanner } from "@/components/db-banner";
import { ColumnHeader } from "@/components/grid/column-header";
import { FilterBar } from "@/components/grid/filter-bar";
import { SavedViews } from "@/components/grid/saved-views";
import { ExportButton } from "@/components/grid/export-button";
import {
  listProjects,
  type ProjectListItem,
} from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { formatDate } from "@/lib/utils";
import {
  parseSort,
  parseFilter,
  applySort,
  applyFilters,
  groupBy,
} from "@/lib/grid-state";

type SearchParams = Promise<{
  status?: string;
  sort?: string;
  filter?: string;
  group?: string;
}>;

const statusVariant: Record<
  "active" | "waiting" | "done" | "lost",
  "default" | "warning" | "success" | "secondary"
> = {
  active: "default",
  waiting: "warning",
  done: "success",
  lost: "secondary",
};


export default async function ProjectsPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const queryString = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
  );

  const statusFilter =
    sp.status === "active" ||
    sp.status === "waiting" ||
    sp.status === "done" ||
    sp.status === "lost"
      ? sp.status
      : undefined;

  const res = await safeRead<ProjectListItem[]>(
    () => listProjects({ ownerId: user.id, status: statusFilter }),
    [],
  );

  const sort = parseSort(sp.sort);
  const filters = parseFilter(sp.filter);
  const group = sp.group;

  const filtered = applyFilters<ProjectListItem>(res.data, filters, {
    status: (r, v) => r.status === v,
    health: (r, v) => r.computedHealth === v,
    template: (r, v) => (r.templateName ?? "") === v,
  });
  const sorted = applySort<ProjectListItem>(filtered, sort, {
    title: (r) => r.title.toLowerCase(),
    status: (r) => r.status,
    health: (r) =>
      r.computedHealth === "red" ? 0 : r.computedHealth === "amber" ? 1 : 2,
    template: (r) => r.templateName ?? "",
    open: (r) => r.milestoneOpenCount,
    due: (r) => r.dueDate ?? null,
    updated: (r) => r.updatedAt,
  });
  const grouped = groupBy<ProjectListItem>(sorted, group, (r) => {
    if (group === "status") return r.status;
    if (group === "health") return r.computedHealth;
    if (group === "template") return r.templateName ?? "—";
    return "";
  });

  const templateNames = Array.from(
    new Set(res.data.map((p) => p.templateName).filter(Boolean)),
  ) as string[];

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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Every deal is a project. Caney onboarding, VAV partner deals, BD
            warm intros — all tracked the same way.
          </p>
        </header>

        <div className="mb-4 flex items-end justify-between gap-3">
          <FilterBar
            options={[
              {
                col: "status",
                label: "Status",
                values: [
                  { value: "active", label: "Active" },
                  { value: "waiting", label: "Waiting" },
                  { value: "done", label: "Done" },
                  { value: "lost", label: "Lost" },
                ],
              },
              {
                col: "health",
                label: "Health",
                values: [
                  { value: "green", label: "Green" },
                  { value: "amber", label: "Amber" },
                  { value: "red", label: "Red" },
                ],
              },
              {
                col: "template",
                label: "Template",
                values: templateNames.map((n) => ({ value: n, label: n })),
              },
            ]}
            groupOptions={[
              { value: "status", label: "Status" },
              { value: "health", label: "Health" },
              { value: "template", label: "Template" },
            ]}
          />
          <div className="flex items-center gap-2">
            <ExportButton endpoint="/api/export/projects" />
            <SavedViews namespace="projects" />
          </div>
        </div>

        {!res.ok && <DbBanner error={res.error} />}

        {sorted.length === 0 ? (
          <Card className="grid place-items-center px-6 py-10 text-center">
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {res.data.length === 0
                  ? "No projects yet."
                  : "No projects match these filters."}
              </p>
              {res.data.length === 0 && (
                <Button asChild size="sm">
                  <Link href="/projects/new">
                    <Plus className="h-4 w-4" /> New project
                  </Link>
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-left">
                  <tr>
                    <ColumnHeader
                      label="Title"
                      col="title"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Status"
                      col="status"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Health"
                      col="health"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Template"
                      col="template"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Open"
                      col="open"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Due"
                      col="due"
                      basePath="/projects"
                      searchParams={queryString}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[...grouped.entries()].map(([groupKey, items]) => (
                    <ProjectGroup
                      key={groupKey || "_all"}
                      groupKey={groupKey}
                      group={group}
                      items={items}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
              {sorted.length} project{sorted.length === 1 ? "" : "s"}
              {Object.keys(filters).length > 0 &&
                ` · filtered from ${res.data.length}`}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}

function ProjectGroup({
  groupKey,
  group,
  items,
}: {
  groupKey: string;
  group: string | undefined;
  items: ProjectListItem[];
}) {
  return (
    <>
      {group && (
        <tr className="bg-[var(--muted)]/15">
          <td
            colSpan={6}
            className="px-4 py-1.5 text-xs uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {groupKey}{" "}
            <span className="text-[var(--muted-foreground)]/70">
              · {items.length}
            </span>
          </td>
        </tr>
      )}
      {items.map((p) => (
        <tr
          key={p.id}
          className="transition-colors hover:bg-[var(--muted)]/30"
        >
          <td className="px-4 py-3">
            <Link
              href={`/projects/${p.id}`}
              className="font-medium hover:underline"
            >
              {p.title}
            </Link>
            {p.waitingOn && (
              <div className="text-xs text-[var(--muted-foreground)]">
                waiting on: {p.waitingOn}
              </div>
            )}
          </td>
          <td className="px-4 py-3">
            <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
          </td>
          <td className="px-4 py-3">
            <HealthBadge health={p.computedHealth} short />
            {p.milestoneOverdueCount > 0 && (
              <div className="text-xs text-[var(--health-red)]">
                {p.milestoneOverdueCount} overdue
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-[var(--muted-foreground)]">
            {p.templateName ?? "—"}
          </td>
          <td className="px-4 py-3">{p.milestoneOpenCount}</td>
          <td className="px-4 py-3 text-[var(--muted-foreground)]">
            {p.dueDate ? formatDate(p.dueDate) : "—"}
          </td>
        </tr>
      ))}
    </>
  );
}
