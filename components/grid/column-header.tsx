import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  parseSort,
  toggleSort,
  buildHref,
  type SortEntry,
} from "@/lib/grid-state";
import { cn } from "@/lib/utils";

export function ColumnHeader({
  label,
  col,
  basePath,
  searchParams,
  sortable = true,
  className,
}: {
  label: string;
  col: string;
  basePath: string;
  searchParams: URLSearchParams;
  sortable?: boolean;
  className?: string;
}) {
  const sort = parseSort(searchParams.get("sort"));
  const current = sort.find((s) => s.col === col);
  const next = toggleSort(sort, col);
  const href = buildHref(basePath, searchParams, { sort: next });

  if (!sortable) {
    return (
      <th className={cn("px-4 py-2.5", className)}>
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </span>
      </th>
    );
  }

  return (
    <th className={cn("px-4 py-2.5", className)}>
      <Link
        href={href}
        scroll={false}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        {label}
        {current?.dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : current?.dir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </Link>
    </th>
  );
}

export type { SortEntry };
