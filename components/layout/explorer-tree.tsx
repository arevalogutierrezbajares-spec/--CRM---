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
 * VS Code-style file explorer for the sidebar: Projects → each project → its
 * docs/links. Children are lazy-loaded on first expand. Rows are native focusable
 * links/buttons (Tab + Enter), with role="tree" semantics; →/← on a focused
 * folder expand/collapse it.
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
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);
      // Lazy-load docs the first time it opens.
      if (!docs[id]) {
        setDocs((d) => ({ ...d, [id]: "loading" }));
        listProjectDocsAction(id)
          .then((rows) => setDocs((d) => ({ ...d, [id]: rows })))
          .catch(() => setDocs((d) => ({ ...d, [id]: [] })));
      }
      return next;
    });
  }

  function folderKey(e: React.KeyboardEvent, isOpen: boolean, open: () => void, close: () => void) {
    if (e.key === "ArrowRight" && !isOpen) {
      e.preventDefault();
      open();
    } else if (e.key === "ArrowLeft" && isOpen) {
      e.preventDefault();
      close();
    }
  }

  return (
    <div role="tree" aria-label="Projects explorer" className="mt-0.5">
      {/* filter */}
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
      <div
        role="treeitem"
        aria-expanded={rootOpen}
        aria-selected={false}
        className="flex items-center gap-0.5 rounded-md px-0.5 text-[12px] font-medium"
      >
        <button
          type="button"
          aria-label={rootOpen ? "Collapse Projects" : "Expand Projects"}
          onClick={() => setRootOpen((o) => !o)}
          onKeyDown={(e) => folderKey(e, rootOpen, () => setRootOpen(true), () => setRootOpen(false))}
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
        <div role="group">
          {shownProjects.length === 0 ? (
            <p className="px-2 py-1 pl-7 text-tiny text-text-tertiary">
              {q ? "No matches" : "No projects yet"}
            </p>
          ) : (
            shownProjects.map((p) => {
              const isOpen = openProjects.has(p.id);
              const kids = docs[p.id];
              const projActive = pathname.startsWith(`/projects/${p.id}`);
              return (
                <div key={p.id} role="treeitem" aria-expanded={isOpen} aria-selected={projActive}>
                  <div className="flex items-center gap-0.5 pl-3">
                    <button
                      type="button"
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${p.title}`}
                      onClick={() => toggleProject(p.id)}
                      onKeyDown={(e) =>
                        folderKey(e, isOpen, () => !isOpen && toggleProject(p.id), () => isOpen && toggleProject(p.id))
                      }
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
                    <div role="group">
                      {kids === "loading" || kids === undefined ? (
                        <p className="py-1 pl-9 text-tiny text-text-tertiary" aria-live="polite">Loading…</p>
                      ) : kids.length === 0 ? (
                        <Link href={`/projects/${p.id}`} className="block py-1 pl-9 text-tiny text-text-tertiary hover:underline">
                          No docs — add some →
                        </Link>
                      ) : (
                        kids.map((d) => {
                          const Icon = DOC_ICON[d.kind];
                          const active = pathname === d.href;
                          const common = "flex items-center gap-1.5 rounded-md py-1 pl-9 pr-1 text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary";
                          return d.external ? (
                            <a key={d.id} href={d.href} target="_blank" rel="noopener noreferrer" role="treeitem" aria-selected={false} className={common}>
                              <Icon size={11} className="shrink-0 text-text-tertiary" />
                              <span className="truncate">{d.label}</span>
                            </a>
                          ) : (
                            <Link
                              key={d.id}
                              href={d.href}
                              role="treeitem"
                              aria-selected={active}
                              aria-current={active ? "page" : undefined}
                              className={active ? `${common} bg-surface font-medium text-text-primary` : common}
                            >
                              <Icon size={11} className="shrink-0 text-text-tertiary" />
                              <span className="truncate">{d.label}</span>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
