"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  File,
  StickyNote,
  ExternalLink,
  Link as LinkIcon,
  Search,
} from "lucide-react";
import type { WorkspaceDoc } from "@/db/queries/items";

type Proj = { id: string; title: string };

const DOC_ICON: Record<string, typeof FileText> = {
  doc: FileText,
  link: ExternalLink,
  file: File,
  note: StickyNote,
};

const CATEGORY_ORDER = ["business", "marketing", "tech", "ops", "design", "finance", "other"];
const CATEGORY_LABEL: Record<string, string> = {
  business: "Business",
  marketing: "Marketing",
  tech: "Tech",
  ops: "Ops",
  design: "Design",
  finance: "Finance",
  other: "Other",
};

function docMatches(d: WorkspaceDoc, q: string): boolean {
  return !q || d.label.toLowerCase().includes(q) || (CATEGORY_LABEL[d.category] ?? d.category).toLowerCase().includes(q);
}

/** Group docs into ordered category sections, dropping empty ones. */
function bySection(docs: WorkspaceDoc[]): { category: string; docs: WorkspaceDoc[] }[] {
  const map = new Map<string, WorkspaceDoc[]>();
  for (const d of docs) {
    const c = d.category || "other";
    (map.get(c) ?? map.set(c, []).get(c)!).push(d);
  }
  const ordered = [...CATEGORY_ORDER, ...[...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  return ordered.filter((c) => map.has(c)).map((c) => ({ category: c, docs: map.get(c)! }));
}

/**
 * Sidebar file explorer: Projects → each project → its docs grouped into
 * category sections (Business / Tech / Ops / …). One filter box matches project
 * names AND doc names/sections and auto-expands the hits. All docs are passed in
 * up front (workspace-capped) so filtering is instant.
 */
export function ExplorerTree({ projects, docs }: { projects: Proj[]; docs: WorkspaceDoc[] }) {
  const pathname = usePathname();
  const [rootOpen, setRootOpen] = useState(true);
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();

  const docsByProject = useMemo(() => {
    const m = new Map<string, WorkspaceDoc[]>();
    for (const d of docs) (m.get(d.projectId) ?? m.set(d.projectId, []).get(d.projectId)!).push(d);
    return m;
  }, [docs]);

  // Projects to show + the docs to show under each (respecting the filter).
  const shown = useMemo(() => {
    return projects
      .map((p) => {
        const all = docsByProject.get(p.id) ?? [];
        const titleMatch = !q || p.title.toLowerCase().includes(q);
        const matchingDocs = q ? all.filter((d) => docMatches(d, q)) : all;
        const visible = titleMatch || matchingDocs.length > 0;
        return { p, docs: titleMatch ? all : matchingDocs, visible };
      })
      .filter((x) => x.visible);
  }, [projects, docsByProject, q]);

  function toggleProject(id: string) {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-0.5">
      {(projects.length > 6 || docs.length > 12) && (
        <div className="mb-1 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1">
          <Search size={11} className="shrink-0 text-text-tertiary" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects & docs…"
            aria-label="Filter projects and documents"
            className="w-full bg-transparent text-tiny text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      )}

      {/* root: Projects */}
      <div className="flex items-center gap-0.5 rounded-md px-0.5 text-[12px] font-medium">
        <button
          type="button"
          aria-label={rootOpen ? "Collapse Projects" : "Expand Projects"}
          aria-expanded={rootOpen}
          onClick={() => setRootOpen((o) => !o)}
          className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-surface"
        >
          <ChevronRight size={13} className={`transition-transform ${rootOpen ? "rotate-90" : ""}`} />
        </button>
        <Link
          href="/lob"
          aria-current={pathname === "/lob" ? "page" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 ${
            pathname === "/lob" ? "bg-surface text-text-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"
          }`}
        >
          {rootOpen ? <FolderOpen size={13} className="shrink-0 text-text-tertiary" /> : <Folder size={13} className="shrink-0 text-text-tertiary" />}
          <span>Business</span>
          <span className="ml-auto text-tiny tabular-nums text-text-tertiary">{projects.length}</span>
        </Link>
      </div>

      {rootOpen && (
        <ul className="list-none">
          {shown.length === 0 ? (
            <li className="px-2 py-1 pl-7 text-tiny text-text-tertiary">{q ? "No matches" : "No projects yet"}</li>
          ) : (
            shown.map(({ p, docs: pDocs }) => {
              const isOpen = q ? true : openProjects.has(p.id); // filtering auto-expands hits
              const projActive = pathname.startsWith(`/lob/${p.id}`);
              const sections = bySection(pDocs);
              return (
                <li key={p.id}>
                  <div className="flex items-center gap-0.5 pl-3">
                    <button
                      type="button"
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${p.title}`}
                      aria-expanded={isOpen}
                      onClick={() => toggleProject(p.id)}
                      disabled={!!q}
                      className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-surface disabled:opacity-40"
                    >
                      <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <Link
                      href={`/lob/${p.id}`}
                      aria-current={projActive ? "page" : undefined}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-[12.5px] ${
                        projActive ? "bg-surface font-medium text-text-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"
                      }`}
                    >
                      <Folder size={12} className="shrink-0 text-text-tertiary" />
                      <span className="truncate">{p.title}</span>
                    </Link>
                  </div>

                  {isOpen && (
                    <ul className="list-none">
                      {sections.length === 0 ? (
                        <li>
                          <Link href={`/lob/${p.id}`} className="block py-1 pl-9 text-tiny text-text-tertiary hover:underline">No docs — add some →</Link>
                        </li>
                      ) : (
                        sections.map((sec) => (
                          <li key={sec.category}>
                            <div className="py-0.5 pl-7 text-tiny font-medium uppercase tracking-wide text-text-tertiary">
                              {CATEGORY_LABEL[sec.category] ?? sec.category}
                            </div>
                            <ul className="list-none">
                              {sec.docs.map((d) => {
                                const Icon = d.external ? ExternalLink : d.kind === "link" ? LinkIcon : DOC_ICON[d.kind] ?? FileText;
                                const active = pathname === d.href;
                                const common = "flex items-center gap-1.5 rounded-md py-1 pl-9 pr-1 text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary";
                                return (
                                  <li key={d.refId}>
                                    {d.external ? (
                                      <a href={d.href} target="_blank" rel="noopener noreferrer" className={common}>
                                        <Icon size={11} className="shrink-0 text-text-tertiary" />
                                        <span className="truncate">{d.label}</span>
                                      </a>
                                    ) : (
                                      <Link
                                        href={d.href}
                                        aria-current={active ? "page" : undefined}
                                        className={active ? `${common} bg-surface font-medium text-text-primary` : common}
                                      >
                                        <Icon size={11} className="shrink-0 text-text-tertiary" />
                                        <span className="truncate">{d.label}</span>
                                      </Link>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
