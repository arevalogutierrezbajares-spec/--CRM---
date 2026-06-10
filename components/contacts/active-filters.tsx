"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { ContactProjectOption } from "@/db/queries/contacts";
import { parseFilter, buildHref } from "@/lib/grid-state";

const TYPE_LABEL: Record<string, string> = {
  person: "People only",
  org: "Organizations only",
};

const RELATIONSHIP_LABEL: Record<string, string> = {
  friend: "Friend",
  lead: "Lead",
  partner: "Partner",
  prospect: "Prospect",
};

const FILTER_LABEL: Record<string, string> = {
  type: "Type",
  relationship: "Relationship",
  org: "Org contains",
  project: "Project",
};

const GROUP_LABEL: Record<string, string> = {
  relationship: "relationship",
  type: "type",
  org: "organization",
  project: "project",
};

const LEAD_VIEW_LABEL: Record<string, string> = {
  leads: "LinkedIn leads only",
  all: "Direct + LinkedIn leads",
};

const ALL_RELATIONSHIPS = "friend,lead,partner,prospect";

function splitList(v: string | null | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ActiveFilters({
  projectOptions = [],
}: {
  projectOptions?: ContactProjectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = parseFilter(sp.get("filter"));
  const q = sp.get("q");
  const tagNames = splitList(sp.get("tag"));
  const projectIds = splitList(sp.get("project"));
  const leadView = sp.get("leadView");
  const group = sp.get("group");

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  // Default state: no relationship filter key = prospects hidden. The chip is
  // the one-click way to bring them back (writes the explicit all-four list).
  if (!("relationship" in filters)) {
    chips.push({
      key: "prospects-hidden",
      label: "Prospects hidden",
      onRemove: () => {
        router.push(
          buildHref(pathname, new URLSearchParams(sp.toString()), {
            filters: { ...filters, relationship: ALL_RELATIONSHIPS },
          }),
        );
      },
    });
  }

  if (q) {
    chips.push({
      key: "q",
      label: `Search: "${q}"`,
      onRemove: () => {
        const next = new URLSearchParams(sp.toString());
        next.delete("q");
        const s = next.toString();
        router.push(s ? `${pathname}?${s}` : pathname);
      },
    });
  }

  for (const name of tagNames) {
    chips.push({
      key: `tag:${name}`,
      label: `Tag: ${name}`,
      onRemove: () => {
        const next = new URLSearchParams(sp.toString());
        const remaining = tagNames.filter((t) => t !== name);
        if (remaining.length > 0) next.set("tag", remaining.join(","));
        else next.delete("tag");
        const s = next.toString();
        router.push(s ? `${pathname}?${s}` : pathname);
      },
    });
  }

  for (const id of projectIds) {
    const project = projectOptions.find((p) => p.id === id);
    chips.push({
      key: `project:${id}`,
      label: `Project: ${project?.title ?? id}`,
      onRemove: () => {
        const next = new URLSearchParams(sp.toString());
        const remaining = projectIds.filter((p) => p !== id);
        if (remaining.length > 0) next.set("project", remaining.join(","));
        else next.delete("project");
        const s = next.toString();
        router.push(s ? `${pathname}?${s}` : pathname);
      },
    });
  }

  if (leadView && leadView !== "direct") {
    chips.push({
      key: "leadView",
      label: LEAD_VIEW_LABEL[leadView] ?? `Lead view: ${leadView}`,
      onRemove: () => {
        const next = new URLSearchParams(sp.toString());
        next.delete("leadView");
        const s = next.toString();
        router.push(s ? `${pathname}?${s}` : pathname);
      },
    });
  }

  for (const [col, value] of Object.entries(filters)) {
    let display: string;
    if (col === "type") display = TYPE_LABEL[value] ?? value;
    else if (col === "relationship") {
      const values = splitList(value);
      display =
        value === ALL_RELATIONSHIPS
          ? "All relationships"
          : `Relationship: ${values.map((v) => RELATIONSHIP_LABEL[v] ?? v).join(", ")}`;
    } else display = `${FILTER_LABEL[col] ?? col}: ${value}`;

    chips.push({
      key: `f:${col}`,
      label: display,
      onRemove: () => {
        const nextFilters = { ...filters };
        delete nextFilters[col];
        router.push(
          buildHref(pathname, new URLSearchParams(sp.toString()), {
            filters: nextFilters,
          }),
        );
      },
    });
  }

  if (group) {
    chips.push({
      key: "group",
      label: `Grouped by ${GROUP_LABEL[group] ?? group}`,
      onRemove: () => {
        router.push(
          buildHref(pathname, new URLSearchParams(sp.toString()), {
            group: null,
          }),
        );
      },
    });
  }

  if (chips.length === 0) return null;

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    // Preserve `archived` toggle so users don't lose context.
    const archived = next.get("archived");
    for (const k of ["q", "tag", "project", "leadView", "filter", "group", "sort"]) {
      next.delete(k);
    }
    if (archived) next.set("archived", archived);
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--muted)]/60 px-2 text-[11px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          aria-label={`Remove filter: ${c.label}`}
        >
          {c.label}
          <X className="h-3 w-3 text-[var(--muted-foreground)]" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-[11px] text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
