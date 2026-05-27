import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, GitBranch, Folder, User, Clock, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import {
  OverlordPriorityBadge,
  OverlordStatusBadge,
} from "@/components/overlord/status-badge";
import { getOverlordTask } from "@/db/queries/overlord";

type Params = Promise<{ taskKey: string }>;

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OverlordTaskDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { taskKey } = await props.params;
  const decoded = decodeURIComponent(taskKey);

  const task = await getOverlordTask({
    workspaceId: user.workspaceId,
    taskKey: decoded,
  });
  if (!task) notFound();

  const ac = (task.acceptanceCriteria ?? []) as Array<{
    text: string;
    done: boolean;
  }>;
  const log = (task.activityLog ?? []) as Array<{
    ts: string;
    agent: string;
    note: string;
  }>;
  const acDone = ac.filter((c) => c.done).length;

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/overlord"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft size={14} /> All Overlord tasks
        </Link>

        <header>
          <div className="flex items-center gap-2 text-tiny text-text-tertiary font-mono">
            <span>{task.sectionName}</span>
            <span>·</span>
            <span>{task.taskKey}</span>
          </div>
          <h1 className="text-[22px] font-medium tracking-tight mt-1">
            {task.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OverlordStatusBadge status={task.status} />
            <OverlordPriorityBadge priority={task.priority} />
            {task.taskType && (
              <span className="text-tiny text-text-tertiary uppercase font-mono">
                {task.taskType}
              </span>
            )}
          </div>
        </header>

        {/* Future-feature stub */}
        <div
          className="rounded-md border border-dashed bg-surface/30 px-3 py-2 text-tiny text-text-secondary flex items-center gap-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          <span className="text-text-tertiary">⚡ Coming soon:</span>
          <button
            type="button"
            disabled
            className="rounded border px-2 py-0.5 text-tiny text-text-tertiary cursor-not-allowed"
            style={{ borderColor: "var(--border-default)" }}
            title="Future: trigger an agent to pick up this task"
          >
            Claim from CRM
          </button>
          <button
            type="button"
            disabled
            className="rounded border px-2 py-0.5 text-tiny text-text-tertiary cursor-not-allowed"
            style={{ borderColor: "var(--border-default)" }}
            title="Future: dispatch this task to a specific agent"
          >
            Dispatch agent
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            {task.description && (
              <DashCard>
                <SectionLabel>Description</SectionLabel>
                <div className="text-[13px] text-text-primary whitespace-pre-wrap leading-relaxed">
                  {task.description}
                </div>
              </DashCard>
            )}

            {ac.length > 0 && (
              <DashCard>
                <SectionLabel
                  right={
                    <span className="text-tiny text-text-tertiary tabular-nums">
                      {acDone}/{ac.length}
                    </span>
                  }
                >
                  Acceptance criteria
                </SectionLabel>
                <ul className="space-y-1.5">
                  {ac.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px]">
                      <span
                        className={
                          c.done
                            ? "text-green-text shrink-0"
                            : "text-text-tertiary shrink-0"
                        }
                      >
                        {c.done ? "☑" : "☐"}
                      </span>
                      <span
                        className={
                          c.done
                            ? "text-text-secondary line-through"
                            : "text-text-primary"
                        }
                      >
                        {c.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </DashCard>
            )}

            {log.length > 0 && (
              <DashCard>
                <SectionLabel>Activity log</SectionLabel>
                <ul className="space-y-3">
                  {log.map((e, i) => (
                    <li
                      key={i}
                      className="border-l-2 pl-3 py-0.5"
                      style={{ borderColor: "var(--ai-border)" }}
                    >
                      <div className="text-tiny text-text-tertiary tabular-nums">
                        {formatTs(e.ts)} · <span className="text-purple-text font-medium">{e.agent}</span>
                      </div>
                      <div className="text-[12.5px] text-text-primary whitespace-pre-wrap mt-0.5">
                        {e.note}
                      </div>
                    </li>
                  ))}
                </ul>
              </DashCard>
            )}
          </div>

          <aside className="space-y-4">
            <DashCard>
              <SectionLabel>Metadata</SectionLabel>
              <dl className="space-y-2 text-tiny">
                {task.claimedByAgent && (
                  <Row label={<><User size={10} className="inline" /> Claimed by</>} value={`${task.claimedByAgent}${task.claimedAt ? ` · ${formatTs(task.claimedAt.toISOString())}` : ""}`} />
                )}
                {task.completedByAgent && (
                  <Row label="Completed by" value={`${task.completedByAgent}${task.completedAt ? ` · ${formatTs(task.completedAt.toISOString())}` : ""}`} />
                )}
                {task.branch && (
                  <Row label={<><GitBranch size={10} className="inline" /> Branch</>} value={<span className="font-mono">{task.branch}</span>} />
                )}
                {task.lastHeartbeat && (
                  <Row label={<><Clock size={10} className="inline" /> Heartbeat</>} value={formatTs(task.lastHeartbeat.toISOString())} />
                )}
                {task.recommendedModel && (
                  <Row label="Model" value={<span className="font-mono">{task.recommendedModel}</span>} />
                )}
                {task.estTokens && <Row label="Est tokens" value={task.estTokens} />}
                {task.complexity && <Row label="Complexity" value={task.complexity} />}
                {task.risk && (
                  <Row label={<><AlertTriangle size={10} className="inline" /> Risk</>} value={task.risk} />
                )}
                {task.parallelSafe !== null && (
                  <Row label="Parallel safe" value={task.parallelSafe ? "yes" : "no"} />
                )}
                {task.dependsOn && <Row label="Depends on" value={<span className="font-mono">{task.dependsOn}</span>} />}
                {task.createdDate && (
                  <Row label="Created" value={task.createdDate} />
                )}
                {task.lastModifiedDate && (
                  <Row label="Modified" value={task.lastModifiedDate} />
                )}
              </dl>
            </DashCard>

            {task.scopePaths && task.scopePaths.length > 0 && (
              <DashCard>
                <SectionLabel icon={Folder}>Scope paths</SectionLabel>
                <ul className="space-y-1">
                  {task.scopePaths.map((p, i) => (
                    <li
                      key={i}
                      className="text-tiny text-text-secondary font-mono truncate"
                      title={p}
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </DashCard>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-tertiary shrink-0">{label}</dt>
      <dd className="text-text-primary text-right">{value}</dd>
    </div>
  );
}
