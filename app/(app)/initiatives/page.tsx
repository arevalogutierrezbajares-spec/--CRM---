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

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function InitiativesPage() {
  const user = await requireUser();

  try {
    await seedDefaultThemes(user.workspaceId);
  } catch {
    /* ignore */
  }

  const [initsRes, themesRes] = await Promise.all([
    safeRead<InitiativeListItem[]>(
      () => listInitiatives({ workspaceId: user.workspaceId }),
      [],
    ),
    safeRead(() => listThemes(user.workspaceId), []),
  ]);

  // Group by status
  const groups = {
    active: initsRes.data.filter((i) => i.status === "active"),
    planning: initsRes.data.filter((i) => i.status === "planning"),
    paused: initsRes.data.filter((i) => i.status === "paused"),
    done: initsRes.data.filter((i) => i.status === "done"),
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Work</h1>
          <p className="text-[13px] text-text-secondary">
            Multi-week efforts grouped by status. Themes are cross-venture labels.
          </p>
        </header>

        <WorkNav />

        {!initsRes.ok && (
          <DbBanner error={(initsRes as { error?: string }).error ?? ""} />
        )}

        {/* Themes panel */}
        {themesRes.data.length > 0 && (
          <DashCard>
            <SectionLabel icon={Target}>Themes</SectionLabel>
            <ThemeChips themes={themesRes.data} />
          </DashCard>
        )}

        {initsRes.data.length === 0 ? (
          <div
            className="rounded-lg border bg-card p-6 text-center"
            style={{ borderColor: "var(--border-default)" }}
          >
            <p className="text-[13px] text-text-secondary">
              No initiatives yet — track your multi-week efforts here.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/initiatives/new">Create your first</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {(["active", "planning", "paused", "done"] as const).map(
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
  return (
    <Link
      href={`/initiatives/${init.id}`}
      className="block rounded-lg border bg-card p-3 hover:bg-surface transition-colors"
      style={{ borderColor: "var(--border-default)" }}
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
      {init.projectTitle && (
        <div className="text-tiny text-text-tertiary mt-1.5">
          {init.projectTitle}
        </div>
      )}
      {init.themes.length > 0 && (
        <div className="mt-2">
          <ThemeChips themes={init.themes} size="xs" />
        </div>
      )}
    </Link>
  );
}
