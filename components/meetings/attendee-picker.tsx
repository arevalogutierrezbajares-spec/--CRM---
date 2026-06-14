"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createContactQuickAction } from "@/app/(app)/meetings/actions";

export type PickerContact = {
  id: string;
  name: string;
  organization: string | null;
};

/**
 * Dynamic, search-driven attendee selector for the New-meeting form. Selected
 * people show as removable bubbles; the search box filters the CRM live and
 * lets you mint a brand-new contact inline when nobody matches. Controlled —
 * the parent owns the selected-id list so it can submit them with the form.
 */
export function AttendeePicker({
  contacts,
  value,
  onChange,
}: {
  contacts: PickerContact[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  // Local pool so contacts created inline are immediately selectable/visible.
  const [pool, setPool] = useState<PickerContact[]>(contacts);
  const [query, setQuery] = useState("");
  const [creating, startCreate] = useTransition();

  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selected = useMemo(
    () => value.map((id) => byId.get(id)).filter(Boolean) as PickerContact[],
    [value, byId],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter(
        (c) =>
          !selectedSet.has(c.id) &&
          (c.name.toLowerCase().includes(q) ||
            (c.organization ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [query, pool, selectedSet]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !!q && pool.some((c) => c.name.toLowerCase() === q);
  }, [query, pool]);

  function add(id: string) {
    if (!selectedSet.has(id)) onChange([...value, id]);
    setQuery("");
  }

  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  function createAndAdd() {
    const name = query.trim();
    if (!name || creating) return;
    startCreate(async () => {
      const res = await createContactQuickAction({ name });
      if (res.ok) {
        const c: PickerContact = {
          id: res.contact.id,
          name: res.contact.name,
          organization: res.contact.organization,
        };
        setPool((p) => [c, ...p]);
        onChange([...value, c.id]);
        setQuery("");
        toast.success(`Added ${c.name} to your CRM`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Selected attendees as bubbles */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 py-1 pl-1 pr-1.5 text-sm"
            >
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--primary)]/15 text-xs font-semibold text-[var(--primary)]">
                {initial(c.name)}
              </span>
              <span className="max-w-[180px] truncate">{c.name}</span>
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Remove ${c.name}`}
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search / add */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length > 0) add(matches[0].id);
              else if (query.trim() && !exactMatch) createAndAdd();
            }
          }}
          placeholder={
            selected.length ? "Add another attendee…" : "Search your CRM to add attendees…"
          }
          className="min-h-11 text-sm"
        />
        {query.trim() && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c.id)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                <Plus className="h-3.5 w-3.5 flex-none text-[var(--muted-foreground)]" />
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  {c.organization ? (
                    <span className="text-[var(--muted-foreground)]"> · {c.organization}</span>
                  ) : null}
                </span>
              </button>
            ))}
            {!exactMatch && (
              <button
                type="button"
                onClick={createAndAdd}
                disabled={creating}
                className="flex min-h-11 w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--muted)] disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5 flex-none text-[var(--blue-text)]" />
                <span className="truncate">
                  {creating ? "Adding…" : (
                    <>
                      Add <span className="font-medium">“{query.trim()}”</span> to your CRM
                    </>
                  )}
                </span>
              </button>
            )}
            {matches.length === 0 && exactMatch && (
              <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Already selected.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        Each selected attendee gets a meeting touch on save.
      </p>
    </div>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
