"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useCallback,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Mic,
  Plus,
  Archive,
  Tag as TagIcon,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnHeader } from "@/components/grid/column-header";
import { FilterBar } from "@/components/grid/filter-bar";
import { SavedViews } from "@/components/grid/saved-views";
import { ExportButton } from "@/components/grid/export-button";
import { VenturePillBar } from "@/components/tags/venture-pill-bar";
import { ContactsSearch } from "@/components/contacts/contacts-search";
import { TypeSegmented } from "@/components/contacts/type-segmented";
import { ReachIcons } from "@/components/contacts/reach-icons";
import { TagPills } from "@/components/contacts/tag-pills";
import { LastTouchCell } from "@/components/contacts/last-touch-cell";
import { ContactAvatar } from "@/components/contacts/avatar";
import { ActiveFilters } from "@/components/contacts/active-filters";
import {
  bulkArchiveContacts,
  bulkAddTagToContacts,
} from "@/app/(app)/contacts/actions";
import type { ContactListItem, ContactProjectOption } from "@/db/queries/contacts";
import {
  parseSort,
  parseFilter,
  applySort,
  applyFilters,
  groupBy,
  buildHref,
  type Filters,
} from "@/lib/grid-state";
import { cn } from "@/lib/utils";

type Tag = {
  id: string;
  name: string;
  kind: "venture" | "custom";
  color?: string | null;
};

type Props = {
  initialContacts: ContactListItem[];
  ventureTags: Tag[];
  allTags: Tag[];
  projectOptions: ContactProjectOption[];
  archived: boolean;
};

// ─── virtual list item types ────────────────────────────────────────────────
type VRow =
  | { kind: "group-header"; label: string; count: number }
  | { kind: "contact"; contact: ContactListItem; rowIdx: number };

const ROW_H = 52;       // contact row height estimate
const GROUP_H = 28;     // group header height estimate
const TABLE_MAX_H = 640; // px — viewport-like scroll container

const FILTER_OPTIONS = [
  {
    col: "relationship",
    label: "Relationship",
    values: [
      { value: "friend", label: "Friend" },
      { value: "lead", label: "Lead" },
      { value: "partner", label: "Partner" },
      { value: "prospect", label: "Prospect" },
    ],
  },
];

const GROUP_OPTIONS = [
  { value: "relationship", label: "Relationship" },
  { value: "type", label: "Type" },
  { value: "org", label: "Organization" },
  { value: "project", label: "Project" },
];

const TYPE_CYCLE: Array<"all" | "person" | "org"> = ["all", "person", "org"];

export function ContactsGrid({
  initialContacts,
  ventureTags,
  allTags,
  projectOptions,
  archived,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const tag = sp.get("tag");
  const projectId = sp.get("project");
  const filters = parseFilter(sp.get("filter"));
  const sort = parseSort(sp.get("sort"));
  const group = sp.get("group") ?? undefined;

  // ── filtered + sorted list ─────────────────────────────────────────────
  const sorted = useMemo(() => {
    let rows = initialContacts;
    if (tag) rows = rows.filter((c) => c.tags.some((t) => t.name === tag));
    if (q) {
      rows = rows.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if ((c.organization ?? "").toLowerCase().includes(q)) return true;
        for (const ch of c.channels) if (ch.value.toLowerCase().includes(q)) return true;
        for (const t of c.tags) if (t.name.toLowerCase().includes(q)) return true;
        for (const p of c.projects) if (p.title.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    rows = applyFilters<ContactListItem>(rows, filters, {
      relationship: (r, v) => r.relationshipType === v,
      type: (r, v) => r.type === v,
      org: (r, v) =>
        (r.organization ?? "").toLowerCase().includes(v.toLowerCase()),
      project: (r, v) => r.projects.some((p) => p.id === v),
    });
    return applySort<ContactListItem>(rows, sort, {
      name: (r) => r.name.toLowerCase(),
      relationship: (r) => r.relationshipType,
      organization: (r) => (r.organization ?? "").toLowerCase(),
      lastTouch: (r) => (r.lastTouchAt ? new Date(r.lastTouchAt) : null),
      updated: (r) => new Date(r.updatedAt),
    });
  }, [initialContacts, q, tag, filters, sort]);

  const grouped = useMemo(
    () =>
      groupBy<ContactListItem>(sorted, group, (r) => {
        if (group === "relationship") return r.relationshipType;
        if (group === "type") return r.type;
        if (group === "org") return r.organization ?? "—";
        if (group === "project") return r.projects[0]?.title ?? "No project";
        return "";
      }),
    [sorted, group],
  );

  // Flat virtual list that interleaves group headers with contact rows.
  const vRows = useMemo<VRow[]>(() => {
    const out: VRow[] = [];
    let rowIdx = 0;
    for (const [key, items] of grouped.entries()) {
      if (group) out.push({ kind: "group-header", label: key || "—", count: items.length });
      for (const c of items) {
        out.push({ kind: "contact", contact: c, rowIdx: rowIdx++ });
      }
    }
    return out;
  }, [grouped, group]);

  const contactRows = useMemo(
    () => vRows.filter((r): r is Extract<VRow, { kind: "contact" }> => r.kind === "contact"),
    [vRows],
  );

  const queryString = useMemo(() => {
    const out = new URLSearchParams();
    for (const [k, v] of sp.entries()) out.set(k, v);
    return out;
  }, [sp]);

  // ── selection ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visibleIds = useMemo(
    () => new Set(contactRows.map((r) => r.contact.id)),
    [contactRows],
  );
  // Drop selections that scrolled out of the filtered set.
  const selectionCount = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)).length,
    [selected, visibleIds],
  );
  const allVisibleSelected =
    visibleIds.size > 0 && [...visibleIds].every((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allVisibleSelected) {
      setSelected((s) => {
        const next = new Set(s);
        for (const id of visibleIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((s) => new Set([...s, ...visibleIds]));
    }
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // ── virtual scroll ─────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: vRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (vRows[i].kind === "group-header" ? GROUP_H : ROW_H),
    overscan: 12,
  });

  // ── keyboard nav ──────────────────────────────────────────────────────
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const lastG = useRef(0);

  useEffect(() => {
    if (focusedIdx >= contactRows.length) setFocusedIdx(-1);
  }, [contactRows.length, focusedIdx]);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        router.push("/contacts/new");
      } else if (e.key === "t") {
        e.preventDefault();
        const cur = (filters.type as "person" | "org" | undefined) ?? "all";
        const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length];
        const nf: Filters = { ...filters };
        if (next === "all") delete nf.type;
        else nf.type = next;
        startTransition(() => {
          router.push(buildHref(pathname, new URLSearchParams(sp.toString()), { filters: nf }));
        });
      } else if (e.key === "j" || e.key === "ArrowDown") {
        if (contactRows.length === 0) return;
        e.preventDefault();
        setFocusedIdx((i) => Math.min(contactRows.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (contactRows.length === 0) return;
        e.preventDefault();
        setFocusedIdx((i) => (i < 0 ? 0 : Math.max(0, i - 1)));
      } else if (e.key === "Enter") {
        if (focusedIdx < 0 || focusedIdx >= contactRows.length) return;
        e.preventDefault();
        router.push(`/contacts/${contactRows[focusedIdx].contact.id}`);
      } else if (e.key === " ") {
        if (focusedIdx < 0 || focusedIdx >= contactRows.length) return;
        e.preventDefault();
        toggleRow(contactRows[focusedIdx].contact.id);
      } else if (e.key === "Escape") {
        if (selectionCount > 0) { e.preventDefault(); clearSelection(); }
        else if (focusedIdx >= 0) { e.preventDefault(); setFocusedIdx(-1); }
      } else if (e.key === "g") {
        const now = Date.now();
        if (now - lastG.current < 400) { setFocusedIdx(0); lastG.current = 0; }
        else lastG.current = now;
      } else if (e.key === "a" && e.shiftKey) {
        e.preventDefault();
        toggleAll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, sp, filters, contactRows, focusedIdx, selectionCount]);

  // Scroll focused row into view inside virtual container.
  useEffect(() => {
    if (focusedIdx < 0) return;
    // Find the vRow index for this contactRow index.
    let contactCount = 0;
    for (let i = 0; i < vRows.length; i++) {
      if (vRows[i].kind === "contact") {
        if (contactCount === focusedIdx) {
          virtualizer.scrollToIndex(i, { behavior: "smooth", align: "auto" });
          break;
        }
        contactCount++;
      }
    }
  }, [focusedIdx]);

  // ── bulk actions ──────────────────────────────────────────────────────
  const [bulkPending, setBulkPending] = useState(false);
  const selectedIds = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );

  async function handleBulkArchive() {
    if (selectedIds.length === 0) return;
    setBulkPending(true);
    await bulkArchiveContacts(selectedIds, !archived);
    clearSelection();
    setBulkPending(false);
  }

  async function handleBulkTag(tagId: string) {
    if (selectedIds.length === 0) return;
    setBulkPending(true);
    await bulkAddTagToContacts(selectedIds, tagId);
    clearSelection();
    setBulkPending(false);
  }

  // ── tag click → filter ────────────────────────────────────────────────
  const handleTagClick = useCallback(
    (t: Tag) => {
      const next = new URLSearchParams(sp.toString());
      next.set("tag", t.name);
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [router, pathname, sp],
  );

  const totalCount = initialContacts.length;
  const matchedCount = sorted.length;
  const hasActiveQuery =
    q.length > 0 || Object.keys(filters).length > 0 || !!tag || !!projectId;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── toolbar ─────────────────────────────────────────────────── */}
      <div className="mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TypeSegmented />
          <ContactsSearch />
        </div>
        <VenturePillBar tags={ventureTags} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <ProjectFilter options={projectOptions} />
            <FilterBar options={FILTER_OPTIONS} groupOptions={GROUP_OPTIONS} />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton endpoint="/api/export/contacts" />
            <SavedViews namespace="contacts" />
          </div>
        </div>
        <ActiveFilters projectOptions={projectOptions} />
      </div>

      {/* ── empty state ─────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <Card className="grid place-items-center px-6 py-10 text-center">
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {totalCount === 0
                ? archived
                  ? "No archived contacts."
                  : "No contacts yet."
                : "No contacts match these filters."}
            </p>
            {totalCount === 0 && !archived && (
              <div className="flex justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/contacts/new">
                    <Plus className="h-4 w-4" /> New contact
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/contacts/quick">
                    <Mic className="h-4 w-4" /> 30-sec
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* ── mobile card list (< md) ────────────────────────────── */}
          <div className="divide-y divide-[var(--border)] md:hidden">
            {contactRows.map(({ contact: c }) => (
              <MobileCard
                key={c.id}
                contact={c}
                selected={selected.has(c.id)}
                onToggle={() => toggleRow(c.id)}
                onTagClick={handleTagClick}
              />
            ))}
          </div>

          {/* ── desktop virtual table (≥ md) ──────────────────────── */}
          <div className="hidden md:block">
            <div
              ref={scrollRef}
              style={{ maxHeight: TABLE_MAX_H, overflowY: "auto" }}
            >
              <table className="min-w-full text-sm">
                {/* sticky thead */}
                <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)] text-left">
                  <tr>
                    {/* select-all checkbox */}
                    <th className="w-10 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
                      >
                        {allVisibleSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    {/* avatar spacer */}
                    <th className="w-10 px-2 py-2.5" />
                    <ColumnHeader label="Name" col="name" basePath="/contacts" searchParams={queryString} />
                    <ColumnHeader label="Relationship" col="relationship" basePath="/contacts" searchParams={queryString} />
                    <ColumnHeader label="Organization" col="organization" basePath="/contacts" searchParams={queryString} />
                    <ColumnHeader label="Tags" col="tags" basePath="/contacts" searchParams={queryString} sortable={false} />
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Reach
                    </th>
                    <ColumnHeader label="Last touch" col="lastTouch" basePath="/contacts" searchParams={queryString} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {/* top spacer — keeps virtual offset without absolute positioning */}
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr style={{ height: virtualizer.getVirtualItems()[0].start }}>
                      <td colSpan={8} />
                    </tr>
                  )}

                  {virtualizer.getVirtualItems().map((vi) => {
                    const row = vRows[vi.index];

                    if (row.kind === "group-header") {
                      return (
                        <tr
                          key={vi.key}
                          data-index={vi.index}
                          ref={virtualizer.measureElement}
                          className="bg-[var(--muted)]/15"
                        >
                          <td
                            colSpan={8}
                            className="px-4 py-1.5 text-xs uppercase tracking-wide text-[var(--muted-foreground)]"
                          >
                            {row.label}{" "}
                            <span className="text-[var(--muted-foreground)]/70">
                              · {row.count}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    const { contact: c, rowIdx } = row;
                    const isFocused = rowIdx === focusedIdx;
                    const isSelected = selected.has(c.id);

                    return (
                      <tr
                        key={vi.key}
                        data-index={vi.index}
                        ref={virtualizer.measureElement}
                        className={cn(
                          "transition-colors",
                          isSelected
                            ? "bg-[var(--accent)]/20"
                            : isFocused
                            ? "bg-[var(--accent)]/30 ring-1 ring-inset ring-[var(--ring)]/30"
                            : "hover:bg-[var(--muted)]/30",
                        )}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleRow(c.id)}
                            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            aria-label={isSelected ? "Deselect" : "Select"}
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-[var(--primary)]" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-3">
                          <ContactAvatar name={c.name} type={c.type as "person" | "org"} />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          {c.organization && (
                            <div className="text-xs text-[var(--muted-foreground)]">{c.organization}</div>
                          )}
                          <ProjectPills projects={c.projects} className="mt-1" />
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{c.relationshipType}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                          {c.organization ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <TagPills tags={c.tags} onTagClick={handleTagClick} />
                        </td>
                        <td className="px-4 py-3">
                          <ReachIcons channels={c.channels} />
                        </td>
                        <td className="px-4 py-3">
                          <LastTouchCell value={c.lastTouchAt} />
                        </td>
                      </tr>
                    );
                  })}

                  {/* bottom spacer */}
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr
                      style={{
                        height:
                          virtualizer.getTotalSize() -
                          (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                      }}
                    >
                      <td colSpan={8} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── footer: count + keyboard hints + bulk bar ─────────── */}
          <div className="border-t border-[var(--border)] px-4 py-2">
            {selectionCount > 0 ? (
              <BulkBar
                count={selectionCount}
                allTags={allTags}
                archived={archived}
                pending={bulkPending}
                onArchive={handleBulkArchive}
                onTag={handleBulkTag}
                onClear={clearSelection}
              />
            ) : (
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span>
                  {matchedCount} contact{matchedCount === 1 ? "" : "s"}
                  {hasActiveQuery && matchedCount !== totalCount && (
                    <> · filtered from {totalCount}</>
                  )}
                </span>
                <span className="hidden gap-3 sm:flex">
                  <Hint k="/" l="search" />
                  <Hint k="n" l="new" />
                  <Hint k="t" l="type" />
                  <Hint k="j/k" l="navigate" />
                  <Hint k="Space" l="select" />
                  <Hint k="⇧A" l="select all" />
                  <Hint k="↵" l="open" />
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

// ─── project filter ─────────────────────────────────────────────────────────
function ProjectFilter({ options }: { options: ContactProjectOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const projectId = sp.get("project") ?? "";
  const hasSelectedOption = options.some((p) => p.id === projectId);
  const selectedValue = projectId && hasSelectedOption ? projectId : "_all";
  const ucaima = options.find((p) => p.title.toLowerCase() === "ucaima transformation");

  if (options.length === 0) return null;

  function setProject(nextProjectId: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (nextProjectId) next.set("project", nextProjectId);
    else next.delete("project");
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Project
        </label>
        <Select
          value={selectedValue}
          onValueChange={(v) => setProject(v === "_all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All projects</SelectItem>
            {options.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title} ({project.contactCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {ucaima && ucaima.id !== projectId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-full gap-1.5 px-2 text-xs"
          onClick={() => setProject(ucaima.id)}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Ucaima Transformation
        </Button>
      )}
      {projectId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setProject(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function ProjectPills({
  projects,
  className,
}: {
  projects: ContactListItem["projects"];
  className?: string;
}) {
  if (projects.length === 0) return null;

  const visible = projects.slice(0, 2);
  const extra = projects.length - visible.length;

  return (
    <div className={cn("flex max-w-full flex-wrap gap-1", className)}>
      {visible.map((project) => (
        <span
          key={project.id}
          className="inline-flex max-w-52 items-center gap-1 truncate rounded border border-[var(--border)] bg-[var(--muted)]/35 px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]"
          title={
            project.parentTitle
              ? `${project.parentTitle} / ${project.title}`
              : project.title
          }
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{project.title}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--muted)]/35 px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ─── mobile card ─────────────────────────────────────────────────────────────
function MobileCard({
  contact: c,
  selected,
  onToggle,
  onTagClick,
}: {
  contact: ContactListItem;
  selected: boolean;
  onToggle: () => void;
  onTagClick: (t: Tag) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        selected ? "bg-[var(--accent)]/20" : "hover:bg-[var(--muted)]/20",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="mt-0.5 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        aria-label={selected ? "Deselect" : "Select"}
      >
        {selected ? (
          <CheckSquare className="h-4 w-4 text-[var(--primary)]" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>
      <ContactAvatar name={c.name} type={c.type as "person" | "org"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/contacts/${c.id}`}
            className="font-medium leading-tight hover:underline"
          >
            {c.name}
          </Link>
          <LastTouchCell value={c.lastTouchAt} />
        </div>
        {c.organization && (
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{c.organization}</p>
        )}
        <ProjectPills projects={c.projects} className="mt-1.5" />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <TagPills tags={c.tags} onTagClick={onTagClick} />
          <ReachIcons channels={c.channels} />
        </div>
      </div>
    </div>
  );
}

// ─── bulk action bar ─────────────────────────────────────────────────────────
function BulkBar({
  count,
  allTags,
  archived,
  pending,
  onArchive,
  onTag,
  onClear,
}: {
  count: number;
  allTags: Tag[];
  archived: boolean;
  pending: boolean;
  onArchive: () => void;
  onTag: (tagId: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-[var(--foreground)]">
        {count} selected
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={onArchive}
          disabled={pending}
        >
          <Archive className="h-3.5 w-3.5" />
          {archived ? "Unarchive" : "Archive"}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
            >
              <TagIcon className="h-3.5 w-3.5" />
              Tag
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Add tag to {count} contact{count === 1 ? "" : "s"}
            </p>
            <div className="mt-1 max-h-48 overflow-y-auto">
              {allTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--accent)]"
                  onClick={() => onTag(t.id)}
                >
                  {t.color ? (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full border border-[var(--border)]" />
                  )}
                  {t.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}

// ─── keyboard hint ────────────────────────────────────────────────────────────
function Hint({ k, l }: { k: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-[var(--border)] bg-[var(--muted)]/40 px-1 font-mono text-[10px]">
        {k}
      </kbd>
      {l}
    </span>
  );
}
