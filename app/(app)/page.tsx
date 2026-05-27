import Link from "next/link";
import { AlertCircle, CalendarClock, Clock4 } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DbBanner } from "@/components/db-banner";
import {
  listDueThisWeek,
  listBlockedProjects,
  listStaleFriends,
  type DueItem,
  type BlockedProject,
  type StaleContact,
} from "@/db/queries/this-week";
import { touchDensity, type DensityCell } from "@/db/queries/density";
import { Heatmap } from "@/components/density/heatmap";
import { safeRead } from "@/lib/db-status";
import { formatDate } from "@/lib/utils";

export default async function ThisWeekPage() {
  const user = await requireUser();

  const [dueRes, blockedRes, staleRes, densityRes] = await Promise.all([
    safeRead<DueItem[]>(() => listDueThisWeek(user.id), []),
    safeRead<BlockedProject[]>(() => listBlockedProjects(user.id), []),
    safeRead<StaleContact[]>(() => listStaleFriends(user.id), []),
    safeRead<DensityCell[]>(() => touchDensity({ workspaceId: user.workspaceId }), []),
  ]);

  const dueCount = dueRes.data.length;
  const overdueCount = dueRes.data.filter((d) => d.isOverdue).length;
  const blockedCount = blockedRes.data.length;
  const overdueBlockedCount = blockedRes.data.filter(
    (b) => b.isOverdue,
  ).length;

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">This Week</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Due, blocked, stale across your contacts and projects.
          </p>
        </header>

        {(!dueRes.ok || !blockedRes.ok || !staleRes.ok) && (
          <DbBanner
            error={
              dueRes.ok && blockedRes.ok && staleRes.ok
                ? ""
                : (dueRes as { error?: string }).error ??
                  (blockedRes as { error?: string }).error ??
                  (staleRes as { error?: string }).error ??
                  "Database error"
            }
          />
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Due this week"
            value={dueCount}
            sub={
              overdueCount > 0
                ? `${overdueCount} overdue`
                : dueCount > 0
                  ? "on track"
                  : "—"
            }
            tone={overdueCount > 0 ? "danger" : "default"}
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <StatCard
            label="Blocked"
            value={blockedCount}
            sub={
              overdueBlockedCount > 0
                ? `${overdueBlockedCount} past expected unblock`
                : "no overdue blockers"
            }
            tone={overdueBlockedCount > 0 ? "danger" : "warning"}
            icon={<AlertCircle className="h-4 w-4" />}
          />
          <StatCard
            label="Stale friends"
            value={staleRes.data.length}
            sub="no touch in 60+ days"
            tone={staleRes.data.length > 0 ? "warning" : "default"}
            icon={<Clock4 className="h-4 w-4" />}
          />
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Due this week</CardTitle>
            </CardHeader>
            <CardContent>
              {dueRes.data.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Nothing on the calendar in the next 7 days.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {dueRes.data
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    .map((d) => (
                      <li
                        key={d.milestoneId}
                        className="flex items-start justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${d.projectId}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {d.title}
                          </Link>
                          <div className="truncate text-xs text-[var(--muted-foreground)]">
                            {d.projectTitle}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge
                            variant={d.isOverdue ? "danger" : "outline"}
                            className="text-xs"
                          >
                            {formatDate(d.dueDate)}
                          </Badge>
                          {d.status === "blocked" && (
                            <div className="mt-1 text-xs text-[var(--health-amber)]">
                              blocked
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blocked projects</CardTitle>
            </CardHeader>
            <CardContent>
              {blockedRes.data.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Nothing is currently waiting.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {blockedRes.data.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${b.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {b.title}
                        </Link>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          waiting on: {b.waitingOn}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {b.expectedUnblockDate && (
                          <Badge
                            variant={b.isOverdue ? "danger" : "outline"}
                            className="text-xs"
                          >
                            unblock {formatDate(b.expectedUnblockDate)}
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Touch density · last 90 days</CardTitle>
            </CardHeader>
            <CardContent>
              {densityRes.data.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No touch activity yet.
                </p>
              ) : (
                <Heatmap cells={densityRes.data} />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Stale friends</CardTitle>
            </CardHeader>
            <CardContent>
              {staleRes.data.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Friends are warm. Nothing has gone cold past 60 days.
                </p>
              ) : (
                <ul className="grid gap-2 md:grid-cols-2">
                  {staleRes.data.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2"
                    >
                      <Link
                        href={`/contacts/${s.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {s.name}
                      </Link>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {s.daysSince === null
                          ? "never"
                          : `${s.daysSince}d ago`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "default" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const ring =
    tone === "danger"
      ? "ring-1 ring-[var(--health-red)]/30"
      : tone === "warning"
        ? "ring-1 ring-[var(--health-amber)]/30"
        : "";
  return (
    <Card className={ring}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">{sub}</p>
      </CardContent>
    </Card>
  );
}
