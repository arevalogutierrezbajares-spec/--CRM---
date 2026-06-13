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
import { MultiSelect } from "@/components/ui/multi-select";
import { ColumnHeader } from "@/components/grid/column-header";
import { FilterBar } from "@/components/grid/filter-bar";
import { SavedViews } from "@/components/grid/saved-views";
import { ExportButton } from "@/components/grid/export-button";
import { VenturePillBar } from "@/components/tags/venture-pill-bar";
import { ContactsSearch } from "@/components/contacts/contacts-search";
import { QuickTagPopover } from "@/components/contacts/quick-tag-popover";
import { TagManager } from "@/components/tags/tag-manager";
import { LeadVisibilitySegmented } from "@/components/contacts/lead-visibility-segmented";
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
import type { ContactProjectOption } from "@/db/queries/contacts";
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
  category?: string | null;
};

/** The trimmed per-row payload the grid actually renders. The server page maps
 *  ContactListItem down to this so the RSC payload skips notes, intro chains,
 *  channel ids, workspace/creator ids, etc. */
export type ContactGridRow = {
  id: string;
  name: string;
  type: "person" | "org";
  organization: string | null;
  /** Structured org link, if any (preferred over the free-text `organization`). */
  org: { id: string; name: string } | null;
  /** Own logo falling back to the linked org's logo. */
  logoUrl: string | null;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  lastTouchAt: Date | string | null;
  updatedAt: Date | string;
  channels: { kind: string; value: string; isPrimary?: boolean | null }[];
  tags: Tag[];
  projects: { id: string; title: string; parentTitle: string | null }[];
};

/** Display name for a contact's organization: linked org wins, else free text. */
function orgLabel(c: ContactGridRow): string | null {
  return c.org?.name ?? c.organization ?? null;
}

type Props = {
  initialContacts: ContactGridRow[];
  ventureTags: Tag[];
  allTags: Tag[];
  projectOptions: ContactProjectOption[];
  archived: boolean;
};

// ─── virtual list item types ────────────────────────────────────────────────
type VRow =
  | { kind: "group-header"; label: string; count: number }
  | { kind: "contact"; contact: ContactGridRow; rowIdx: number };

const ROW_H = 52;       // contact row height estimate
const GROUP_H = 28;     // group header height estimate
const TABLE_MAX_H = 640; // px — viewport-like scroll container

const RELATIONSHIP_OPTIONS = [
  { value: "friend", label: "Friend" },
  { value: "lead", label: "Lead" },
  { value: "partner", label: "Partner" },
  { value: "prospect", label: "Prospect" },
];

/** What renders when no explicit relationship filter is set: prospects hidden. */
const DEFAULT_RELATIONSHIPS = "friend,lead,partner";
const ALL_RELATIONSHIPS = "friend,lead,partner,prospect";

/** Split a comma-list filter value into clean entries. */
function splitList(v: string | null | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Latest of two date-ish values (for the displayed "last touch" recency). */
function latestOf(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): Date | null {
  const ad = a ? new Date(a) : null;
  const bd = b ? new Date(b) : null;
  if (!ad) return bd;
  if (!bd) return ad;
  return ad.getTime() >= bd.getTime() ? ad : bd;
}

const GROUP_OPTIONS = [
  { value: "relationship", label: "Relationship" },
  { value: "type", label: "Type" },
  { value: "org", label: "Organization" },
  { value: "project", label: "Project" },
];

const TYPE_CYCLE: Array<"all" | "person" | "org"> = ["all", "person", "org"];
const LINKEDIN_LEAD_TAG_NAME = "linkedin lead";

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
  // ?tag= is a comma list (multi-select; ANY-of semantics).
  const tagParam = sp.get("tag");
  const tagNames = useMemo(() => splitList(tagParam), [tagParam]);
  const projectId = sp.get("project");
  const leadView = sp.get("leadView") ?? "direct";
  const rawFilters = useMemo(() => parseFilter(sp.get("filter")), [sp]);
  // Default view hides prospects: absence of a `relationship` key means
  // "everything except prospect". Selecting all four (or any explicit set)
  // writes the key, so saved views replay exactly what was visible.
  const prospectsHiddenByDefault = !("relationship" in rawFilters);
  const filters = useMemo<Filters>(
    () =>
      prospectsHiddenByDefault
        ? { ...rawFilters, relationship: DEFAULT_RELATIONSHIPS }
        : rawFilters,
    [rawFilters, prospectsHiddenByDefault],
  );
  const sort = parseSort(sp.get("sort"));
  const group = sp.get("group") ?? undefined;

  // ── filtered + sorted list ─────────────────────────────────────────────
  const sorted = useMemo(() => {
    let rows = initialContacts;
    if (tagNames.length > 0) {
      rows = rows.filter((c) => c.tags.some((t) => tagNames.includes(t.name)));
    }
    if (q) {
      rows = rows.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if ((orgLabel(c) ?? "").toLowerCase().includes(q)) return true;
        for (const ch of c.channels) if (ch.value.toLowerCase().includes(q)) return true;
        for (const t of c.tags) if (t.name.toLowerCase().includes(q)) return true;
        for (const p of c.projects) if (p.title.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    rows = applyFilters<ContactGridRow>(rows, filters, {
      // Comma-list values → set membership (multi-select filters).
      relationship: (r, v) => splitList(v).includes(r.relationshipType),
      type: (r, v) => r.type === v,
      org: (r, v) =>
        (orgLabel(r) ?? "").toLowerCase().includes(v.toLowerCase()),
      project: (r, v) => r.projects.some((p) => splitList(v).includes(p.id)),
    });
    return applySort<ContactGridRow>(rows, sort, {
      name: (r) => r.name.toLowerCase(),
      relationship: (r) => r.relationshipType,
      organization: (r) => (orgLabel(r) ?? "").toLowerCase(),
      // Sort by what the column displays: latest of touch vs profile edit.
      lastTouch: (r) => latestOf(r.lastTouchAt, r.updatedAt),
      updated: (r) => new Date(r.updatedAt),
    });
  }, [initialContacts, q, tagNames, filters, sort]);

  const grouped = useMemo(
    () =>
      groupBy<ContactGridRow>(sorted, group, (r) => {
        if (group === "relationship") return r.relationshipType;
        if (group === "type") return r.type;
        if (group === "org") return orgLabel(r) ?? "—";
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
        const cur = (rawFilters.type as "person" | "org" | undefined) ?? "all";
        const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length];
        const nf: Filters = { ...rawFilters };
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
  }, [router, pathname, sp, rawFilters, contactRows, focusedIdx, selectionCount]);

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

  // ── filter setters (multi-select → URL params) ────────────────────────
  const setRelationships = useCallback(
    (values: string[]) => {
      const nf: Filters = { ...rawFilters };
      // No selection = back to the default (prospects hidden).
      if (values.length === 0) delete nf.relationship;
      else nf.relationship = values.join(",");
      startTransition(() => {
        router.push(buildHref(pathname, new URLSearchParams(sp.toString()), { filters: nf }));
      });
    },
    [router, pathname, sp, rawFilters],
  );

  const setTagFilter = useCallback(
    (values: string[]) => {
      const next = new URLSearchParams(sp.toString());
      if (values.length > 0) next.set("tag", values.join(","));
      else next.delete("tag");
      const s = next.toString();
      startTransition(() => router.push(s ? `${pathname}?${s}` : pathname));
    },
    [router, pathname, sp],
  );

  // ── tag click → add to the tag filter ────────────────────────────────
  const handleTagClick = useCallback(
    (t: Tag) => {
      const next = new URLSearchParams(sp.toString());
      const current = splitList(next.get("tag"));
      if (!current.includes(t.name)) current.push(t.name);
      next.set("tag", current.join(","));
      if (t.name.toLowerCase() === LINKEDIN_LEAD_TAG_NAME) {
        next.set("leadView", "leads");
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [router, pathname, sp],
  );

  // Tag filter options clustered by category (category shown as a right hint).
  const tagFilterOptions = useMemo(
    () =>
      [...allTags]
        .sort((a, b) => {
          const ca = a.category ?? "￿"; // uncategorized sinks to the end
          const cb = b.category ?? "￿";
          return ca.localeCompare(cb) || a.name.localeCompare(b.name);
        })
        .map((t) => ({
          value: t.name,
          label: t.name,
          color: t.color,
          hint: t.category ?? undefined,
        })),
    [allTags],
  );

  const totalCount = initialContacts.length;
  const matchedCount = sorted.length;
  const hasActiveQuery =
    q.length > 0 ||
    Object.keys(rawFilters).length > 0 ||
    prospectsHiddenByDefault ||
    tagNames.length > 0 ||
    !!projectId ||
    leadView !== "direct";

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── toolbar ─────────────────────────────────────────────────── */}
      <div className="mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <LeadVisibilitySegmented />
            <TypeSegmented />
          </div>
          <ContactsSearch />
        </div>
        <VenturePillBar tags={ventureTags} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <MultiSelect
              label="Relationship"
              options={RELATIONSHIP_OPTIONS}
              selected={splitList(filters.relationship)}
              onChange={setRelationships}
            />
            <MultiSelect
              label="Tags"
              options={tagFilterOptions}
              selected={tagNames}
              onChange={setTagFilter}
            />
            <ProjectFilter options={projectOptions} />
            <FilterBar options={[]} groupOptions={GROUP_OPTIONS} />
          </div>
          <div className="flex items-center gap-2">
            <TagManager tags={allTags} />
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
                allTags={allTags}
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
                          <ContactAvatar
                            name={c.name}
                            type={c.type as "person" | "org"}
                            logoUrl={c.logoUrl}
                          />
                        </td>
                        <td className="max-w-[320px] px-4 py-3">
                          <Link
                            href={`/contacts/${c.id}`}
                            className="block max-w-full truncate font-medium hover:underline"
                            title={c.name}
                          >
                            {c.name}
                          </Link>
                          {orgLabel(c) && (
                            <div
                              className="max-w-full truncate text-xs text-[var(--muted-foreground)]"
                              title={orgLabel(c) ?? undefined}
                            >
                              {orgLabel(c)}
                            </div>
                          )}
                          <ProjectPills projects={c.projects} className="mt-1" />
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{c.relationshipType}</Badge>
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                          {c.org ? (
                            <Link
                              href={`/contacts/${c.org.id}`}
                              className="block truncate hover:text-[var(--foreground)] hover:underline"
                              title={c.org.name}
                            >
                              {c.org.name}
                            </Link>
                          ) : (
                            <span className="block truncate" title={c.organization ?? undefined}>
                              {c.organization ?? "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <TagPills tags={c.tags} onTagClick={handleTagClick} />
                            <QuickTagPopover
                              contactId={c.id}
                              contactTagIds={c.tags.map((t) => t.id)}
                              allTags={allTags}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ReachIcons channels={c.channels} />
                        </td>
                        <td className="px-4 py-3">
                          <LastTouchCell touchedAt={c.lastTouchAt} editedAt={c.updatedAt} />
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

// ─── project filter (multi-select on the ?project= comma list) ──────────────
function ProjectFilter({ options }: { options: ContactProjectOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const selectedIds = splitList(sp.get("project"));
  const ucaima = options.find((p) => p.title.toLowerCase() === "ucaima transformation");

  if (options.length === 0) return null;

  function setProjects(ids: string[]) {
    const next = new URLSearchParams(sp.toString());
    if (ids.length > 0) next.set("project", ids.join(","));
    else next.delete("project");
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <MultiSelect
        label="Project"
        options={options.map((p) => ({
          value: p.id,
          label: p.title,
          hint: String(p.contactCount),
        }))}
        selected={selectedIds.filter((id) => options.some((p) => p.id === id))}
        onChange={setProjects}
        placeholder="All projects"
        triggerClassName="w-64"
      />
      {ucaima && !selectedIds.includes(ucaima.id) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-full gap-1.5 px-2 text-xs"
          onClick={() => setProjects([...selectedIds, ucaima.id])}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Ucaima Transformation
        </Button>
      )}
    </div>
  );
}

function ProjectPills({
  projects,
  className,
}: {
  projects: ContactGridRow["projects"];
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
  allTags,
  selected,
  onToggle,
  onTagClick,
}: {
  contact: ContactGridRow;
  allTags: Tag[];
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
      <ContactAvatar name={c.name} type={c.type as "person" | "org"} logoUrl={c.logoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/contacts/${c.id}`}
            className="min-w-0 truncate font-medium leading-tight hover:underline"
            title={c.name}
          >
            {c.name}
          </Link>
          <LastTouchCell touchedAt={c.lastTouchAt} editedAt={c.updatedAt} />
        </div>
        {orgLabel(c) && (
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]" title={orgLabel(c) ?? undefined}>
            {orgLabel(c)}
          </p>
        )}
        <ProjectPills projects={c.projects} className="mt-1.5" />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <TagPills tags={c.tags} onTagClick={onTagClick} />
            <QuickTagPopover
              contactId={c.id}
              contactTagIds={c.tags.map((t) => t.id)}
              allTags={allTags}
            />
          </div>
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
