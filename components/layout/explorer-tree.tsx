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
import { listProjectDocsAction, type TreeDoc } from "@/app/(app)/nav/actions";

type Proj = { id: string; title: string };

const DOC_ICON = {
  doc: FileText,
  link: ExternalLink,
  file: File,
  note: StickyNote,
} as const;

/**
 * Sidebar file explorer: Projects → each project → its docs/links. Children are
 * lazy-loaded on first expand and revalidated on every re-expand (so a doc added
 * elsewhere shows without a reload). Presented as a nested disclosure list —
 * every interactive row is a native <button>/<Link> (Tab + Enter), with
 * aria-expanded on the toggles; we don't claim full ARIA `tree` keyboard
 * semantics we don't implement.
 */
export function ExplorerTree({ projects }: { projects: Proj[] }) {
  const pathname = usePathname();
  const [rootOpen, setRootOpen] = useState(true);
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Record<string, TreeDoc[] | "loading">>({});
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const shownProjects = useMemo(
    () => (q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : projects),
    [projects, q],
  );

  function toggleProject(id: string) {
    const willOpen = !openProjects.has(id);
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!willOpen) return;
    // Side effects OUTSIDE the state updater (updaters must stay pure; this also
    // avoids a StrictMode double-fetch). Show "loading" only on first open;
    // otherwise keep the cached list visible while revalidating.
    setDocs((d) => (d[id] === undefined ? { ...d, [id]: "loading" } : d));
    listProjectDocsAction(id)
      .then((rows) => setDocs((d) => ({ ...d, [id]: rows })))
      .catch(() =>
        // Don't cache the failure as an empty list (which would never retry) —
        // drop the key so the next expand refetches.
        setDocs((d) => {
          const n = { ...d };
          delete n[id];
          return n;
        }),
      );
  }

  return (
    <div className="mt-0.5">
      {projects.length > 6 && (
        <div className="mb-1 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1">
          <Search size={11} className="shrink-0 text-text-tertiary" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects…"
            aria-label="Filter projects"
            className="w-full bg-transparent text-tiny text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      )}

      {/* root: Projects — chevron toggles, label links to the list view */}
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
          href="/projects"
          aria-current={pathname === "/projects" ? "page" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 ${
            pathname === "/projects" ? "bg-surface text-text-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"
          }`}
        >
          {rootOpen ? <FolderOpen size={13} className="shrink-0 text-text-tertiary" /> : <Folder size={13} className="shrink-0 text-text-tertiary" />}
          <span>Projects</span>
          <span className="ml-auto text-tiny tabular-nums text-text-tertiary">{projects.length}</span>
        </Link>
      </div>

      {rootOpen && (
        <ul className="list-none">
          {shownProjects.length === 0 ? (
            <li className="px-2 py-1 pl-7 text-tiny text-text-tertiary">{q ? "No matches" : "No projects yet"}</li>
          ) : (
            shownProjects.map((p) => {
              const isOpen = openProjects.has(p.id);
              const kids = docs[p.id];
              const projActive = pathname.startsWith(`/projects/${p.id}`);
              return (
                <li key={p.id}>
                  <div className="flex items-center gap-0.5 pl-3">
                    <button
                      type="button"
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${p.title}`}
                      aria-expanded={isOpen}
                      onClick={() => toggleProject(p.id)}
                      className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-surface"
                    >
                      <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <Link
                      href={`/projects/${p.id}`}
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
                      {kids === "loading" || kids === undefined ? (
                        <li className="py-1 pl-9 text-tiny text-text-tertiary" aria-live="polite">Loading…</li>
                      ) : kids.length === 0 ? (
                        <li>
                          <Link href={`/projects/${p.id}`} className="block py-1 pl-9 text-tiny text-text-tertiary hover:underline">No docs — add some →</Link>
                        </li>
                      ) : (
                        kids.map((d) => {
                          const Icon = d.external ? ExternalLink : d.kind === "link" ? LinkIcon : DOC_ICON[d.kind];
                          const active = pathname === d.href;
                          const common = "flex items-center gap-1.5 rounded-md py-1 pl-9 pr-1 text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary";
                          return (
                            <li key={d.id}>
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
                        })
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
