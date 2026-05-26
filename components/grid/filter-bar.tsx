"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parseFilter,
  stringifyFilter,
  buildHref,
} from "@/lib/grid-state";

export type FilterOption = {
  col: string;
  label: string;
  values: { value: string; label: string }[];
};

export function FilterBar({
  options,
  groupOptions = [],
}: {
  options: FilterOption[];
  groupOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = parseFilter(sp.get("filter"));
  const group = sp.get("group") ?? "";

  function setFilter(col: string, value: string) {
    const next = { ...filters };
    if (!value) delete next[col];
    else next[col] = value;
    const href = buildHref(pathname, new URLSearchParams(sp.toString()), {
      filters: next,
    });
    router.push(href);
  }

  function clearFilter(col: string) {
    setFilter(col, "");
  }

  function setGroup(value: string) {
    const href = buildHref(pathname, new URLSearchParams(sp.toString()), {
      group: value || null,
    });
    router.push(href);
  }

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    next.delete("filter");
    next.delete("group");
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  const activeCount = Object.keys(filters).length;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {options.map((opt) => (
          <div key={opt.col} className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              {opt.label}
            </label>
            <Select
              value={filters[opt.col] ?? "_all"}
              onValueChange={(v) => setFilter(opt.col, v === "_all" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Any</SelectItem>
                {opt.values.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {groupOptions.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Group by
            </label>
            <Select
              value={group || "_none"}
              onValueChange={(v) => setGroup(v === "_none" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {groupOptions.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {Object.entries(filters).map(([k, v]) => (
          <Badge
            key={k}
            variant="secondary"
            className="cursor-pointer gap-1"
            onClick={() => clearFilter(k)}
          >
            {k}: {v}
            <X className="h-3 w-3" />
          </Badge>
        ))}
        {(activeCount > 0 || group) && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
