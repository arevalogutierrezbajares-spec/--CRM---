import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Pencil, Target } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HealthBadge } from "@/components/ui/health-badge";
import { DbBanner } from "@/components/db-banner";
import { MilestoneList } from "@/components/projects/milestone-list";
import { TouchList } from "@/components/touches/touch-list";
import { LinkSection } from "@/components/projects/link-section";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import { getProject, listProjectLinks } from "@/db/queries/projects";
import { listTouchesForProject } from "@/db/queries/touches";
import { listMeetingsForContact } from "@/db/queries/meetings";
import { safeRead } from "@/lib/db-status";
import { formatDate, formatRelative } from "@/lib/utils";
import { computeHealth } from "@/lib/health";

type Params = Promise<{ id: string }>;

const STATUS_VARIANT: Record<
  "active" | "waiting" | "done" | "lost",
  "blue" | "amber" | "green" | "neutral"
> = {
  active: "blue",
  waiting: "amber",
  done: "green",
  lost: "neutral",
};

export default async function ProjectDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [projectRes, touchesRes, linksRes] = await Promise.all([
    safeRead(() => getProject({ id, workspaceId: user.workspaceId }), null),
    safeRead(
      () => listTouchesForProject({ projectId: id, workspaceId: user.workspaceId }),
      [],
    ),
    safeRead(() => listProjectLinks({ projectId: id, workspaceId: user.workspaceId }), []),
  ]);

  if (projectRes.ok && !projectRes.data) notFound();
  const project = projectRes.data;
  if (!project) {
    return (
      <main className="p-6">
        <DbBanner error={(projectRes as { error?: string }).error ?? ""} />
      </main>
    );
  }

  const accent = project.coverColor ?? "var(--text-tertiary)";
  const health = computeHealth({
    status: project.status,
    expectedUnblockDate: project.expectedUnblockDate,
    milestones: project.milestones.map((m) => ({
      status: m.status,
      dueDate: m.dueDate,
    })),
  });
  const currentStage = project.stages.find(
    (s) => s.id === project.currentStageId,
  );

  // Milestone aggregates
  const total = project.milestones.length;
  const done = project.milestones.filter((m) => m.status === "done").length;
  const open = total - done;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <div className="flex items-center gap-2">
            {project.primaryUrl && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={project.primaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> All projects
        </Link>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div
            className="px-6 py-5 flex items-start gap-4"
            style={{
              background: `linear-gradient(135deg, color-mix(in oklab, ${accent} 16%, var(--bg-card)) 0%, var(--bg-card) 100%)`,
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <div
              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-[36px]"
              style={{
                background: `color-mix(in oklab, ${accent} 22%, var(--bg-card))`,
                border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
              }}
            >
              {project.coverEmoji ?? "📁"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[24px] font-medium tracking-tight text-text-primary truncate">
                  {project.title}
                </h1>
                <DashBadge variant={STATUS_VARIANT[project.status]}>
                  {project.status}
                </DashBadge>
                <HealthBadge health={health} short />
              </div>
              {project.tagline && (
                <p className="text-[13px] text-text-secondary mt-1">
                  {project.tagline}
                </p>
              )}
              {project.statusText && (
                <p className="text-tiny text-text-tertiary font-mono mt-1.5">
                  {project.statusText}
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 flex-wrap text-tiny text-text-tertiary">
                {project.templateName && <span>{project.templateName}</span>}
                {currentStage && <span>stage: {currentStage.name}</span>}
                {project.dueDate && (
                  <span>due {formatDate(project.dueDate)}</span>
                )}
                {project.primaryUrl && (
                  <a
                    href={project.primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <ExternalLink size={10} /> {project.primaryUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Summary + progress bar */}
          <div className="px-6 py-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            {project.summary && (
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {project.summary}
              </p>
            )}
            <div className="space-y-2">
              <div className="flex justify-between text-tiny text-text-tertiary">
                <span>Milestones</span>
                <span className="tabular-nums">
                  {done}/{total} · {progressPct}%
                </span>
              </div>
              <ProgressBar pct={progressPct} fillClass="bg-green-mid" />
              <div className="flex justify-between text-tiny text-text-tertiary mt-1">
                <span>{open} open</span>
                <span>{project.contacts.length} contacts</span>
              </div>
            </div>
          </div>

          {project.status === "waiting" && project.waitingOn && (
            <div
              className="px-6 py-3 border-t text-tiny"
              style={{
                background: "color-mix(in oklab, var(--amber-mid) 8%, transparent)",
                borderColor: "var(--border-default)",
                color: "var(--amber-text)",
              }}
            >
              ⏸ Waiting on: <strong>{project.waitingOn}</strong>
              {project.expectedUnblockDate && (
                <> · expected {formatDate(project.expectedUnblockDate)}</>
              )}
            </div>
          )}
        </div>

        {/* ── Business / Marketing / Tech sections (the new core) ──── */}
        <div className="grid gap-3 lg:grid-cols-3">
          <LinkSection
            category="business"
            links={linksRes.data}
            emptyHint="No business links yet — add product briefs, pricing docs, deals, agreements."
          />
          <LinkSection
            category="marketing"
            links={linksRes.data}
            emptyHint="No marketing assets — add landing page, brand guide, social links, decks."
          />
          <LinkSection
            category="tech"
            links={linksRes.data}
            emptyHint="No tech links — add repo, deploy URLs, architecture docs, dashboards."
          />
        </div>

        {/* ── Ops / Design / Finance / Other (only show if present) ── */}
        {(["ops", "design", "finance", "other"] as const).some((c) =>
          linksRes.data.some((l) => l.category === c),
        ) && (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {(["ops", "design", "finance", "other"] as const).map((c) => {
              if (!linksRes.data.some((l) => l.category === c)) return null;
              return <LinkSection key={c} category={c} links={linksRes.data} />;
            })}
          </div>
        )}

        {/* ── Lower zone: milestones + timeline / sidebar ──────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <MilestoneList
                  projectId={project.id}
                  milestones={project.milestones.map((m) => ({
                    id: m.id,
                    title: m.title,
                    status: m.status,
                    dueDate: m.dueDate,
                    blockerText: m.blockerText,
                    order: m.order,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {!touchesRes.ok ? (
                  <DbBanner error={touchesRes.error} />
                ) : (
                  <TouchList touches={touchesRes.data} />
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-3">
            <DashCard>
              <SectionLabel icon={Target}>Linked contacts</SectionLabel>
              {project.contacts.length === 0 ? (
                <p className="text-tiny text-text-tertiary py-2">
                  None linked.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {project.contacts.map((c) => (
                    <li key={c.id} className="text-[12.5px]">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="font-medium hover:underline text-text-primary"
                      >
                        {c.name}
                      </Link>
                      <div className="text-tiny text-text-tertiary">
                        {c.relationshipType}
                        {c.organization ? ` · ${c.organization}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>

            <DashCard>
              <SectionLabel>Details</SectionLabel>
              <dl className="space-y-1 text-[12px]">
                <Row label="Notes path" value={project.notesPath ?? "—"} />
                <Row label="Created" value={formatRelative(project.createdAt)} />
                <Row label="Updated" value={formatRelative(project.updatedAt)} />
                <Separator className="my-2" />
                <Row label="Status" value={project.status} />
                <Row label="Health" value={health} />
                {project.repoUrl && (
                  <Row
                    label="Repo"
                    value={
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-primary hover:underline"
                      >
                        repo →
                      </a>
                    }
                  />
                )}
              </dl>
            </DashCard>
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary text-right truncate">{value}</dd>
    </div>
  );
}
