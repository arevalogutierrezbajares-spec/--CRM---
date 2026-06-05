import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { LinksBoard } from "@/components/projects/links-board";
import {
  ModuleSwitcher,
  type ModuleTab,
} from "@/components/projects/module-switcher";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import {
  getProject,
  listProjectLinks,
  listProjects,
  type ProjectListItem,
  type ProjectLinkWithAuthor,
  type ProjectLinkView,
} from "@/db/queries/projects";
import { listContacts } from "@/db/queries/contacts";
import { listAttachedPaths } from "@/lib/project-files/storage";
import { recordProjectVisit } from "@/db/queries/pins";
import { listTouchesForProject } from "@/db/queries/touches";
import {
  listResearchNotes,
  type ResearchNoteListItem,
} from "@/db/queries/research";
import { Brain } from "lucide-react";
import { safeRead } from "@/lib/db-status";
import { formatDate, formatRelative } from "@/lib/utils";
import { computeHealth } from "@/lib/health";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ module?: string }>;

const STATUS_VARIANT: Record<
  "active" | "waiting" | "done" | "lost",
  "blue" | "amber" | "green" | "neutral"
> = {
  active: "blue",
  waiting: "amber",
  done: "green",
  lost: "neutral",
};

export default async function ProjectDetailPage(props: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;

  // Load the project at this URL first
  const parentRes = await safeRead(
    () => getProject({ id, workspaceId: user.workspaceId }),
    null,
  );
  if (parentRes.ok && !parentRes.data) notFound();
  const parent = parentRes.data;
  if (!parent) {
    return (
      <main className="p-6">
        <DbBanner error={(parentRes as { error?: string }).error ?? ""} />
      </main>
    );
  }

  // If this URL itself is a child project, redirect to its parent with ?module=
  if (parent.parentProjectId) {
    redirect(`/projects/${parent.parentProjectId}?module=${parent.id}`);
  }

  const modulesRes = await safeRead<ProjectListItem[]>(
    () =>
      listProjects({
        workspaceId: user.workspaceId,
        parentId: parent.id,
      }),
    [],
  );
  const modules = modulesRes.data;
  const moduleTabs: ModuleTab[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    coverEmoji: m.coverEmoji ?? null,
    coverColor: m.coverColor ?? null,
  }));

  const selectedModuleId = sp.module ?? null;
  const isModuleView =
    selectedModuleId !== null &&
    moduleTabs.some((m) => m.id === selectedModuleId);

  const displayedRes = isModuleView
    ? await safeRead(
        () =>
          getProject({
            id: selectedModuleId!,
            workspaceId: user.workspaceId,
          }),
        null,
      )
    : parentRes;

  const displayed = displayedRes.data;
  if (!displayed) {
    return (
      <main className="p-6">
        <DbBanner error="Module not found" />
      </main>
    );
  }

  const [touchesRes, linksRes, researchRes, shareContactsRes] = await Promise.all([
    safeRead(
      () =>
        listTouchesForProject({
          projectId: displayed.id,
          workspaceId: user.workspaceId,
        }),
      [],
    ),
    safeRead<ProjectLinkWithAuthor[]>(
      () =>
        listProjectLinks({
          projectId: displayed.id,
          workspaceId: user.workspaceId,
        }),
      [],
    ),
    safeRead<ResearchNoteListItem[]>(
      () =>
        listResearchNotes({
          workspaceId: user.workspaceId,
          projectId: displayed.id,
          kind: "research",
        limit: 8,
      }),
      [],
    ),
    safeRead(() => listContacts({ workspaceId: user.workspaceId }), []),
  ]);

  // Flag links whose target is actually reachable so the board can grey out
  // files whose storage object was lost and notes/links with nothing behind them.
  const attachedPaths = await safeRead(
    () => listAttachedPaths(user.workspaceId, displayed.id),
    null,
  );
  const linksView: ProjectLinkView[] = linksRes.data.map((l) => ({
    ...l,
    attached:
      l.kind === "file"
        ? // Unknown (storage unconfigured) → assume attached rather than greying all.
          attachedPaths.data == null
          ? true
          : Boolean(l.storagePath) && attachedPaths.data.has(l.storagePath!)
        : l.kind === "link"
          ? Boolean(l.url)
          : l.kind === "doc"
            ? true
            : false,
  }));

  // Record the visit for Home's "Recently opened" (best-effort, non-blocking).
  void recordProjectVisit(user.workspaceId, user.id, displayed.id).catch(() => {});

  const accent = displayed.coverColor ?? "var(--text-tertiary)";
  const health = computeHealth({
    status: displayed.status,
    expectedUnblockDate: displayed.expectedUnblockDate,
    milestones: displayed.milestones.map((m) => ({
      status: m.status,
      dueDate: m.dueDate,
    })),
  });
  const currentStage = displayed.stages.find(
    (s) => s.id === displayed.currentStageId,
  );
  const total = displayed.milestones.length;
  const done = displayed.milestones.filter((m) => m.status === "done").length;
  const open = total - done;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  const hasModules = moduleTabs.length > 0;

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <div className="flex items-center gap-2">
            {displayed.primaryUrl && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={displayed.primaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${displayed.id}/edit`}>
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
              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl overflow-hidden text-[36px]"
              style={{
                background: `color-mix(in oklab, ${accent} 22%, var(--bg-card))`,
                border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
              }}
            >
              {displayed.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayed.logoUrl}
                    alt={`${displayed.title} logo`}
                    width={48}
                    height={48}
                    className={
                      displayed.logoUrlDark
                        ? "object-contain dark:hidden"
                        : "object-contain"
                    }
                  />
                  {displayed.logoUrlDark && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={displayed.logoUrlDark}
                      alt=""
                      aria-hidden
                      width={48}
                      height={48}
                      className="object-contain hidden dark:block"
                    />
                  )}
                </>
              ) : (
                <>{displayed.coverEmoji ?? "📁"}</>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {isModuleView && (
                  <Link
                    href={`/projects/${parent.id}`}
                    className="text-tiny text-text-tertiary font-mono hover:text-text-secondary"
                  >
                    {parent.title} /
                  </Link>
                )}
                <h1 className="text-[24px] font-medium tracking-tight text-text-primary truncate">
                  {displayed.title}
                </h1>
                <DashBadge variant={STATUS_VARIANT[displayed.status]}>
                  {displayed.status}
                </DashBadge>
                <HealthBadge health={health} short />
              </div>
              {displayed.tagline && (
                <p className="text-[13px] text-text-secondary mt-1">
                  {displayed.tagline}
                </p>
              )}
              {displayed.statusText && (
                <p className="text-tiny text-text-tertiary font-mono mt-1.5">
                  {displayed.statusText}
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 flex-wrap text-tiny text-text-tertiary">
                {displayed.templateName && (
                  <span>{displayed.templateName}</span>
                )}
                {currentStage && <span>stage: {currentStage.name}</span>}
                {displayed.dueDate && (
                  <span>due {formatDate(displayed.dueDate)}</span>
                )}
                {displayed.primaryUrl && (
                  <a
                    href={displayed.primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <ExternalLink size={10} />{" "}
                    {displayed.primaryUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            {displayed.summary && (
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {displayed.summary}
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
                <span>{displayed.contacts.length} contacts</span>
              </div>
            </div>
          </div>

          {displayed.status === "waiting" && displayed.waitingOn && (
            <div
              className="px-6 py-3 border-t text-tiny"
              style={{
                background:
                  "color-mix(in oklab, var(--amber-mid) 8%, transparent)",
                borderColor: "var(--border-default)",
                color: "var(--amber-text)",
              }}
            >
              ⏸ Waiting on: <strong>{displayed.waitingOn}</strong>
              {displayed.expectedUnblockDate && (
                <>
                  {" "}
                  · expected {formatDate(displayed.expectedUnblockDate)}
                </>
              )}
            </div>
          )}
        </div>

        {hasModules && (
          <ModuleSwitcher parentId={parent.id} modules={moduleTabs} />
        )}

        {hasModules && !isModuleView && (
          <DashCard>
            <SectionLabel>Modules ({moduleTabs.length})</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((m) => {
                const c = m.coverColor ?? "var(--border-default)";
                return (
                  <Link
                    key={m.id}
                    href={`/projects/${parent.id}?module=${m.id}`}
                    className="rounded-md border bg-card p-3 hover:bg-surface transition-colors border-l-[3px]"
                    style={{
                      borderColor: "var(--border-default)",
                      borderLeftColor: c,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[20px] shrink-0">
                        {m.coverEmoji ?? "📁"}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-text-primary truncate">
                          {m.title}
                        </div>
                        {m.tagline && (
                          <p className="text-tiny text-text-tertiary line-clamp-2 mt-0.5">
                            {m.tagline}
                          </p>
                        )}
                        <div className="text-tiny text-text-tertiary mt-1 tabular-nums">
                          {m.milestoneOpenCount} open
                          {m.milestoneOverdueCount > 0 && (
                            <span className="text-red-text">
                              {" · "}
                              {m.milestoneOverdueCount} overdue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </DashCard>
        )}

        <LinksBoard
          projectId={displayed.id}
          links={linksView}
          currentUserId={user.id}
          currentUserRole={user.workspaceRole}
          shareContacts={shareContactsRes.data.map((contact) => ({
            id: contact.id,
            name: contact.name,
            organization: contact.organization,
            relationshipType: contact.relationshipType,
          }))}
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <MilestoneList
                  projectId={displayed.id}
                  milestones={displayed.milestones.map((m) => ({
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
              <SectionLabel
                icon={Brain}
                right={
                  researchRes.data.length > 0 ? (
                    <Link
                      href={`/research?project=${displayed.id}`}
                      className="text-tiny text-text-secondary hover:text-text-primary"
                    >
                      All
                    </Link>
                  ) : null
                }
              >
                Research brain
              </SectionLabel>
              {researchRes.data.length === 0 ? (
                <p className="text-tiny text-text-tertiary py-2">
                  No notes mapped to this project yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {researchRes.data.map((n) => (
                    <li key={n.id} className="text-[12px]">
                      <Link
                        href={`/research/${n.id}`}
                        className="block text-text-primary hover:underline line-clamp-2"
                      >
                        {n.title}
                      </Link>
                      <div className="text-tiny text-text-tertiary truncate">
                        {n.folder ? `${n.folder} · ` : ""}
                        {n.wordCount} words
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>

            <DashCard>
              <SectionLabel icon={Target}>Linked contacts</SectionLabel>
              {displayed.contacts.length === 0 ? (
                <p className="text-tiny text-text-tertiary py-2">
                  None linked.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {displayed.contacts.map((c) => (
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
                <Row label="Notes path" value={displayed.notesPath ?? "—"} />
                <Row
                  label="Created"
                  value={formatRelative(displayed.createdAt)}
                />
                <Row
                  label="Updated"
                  value={formatRelative(displayed.updatedAt)}
                />
                <Separator className="my-2" />
                <Row label="Status" value={displayed.status} />
                <Row label="Health" value={health} />
                {displayed.repoUrl && (
                  <Row
                    label="Repo"
                    value={
                      <a
                        href={displayed.repoUrl}
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
