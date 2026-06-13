"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toggleContactTag } from "@/app/(app)/contacts/tags-actions";
import { cn } from "@/lib/utils";

type Tag = {
  id: string;
  name: string;
  color?: string | null;
  category?: string | null;
};

const UNCATEGORIZED = "Other";

/**
 * Per-row quick-tag: a small "+" that opens a categorized checklist to add or
 * remove tags on a single contact without opening the edit form.
 */
export function QuickTagPopover({
  contactId,
  contactTagIds,
  allTags,
}: {
  contactId: string;
  contactTagIds: string[];
  allTags: Tag[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(contactTagIds), [contactTagIds]);

  // Group by category, uncategorized last.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allTags.filter((t) => t.name.toLowerCase().includes(q))
      : allTags;
    const byCat = new Map<string, Tag[]>();
    for (const t of filtered) {
      const key = t.category?.trim() || UNCATEGORIZED;
      const arr = byCat.get(key);
      if (arr) arr.push(t);
      else byCat.set(key, [t]);
    }
    return [...byCat.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [allTags, query]);

  function toggle(tagId: string) {
    startTransition(async () => {
      const res = await toggleContactTag({ contactId, tagId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add tag"
          className="grid h-5 w-5 shrink-0 place-items-center rounded border border-dashed border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--foreground)]"
        >
          <Plus className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        {allTags.length >= 7 && (
          <div className="mb-1 border-b border-[var(--border)] px-2 pb-1.5 pt-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--muted-foreground)]/60"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[var(--muted-foreground)]">No tags.</p>
          ) : (
            groups.map(([category, tags]) => (
              <div key={category} className="mb-1">
                <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]/70">
                  {category}
                </p>
                {tags.map((t) => {
                  const on = selected.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(t.id)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--accent)] disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border",
                          on
                            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border-[var(--border)]",
                        )}
                      >
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {t.color && (
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate" title={t.name}>
                        {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
