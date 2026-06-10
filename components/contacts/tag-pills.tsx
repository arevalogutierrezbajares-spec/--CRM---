"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Tag = {
  id: string;
  name: string;
  kind: "venture" | "custom";
  color?: string | null;
};

const MAX_VISIBLE = 3;

export function TagPills({
  tags,
  onTagClick,
}: {
  tags: Tag[];
  onTagClick?: (tag: Tag) => void;
}) {
  if (tags.length === 0) {
    return <span className="text-xs text-[var(--muted-foreground)]/40">—</span>;
  }
  const visible = tags.slice(0, MAX_VISIBLE);
  const overflow = tags.slice(MAX_VISIBLE);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => (
        <TagPill key={t.id} tag={t} onClick={onTagClick} />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 items-center rounded-full border border-[var(--border)] bg-[var(--muted)]/40 px-1.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label={`Show ${overflow.length} more tag${overflow.length === 1 ? "" : "s"}`}
              onClick={(e) => e.stopPropagation()}
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-xs">
            <div className="flex flex-wrap gap-1">
              {overflow.map((t) => (
                <TagPill key={t.id} tag={t} onClick={onTagClick} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function TagPill({
  tag,
  onClick,
}: {
  tag: Tag;
  onClick?: (tag: Tag) => void;
}) {
  const isVenture = tag.kind === "venture" && !!tag.color;
  const className = isVenture
    ? "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-medium leading-none transition-opacity hover:opacity-80"
    : "inline-flex h-5 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 px-2 text-[10px] font-medium leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]";
  const style = isVenture
    ? {
        borderColor: tag.color!,
        backgroundColor: `${tag.color}1A`,
        color: tag.color!,
      }
    : undefined;
  const inner = (
    <>
      {isVenture && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: tag.color! }}
        />
      )}
      <span className="max-w-[120px] truncate" title={tag.name}>
        {tag.name}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick(tag);
        }}
        aria-label={`Filter by tag ${tag.name}`}
        title={`Filter by ${tag.name}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={className} style={style}>
      {inner}
    </span>
  );
}
