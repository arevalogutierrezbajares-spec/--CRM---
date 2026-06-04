import Link from "next/link";
import {
  BarChart3,
  Target,
  Megaphone,
  ListTodo,
  AlertTriangle,
  CheckCircle2,
  History,
} from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { todayInTz } from "@/lib/date/today";
import { Scorecard } from "@/components/dashboard/daily/scorecard";
import { ReviewNotes } from "@/components/review/review-notes";
import {
  listScorecard,
  listObjectives,
  type ScorecardRow,
  type ObjectiveView,
} from "@/db/queries/okrs";
import { listBlockedProjects, type BlockedProject } from "@/db/queries/this-week";
import { listOpenActionItems, type DashActionItem } from "@/db/queries/dashboard";
import { listPosts, type PostView } from "@/db/queries/town-hall";
import { weekMondayOf, getReviewForWeek, listReviews, type ReviewListItem } from "@/db/queries/review";

const STATUS_TONE: Record<string, string> = {
  on_track: "var(--green-mid)",
  at_risk: "var(--amber-text)",
  off_track: "var(--red-text)",
  done: "var(--blue-text)",
};
const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
};

function fmtWeek(weekOf: string): string {
  const [y, m, d] = weekOf.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const f = (dt: Date) => dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(start)} – ${f(end)}`;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof BarChart3;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-card p-4">
      <div className="mb-2.5 flex items-baseline gap-2">
        <Icon size={15} className="translate-y-0.5 text-text-tertiary" />
        <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        {hint && <span className="text-tiny text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function ReviewPage() {
  const user = await requireUser();
  const todayStr = todayInTz(user.timezone);
  const weekOf = weekMondayOf(todayStr);

  const [scorecardRes, objectivesRes, blockedRes, actionItemsRes, headlinesRes, savedRes, pastRes] =
    await Promise.all([
      safeRead<ScorecardRow[]>(() => listScorecard(user.workspaceId), []),
      safeRead<ObjectiveView[]>(() => listObjectives(user.workspaceId), []),
      safeRead<BlockedProject[]>(() => listBlockedProjects(user.workspaceId), []),
      safeRead<DashActionItem[]>(() => listOpenActionItems(user.workspaceId, 50, todayStr), []),
      safeRead<PostView[]>(() => listPosts({ workspaceId: user.workspaceId, viewerId: user.id, limit: 6 }), []),
      safeRead<{ notes: string | null } | null>(() => getReviewForWeek(user.workspaceId, weekOf), null),
      safeRead<ReviewListItem[]>(() => listReviews(user.workspaceId), []),
    ]);

  const scorecard = scorecardRes.data;
  const objectives = objectivesRes.data;
  const blocked = blockedRes.data;
  const overdueTodos = actionItemsRes.data.filter((a) => a.isOverdue);
  const todos = actionItemsRes.data;
  const headlines = headlinesRes.data;
  const past = pastRes.data;

  // Snapshot persisted with the saved review (a searchable record of the week).
  const snapshot = {
    weekOf,
    scorecard: scorecard.map((s) => ({ title: s.title, current: s.current, target: s.target, health: s.health })),
    objectives: objectives.map((o) => ({ title: o.title, status: o.status, progress: Math.round(o.progress * 100) })),
    blocked: blocked.length,
    overdue: overdueTodos.length,
    openTodos: todos.length,
  };

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} title="Weekly Review" />
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        {!scorecardRes.ok && <DbBanner error={scorecardRes.error} />}

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-[26px] leading-none text-text-primary">Weekly Review</h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              Week of {fmtWeek(weekOf)} · auto-assembled from your live data. Walk it top to bottom,
              then save the notes.
            </p>
          </div>
          <span className="text-tiny text-text-tertiary">Facilitator: {user.displayName}</span>
        </div>

        {/* 1 — Scorecard */}
        <Section icon={BarChart3} title="Scorecard" hint="are the numbers green?">
          {scorecard.length ? (
            <Scorecard rows={scorecard} />
          ) : (
            <EmptyHint>
              No scorecard metrics yet. <Link href="/priorities" className="text-[var(--blue-text)] hover:underline">Flag key results ★</Link> to populate it.
            </EmptyHint>
          )}
        </Section>

        {/* 2 — Priorities / Rock review */}
        <Section icon={Target} title="Priorities" hint="on track for the quarter?">
          {objectives.length ? (
            <ul className="space-y-1.5">
              {objectives.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-[13px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_TONE[o.status] }} title={STATUS_LABEL[o.status]} />
                  <Link href="/priorities" className="min-w-0 flex-1 truncate text-text-primary hover:underline">{o.title}</Link>
                  {o.ownerName && <span className="hidden shrink-0 text-tiny text-text-tertiary sm:inline">{o.ownerName}</span>}
                  <span className="shrink-0 text-tiny tabular-nums text-text-tertiary">{Math.round(o.progress * 100)}%</span>
                  <span className="shrink-0 text-tiny" style={{ color: STATUS_TONE[o.status] }}>{STATUS_LABEL[o.status]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint>
              No objectives this quarter. <Link href="/priorities" className="text-[var(--blue-text)] hover:underline">Set your priorities →</Link>
            </EmptyHint>
          )}
        </Section>

        {/* 3 — Headlines */}
        <Section icon={Megaphone} title="Headlines" hint="wins & news from Town Hall">
          {headlines.length ? (
            <ul className="space-y-1.5">
              {headlines.map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-[12.5px] text-text-secondary">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
                  <span className="min-w-0">
                    <span className="font-medium text-text-primary">{p.authorName}:</span> {p.body.slice(0, 160)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint>No recent posts.</EmptyHint>
          )}
        </Section>

        {/* 4 — To-Dos */}
        <Section icon={ListTodo} title="To-Dos" hint="carried-over action items">
          {todos.length ? (
            <ul className="space-y-1">
              {todos.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.isOverdue ? "bg-[var(--red-text)]" : "bg-text-tertiary"}`} />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{a.title}</span>
                  {a.dueDate && <span className="shrink-0 text-tiny text-text-tertiary">{a.isOverdue ? "overdue" : new Date(a.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                </li>
              ))}
              {todos.length > 12 && <li className="text-tiny text-text-tertiary">+{todos.length - 12} more</li>}
            </ul>
          ) : (
            <EmptyHint>No open action items. <Link href="/work" className="text-[var(--blue-text)] hover:underline">Work →</Link></EmptyHint>
          )}
        </Section>

        {/* 5 — Issues (IDS) */}
        <Section icon={AlertTriangle} title="Issues to solve (IDS)" hint="blocked + overdue — identify, discuss, solve">
          {blocked.length === 0 && overdueTodos.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-text-secondary">
              <CheckCircle2 size={15} className="text-green-mid" /> Nothing blocked or overdue. Clean week.
            </div>
          ) : (
            <ul className="space-y-1">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber-text)]" />
                  <Link href={`/projects/${b.id}`} className="min-w-0 flex-1 truncate text-text-primary hover:underline">{b.title}</Link>
                  <span className="shrink-0 text-tiny text-text-tertiary">blocked{b.waitingOn ? ` · ${b.waitingOn}` : ""}</span>
                </li>
              ))}
              {overdueTodos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red-text)]" />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{a.title}</span>
                  <span className="shrink-0 text-tiny text-[var(--red-text)]">overdue</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 6 — Notes */}
        <Section icon={CheckCircle2} title="Notes & decisions" hint="what did we decide / assign?">
          <ReviewNotes weekOf={weekOf} initialNotes={savedRes.data?.notes ?? ""} snapshot={snapshot} />
        </Section>

        {/* Past reviews */}
        {past.length > 0 && (
          <Section icon={History} title="Past reviews">
            <ul className="space-y-1.5">
              {past.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-[12.5px]">
                  <span className="shrink-0 font-medium tabular-nums text-text-primary">{fmtWeek(r.weekOf)}</span>
                  <span className="min-w-0 flex-1 truncate text-text-secondary">{r.notes?.slice(0, 120) || "—"}</span>
                  {r.facilitatorName && <span className="shrink-0 text-tiny text-text-tertiary">{r.facilitatorName}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-text-secondary">{children}</p>;
}
