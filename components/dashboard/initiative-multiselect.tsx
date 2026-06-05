"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Target, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  getItemInitiativesAction,
  setItemInitiativesAction,
} from "@/app/(app)/dashboard/initiative-actions";
import type { InitiativePick } from "@/db/queries/item-initiatives";

/**
 * Self-contained initiative tagger for a task/action in the item drawer. Lazy-loads
 * the workspace initiatives + the item's current links on mount, toggles are
 * optimistic and persisted via setItemInitiativesAction (replace-set). A task/action
 * can fall under 1+ initiatives.
 */
export function InitiativeMultiSelect({
  entityType,
  id,
}: {
  entityType: "milestone" | "action_item";
  id: string;
}) {
  const [all, setAll] = useState<InitiativePick[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getItemInitiativesAction({ entityType, id }).then((res) => {
      if (!live) return;
      if (res.ok) {
        setAll(res.all);
        setSelected(new Set(res.selected));
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [entityType, id]);

  function toggle(initiativeId: string) {
    const next = new Set(selected);
    if (next.has(initiativeId)) next.delete(initiativeId);
    else next.add(initiativeId);
    setSelected(next); // optimistic
    const ids = Array.from(next);
    startTransition(async () => {
      const res = await setItemInitiativesAction({ entityType, id, initiativeIds: ids });
      if (!res.ok) {
        toast.error(res.error);
        setSelected(selected); // revert
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-label text-text-secondary">
          <Target size={12} /> Initiatives
        </span>
        <Link
          href="/initiatives"
          className="flex items-center gap-0.5 text-tiny text-text-tertiary hover:text-text-secondary"
        >
          <Plus size={11} /> Manage
        </Link>
      </div>
      {!loaded ? (
        <div className="h-7 animate-pulse rounded bg-surface" />
      ) : all.length === 0 ? (
        <p className="text-tiny text-text-tertiary">
          No initiatives yet —{" "}
          <Link href="/initiatives" className="underline hover:text-text-secondary">
            create one in Work
          </Link>{" "}
          to group this under it.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {all.map((i) => {
            const on = selected.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggle(i.id)}
                aria-pressed={on}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-tiny transition-colors ${
                  on
                    ? "border-[var(--blue-mid)] bg-[var(--blue-soft)] text-[var(--blue-text)]"
                    : "border-[var(--border)] text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {on && <Check size={11} />}
                {i.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
