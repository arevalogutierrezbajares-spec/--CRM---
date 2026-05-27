import Link from "next/link";
import { Brain, FolderOpen, Tag } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { DashBadge } from "@/components/dashboard/shared/badge";
import {
  FilterBar,
  type FilterDimension,
} from "@/components/work/filter-bar";
import { SearchBox } from "@/components/research/search-box";
import { safeRead } from "@/lib/db-status";
import {
  listResearchNotes,
  researchCounts,
  type ResearchCounts,
  type ResearchNoteListItem,
} from "@/db/queries/research";
import { listProjects } from "@/db/queries/projects";

type SearchParams = Promise<{
  q?: string;
  project?: string;
  source?: string;
  folder?: string;
}>;

const EMPTY_COUNTS: ResearchCounts = {
  total: 0,
  byFolder: [],
  bySource: [],
  byProject: [],
  newest: null,
};

function shortDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export default async function ResearchPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const [notesRes, countsRes, projectsRes] = await Promise.all([
    safeRead<ResearchNoteListItem[]>(
      () =>
        listResearchNotes({
          workspaceId: user.workspaceId,
          query: sp.q,
          projectId: sp.project,
          sourceRoot: sp.source,
          folder: sp.folder,
          limit: 200,
        }),
      [],
    ),
    safeRead<ResearchCounts>(
      () => researchCounts(user.workspaceId),
      EMPTY_COUNTS,
    ),
    safeRead(() => listProjects({ workspaceId: user.workspaceId }), []),
  ]);

  const counts = countsRes.data;

  const dimensions: FilterDimension[] = [
    {
      key: "source",
      label: "Brain",
      options: counts.bySource.map((s) => ({
        value: s.sourceRoot,
        label: s.sourceRoot,
        count: s.count,
      })),
    },
    {
      key: "project",
      label: "Project",
      options: projectsRes.data
        .map((p) => {
          const c = counts.byProject.find((x) => x.projectId === p.id);
          return {
            value: p.id,
            label: p.title,
            color: p.coverColor,
            count: c?.count ?? 0,
          };
        })
        .filter((o) => (o.count ?? 0) > 0)
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      key: "folder",
      label: "Folder",
      options: counts.byFolder.slice(0, 14).map((f) => ({
        value: f.folder,
        label: `${f.folder} (${f.sourceRoot})`,
        count: f.count,
      })),
    },
  ];

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Research</h1>
            <p className="text-[13px] text-text-secondary">
              {counts.total} notes indexed from {counts.bySource.length} Obsidian brains · last edit {shortDate(counts.newest)}
            </p>
          </div>
          <SearchBox />
        </header>

        {!notesRes.ok && <DbBanner error={notesRes.error} />}

        {/* Filters */}
        {dimensions.some((d) => d.options.length > 0) && (
          <DashCard>
            <SectionLabel icon={Brain}>Filter</SectionLabel>
            <FilterBar dimensions={dimensions} />
          </DashCard>
        )}

        {/* Notes list */}
        <DashCard>
          <SectionLabel
            icon={FolderOpen}
            right={
              <span className="text-tiny text-text-tertiary tabular-nums">
                {notesRes.data.length}
              </span>
            }
          >
            Notes
          </SectionLabel>
          {notesRes.data.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-text-secondary">
              No notes match these filters. Try clearing them or run the sync
              script: <code className="font-mono">node scripts/sync-research-brains.mjs</code>
            </p>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: "var(--border-default)" }}
            >
              {notesRes.data.map((n) => (
                <li key={n.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/research/${n.id}`}
                        className="text-[13.5px] font-medium text-text-primary hover:underline"
                      >
                        {n.title}
                      </Link>
                      {n.summary && (
                        <p className="text-[12px] text-text-secondary mt-0.5 line-clamp-2">
                          {n.summary}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-tiny text-text-tertiary">
                        <span className="font-mono">{n.sourceRoot}</span>
                        <span>·</span>
                        <span className="font-mono truncate max-w-[280px]">
                          {n.relPath}
                        </span>
                        <span>·</span>
                        <span>{shortDate(n.lastModified)}</span>
                        <span>·</span>
                        <span>{n.wordCount} words</span>
                      </div>
                      {n.tags.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {n.tags.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-tiny text-text-secondary"
                            >
                              <Tag size={8} />
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {n.projectTitle && (
                      <Link
                        href={`/research?project=${n.projectId}`}
                        className="shrink-0"
                      >
                        <DashBadge
                          variant="neutral"
                          className="inline-flex items-center gap-1"
                        >
                          {n.projectColor && (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: n.projectColor }}
                            />
                          )}
                          {n.projectTitle}
                        </DashBadge>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </main>
    </>
  );
}
