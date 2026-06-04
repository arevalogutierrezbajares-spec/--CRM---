"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  SlidersHorizontal,
  Check,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RectangleHorizontal,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDashboardLayoutAction } from "@/app/(app)/dashboard/layout-actions";
import {
  WIDGET_LABELS,
  DEFAULT_WIDGETS,
  type DashWidget,
} from "@/lib/dashboard/layout";

export function CustomizableDashboard({
  widgets,
  savedLayout,
}: {
  widgets: { id: string; node: React.ReactNode }[];
  savedLayout: DashWidget[];
}) {
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<DashWidget[]>(savedLayout);
  const [saving, startSave] = useTransition();

  const nodeById = useMemo(() => new Map(widgets.map((w) => [w.id, w.node])), [widgets]);

  function move(id: string, dir: -1 | 1) {
    setLayout((prev) => {
      const i = prev.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function toggleHide(id: string) {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)));
  }
  function toggleWidth(id: string) {
    setLayout((prev) =>
      prev.map((w) => (w.id === id ? { ...w, width: w.width === "full" ? "half" : "full" } : w)),
    );
  }

  function done() {
    startSave(async () => {
      const res = await saveDashboardLayoutAction(layout);
      if (res.ok) {
        setEditing(false);
        toast.success("Layout saved");
      } else {
        toast.error(res.error);
      }
    });
  }

  // Edit mode shows every widget (hidden ones dimmed); normal mode hides them.
  const shown = editing ? layout : layout.filter((w) => !w.hidden);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <span className="mr-auto text-tiny text-text-tertiary">
              Reorder, hide, or resize your widgets.
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLayout(DEFAULT_WIDGETS.map((w) => ({ ...w })))}
              className="text-text-tertiary"
            >
              Reset
            </Button>
            <Button type="button" size="sm" onClick={done} loading={saving}>
              <Check size={14} /> Done
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="text-text-tertiary"
          >
            <SlidersHorizontal size={13} /> Customize
          </Button>
        )}
      </div>

      {!editing && shown.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-[13px] text-text-secondary">All widgets are hidden.</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 text-tiny text-[var(--blue-text)] hover:underline"
          >
            Customize to bring them back
          </button>
        </div>
      )}

      <div className="grid gap-2.5 lg:grid-cols-2">
        {shown.map((w, i) => {
          const node = nodeById.get(w.id);
          if (!node) return null;
          return (
            <div key={w.id} className={w.width === "full" ? "lg:col-span-2" : "lg:col-span-1"}>
              {editing && (
                <div className="mb-1 flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-1">
                  <span className="mr-auto truncate text-tiny font-medium text-text-secondary">
                    {WIDGET_LABELS[w.id] ?? w.id}
                  </span>
                  <EditBtn label="Move up" disabled={i === 0} onClick={() => move(w.id, -1)}>
                    <ArrowUp size={12} />
                  </EditBtn>
                  <EditBtn label="Move down" disabled={i === shown.length - 1} onClick={() => move(w.id, 1)}>
                    <ArrowDown size={12} />
                  </EditBtn>
                  <EditBtn
                    label={w.width === "full" ? "Make half width" : "Make full width"}
                    onClick={() => toggleWidth(w.id)}
                  >
                    {w.width === "full" ? <Square size={12} /> : <RectangleHorizontal size={12} />}
                  </EditBtn>
                  <EditBtn label={w.hidden ? "Show" : "Hide"} onClick={() => toggleHide(w.id)}>
                    {w.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </EditBtn>
                </div>
              )}
              <div className={editing && w.hidden ? "opacity-40" : ""}>{node}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-text-primary disabled:opacity-30"
    >
      {children}
    </button>
  );
}
