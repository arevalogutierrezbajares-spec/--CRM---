import Link from "next/link";
import { Brain, FileCode, FolderOpen, Tag } from "lucide-react";
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
  kind?: string;
}>;

const EMPTY_COUNTS: ResearchCounts = {
  total: 0,
  byKind: { research: 0, product: 0, note: 0 },
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

const KIND_META: Record<
  "research" | "product" | "note",
  { label: string; color: string }
> = {
  research: { label: "Research", color: "var(--purple-text)" },
  product: { label: "Product", color: "var(--blue-text)" },
  note: { label: "Misc", color: "var(--text-tertiary)" },
};

export default async function ResearchPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const kindParam =
    sp.kind === "product" || sp.kind === "note" || sp.kind === "all"
      ? sp.kind
      : "research";

  const kindFilter =
    kindParam === "all"
      ? undefined
      : (kindParam as "research" | "product" | "note");

  const [notesRes, countsRes, projectsRes] = await Promise.all([
    safeRead<ResearchNoteListItem[]>(
      () =>
        listResearchNotes({
          workspaceId: user.workspaceId,
          query: sp.q,
          projectId: sp.project,
          sourceRoot: sp.source,
          folder: sp.folder,
          kind: kindFilter,
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

  function pillHref(k: "research" | "product" | "note" | "all"): string {
    const next = new URLSearchParams();
    if (sp.q) next.set("q", sp.q);
    if (sp.project) next.set("project", sp.project);
    if (sp.source) next.set("source", sp.source);
    if (sp.folder) next.set("folder", sp.folder);
    if (k !== "research") next.set("kind", k);
    const q = next.toString();
    return q ? `/research?${q}` : "/research";
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Research</h1>
            <p className="text-[13px] text-text-secondary">
              {counts.byKind.research} knowledge notes for inspiration + backing (whitepapers, brainstorming, data sources, frameworks, vendor entities). Toggle to Product for the {counts.byKind.product} specs/PRDs/handoffs/sprint logs.
            </p>
            <p className="text-tiny text-text-tertiary mt-1">
              {counts.total} total across {counts.bySource.length} brains · last edit {shortDate(counts.newest)}
            </p>
          </div>
          <SearchBox />
        </header>

        {!notesRes.ok && <DbBanner error={notesRes.error} />}

        {/* Kind toggle */}
        <div
          className="flex items-center gap-2 border-b pb-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          {(["research", "product", "note", "all"] as const).map((k) => {
            const active = kindParam === k;
            const count =
              k === "all"
                ? counts.total
                : counts.byKind[k as "research" | "product" | "note"];
            const meta =
              k === "all"
                ? { label: "All", color: "var(--text-secondary)" }
                : KIND_META[k as "research" | "product" | "note"];
            return (
              <Link
                key={k}
                href={pillHref(k)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] transition-colors"
                style={
                  active
                    ? {
                        background: "var(--text-primary)",
                        color: "var(--bg-card)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                {k !== "all" && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.color }}
                  />
                )}
                <span className={active ? "font-medium" : ""}>{meta.label}</span>
                <span className="opacity-70 tabular-nums">{count}</span>
              </Link>
            );
          })}
        </div>

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
            icon={kindFilter === "product" ? FileCode : FolderOpen}
            right={
              <span className="text-tiny text-text-tertiary tabular-nums">
                {notesRes.data.length}
              </span>
            }
          >
            {kindFilter === "product"
              ? "Product specs"
              : kindFilter === "note"
                ? "Misc notes"
                : kindFilter === undefined
                  ? "All notes"
                  : "Knowledge notes"}
          </SectionLabel>
          {notesRes.data.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-text-secondary">
              No notes match these filters. Try clearing them or run the sync
              via POST /api/research/sync.
            </p>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: "var(--border-default)" }}
            >
              {notesRes.data.map((n) => {
                const k = n.kind as "research" | "product" | "note";
                const meta = KIND_META[k];
                return (
                  <li key={n.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/research/${n.id}`}
                            className="text-[13.5px] font-medium text-text-primary hover:underline"
                          >
                            {n.title}
                          </Link>
                          <span
                            className="inline-flex items-center gap-0.5 text-tiny"
                            style={{ color: meta.color }}
                            title={meta.label}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: meta.color }}
                            />
                            {meta.label}
                          </span>
                        </div>
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
                );
              })}
            </ul>
          )}
        </DashCard>
      </main>
    </>
  );
}
