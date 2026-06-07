import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import {
  InitiativeStatusBadge,
  WorkPriorityBadge,
} from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import {
  FilterBar,
  type FilterDimension,
} from "@/components/work/filter-bar";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { safeRead } from "@/lib/db-status";
import {
  listInitiatives,
  listThemes,
  seedDefaultThemes,
  type InitiativeListItem,
} from "@/db/queries/work";
import { listLines } from "@/db/queries/lines-of-business";
import { listAllUsers } from "@/db/queries/users";

type SearchParams = Promise<{
  status?: string;
  priority?: string;
  theme?: string;
  venture?: string;
  owner?: string;
}>;

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const ALLOWED_STATUS = ["planning", "active", "paused", "done", "cancelled"];
const ALLOWED_PRIORITY = ["now", "next", "later", "backlog"];

export default async function InitiativesPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  try {
    await seedDefaultThemes(user.workspaceId);
  } catch {
    /* ignore */
  }

  const [initsRes, allInitsRes, themesRes, projectsRes, usersRes] =
    await Promise.all([
      safeRead<InitiativeListItem[]>(
        () =>
          listInitiatives({
            workspaceId: user.workspaceId,
            status: ALLOWED_STATUS.includes(sp.status ?? "")
              ? (sp.status as "planning" | "active" | "paused" | "done" | "cancelled")
              : undefined,
            priority: ALLOWED_PRIORITY.includes(sp.priority ?? "")
              ? (sp.priority as "now" | "next" | "later" | "backlog")
              : undefined,
            projectId: sp.venture || undefined,
            themeId: sp.theme || undefined,
            ownerUserId: sp.owner || undefined,
          }),
        [],
      ),
      // Unfiltered list for sidebar counts
      safeRead<InitiativeListItem[]>(
        () => listInitiatives({ workspaceId: user.workspaceId }),
        [],
      ),
      safeRead(() => listThemes(user.workspaceId), []),
      safeRead(
        () => listLines({ workspaceId: user.workspaceId, status: "active" }),
        [],
      ),
      safeRead(() => listAllUsers(), []),
    ]);

  // Counts for filter chips computed from the unfiltered set
  const themeCounts = new Map<string, number>();
  const ventureCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const priorityCounts = new Map<string, number>();
  const ownerCounts = new Map<string, number>();
  for (const init of allInitsRes.data) {
    statusCounts.set(init.status, (statusCounts.get(init.status) ?? 0) + 1);
    priorityCounts.set(
      init.priority,
      (priorityCounts.get(init.priority) ?? 0) + 1,
    );
    if (init.lobId)
      ventureCounts.set(
        init.lobId,
        (ventureCounts.get(init.lobId) ?? 0) + 1,
      );
    if (init.ownerUserId)
      ownerCounts.set(
        init.ownerUserId,
        (ownerCounts.get(init.ownerUserId) ?? 0) + 1,
      );
    for (const t of init.themes) {
      themeCounts.set(t.id, (themeCounts.get(t.id) ?? 0) + 1);
    }
  }

  const dimensions: FilterDimension[] = [
    {
      key: "theme",
      label: "Theme",
      options: themesRes.data
        .map((t) => ({
          value: t.id,
          label: t.name,
          color: t.color,
          count: themeCounts.get(t.id) ?? 0,
        }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      key: "venture",
      label: "Venture",
      options: projectsRes.data
        .map((p) => ({
          value: p.id,
          label: p.title,
          count: ventureCounts.get(p.id) ?? 0,
        }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      key: "status",
      label: "Status",
      options: ALLOWED_STATUS.map((s) => ({
        value: s,
        label: s,
        count: statusCounts.get(s) ?? 0,
      })),
    },
    {
      key: "priority",
      label: "Priority",
      options: ALLOWED_PRIORITY.map((p) => ({
        value: p,
        label: p,
        count: priorityCounts.get(p) ?? 0,
      })),
    },
    {
      key: "owner",
      label: "Owner",
      options: usersRes.data
        .filter((u) => (ownerCounts.get(u.id) ?? 0) > 0)
        .map((u) => ({
          value: u.id,
          label: u.displayName,
          count: ownerCounts.get(u.id) ?? 0,
        })),
    },
  ];

  // Group displayed (filtered) by status
  const groups = {
    active: initsRes.data.filter((i) => i.status === "active"),
    planning: initsRes.data.filter((i) => i.status === "planning"),
    paused: initsRes.data.filter((i) => i.status === "paused"),
    done: initsRes.data.filter((i) => i.status === "done"),
    cancelled: initsRes.data.filter((i) => i.status === "cancelled"),
  };

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild size="sm">
            <Link href="/initiatives/new">
              <Plus className="h-4 w-4" /> New initiative
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Initiatives</h1>
          <p className="text-[13px] text-text-secondary">
            {allInitsRes.data.length} initiative
            {allInitsRes.data.length === 1 ? "" : "s"} across all ventures · filter
            by theme to slice biz-dev vs tech vs ops.
          </p>
        </header>

        <WorkNav />

        {!initsRes.ok && (
          <DbBanner error={(initsRes as { error?: string }).error ?? ""} />
        )}

        {/* Filters */}
        <DashCard>
          <SectionLabel icon={Target}>Filter</SectionLabel>
          <FilterBar dimensions={dimensions} />
        </DashCard>

        {initsRes.data.length === 0 ? (
          <div
            className="rounded-lg border bg-card p-6 text-center"
            style={{ borderColor: "var(--border-default)" }}
          >
            <p className="text-[13px] text-text-secondary">
              {allInitsRes.data.length === 0
                ? "No initiatives yet — track your multi-week efforts here."
                : "No initiatives match these filters."}
            </p>
            {allInitsRes.data.length === 0 && (
              <Button asChild size="sm" className="mt-3">
                <Link href="/initiatives/new">Create your first</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {(["active", "planning", "paused", "done", "cancelled"] as const).map(
              (status) => {
                const items = groups[status];
                if (items.length === 0) return null;
                return (
                  <section key={status}>
                    <h2 className="text-label text-text-secondary mb-2">
                      {status} · {items.length}
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((init) => (
                        <InitiativeCard key={init.id} init={init} />
                      ))}
                    </div>
                  </section>
                );
              },
            )}
          </div>
        )}
      </main>
    </>
  );
}

function InitiativeCard({ init }: { init: InitiativeListItem }) {
  // Color the card's left border by the primary theme for at-a-glance categorization
  const primaryColor = init.themes[0]?.color ?? "var(--border-default)";

  return (
    <Link
      href={`/initiatives/${init.id}`}
      className="block rounded-lg border bg-card p-3 hover:bg-surface transition-colors border-l-[3px]"
      style={{
        borderColor: "var(--border-default)",
        borderLeftColor: primaryColor,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-text-primary line-clamp-2">
          {init.title}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <InitiativeStatusBadge status={init.status} />
          <WorkPriorityBadge priority={init.priority} />
        </div>
      </div>
      {init.summary && (
        <p className="text-tiny text-text-secondary mt-1 line-clamp-2">
          {init.summary}
        </p>
      )}
      <ProgressBar pct={init.progressPct} className="my-2.5" />
      <div className="flex items-center justify-between text-tiny text-text-tertiary">
        <span>
          {init.progressPct}% · {init.taskDoneCount}/{init.taskCount} tasks
        </span>
        {init.targetEndDate && <span>by {shortDate(init.targetEndDate)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {init.projectTitle && (
          <span className="text-tiny text-text-tertiary truncate">
            {init.projectTitle}
          </span>
        )}
        {init.themes.length > 0 && (
          <div className="shrink-0">
            <ThemeChips themes={init.themes} size="xs" />
          </div>
        )}
      </div>
    </Link>
  );
}
