"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SlidersHorizontal,
  Check,
  Eye,
  EyeOff,
  RectangleHorizontal,
  Square,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDashboardLayoutAction } from "@/app/(app)/dashboard/layout-actions";
import { WIDGET_LABELS, DEFAULT_WIDGETS, type DashWidget } from "@/lib/dashboard/layout";

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const from = prev.findIndex((w) => w.id === active.id);
      const to = prev.findIndex((w) => w.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
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

  const shown = layout.filter((w) => !w.hidden);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <span className="mr-auto text-tiny text-text-tertiary">Drag to reorder · hide · resize.</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLayout(DEFAULT_WIDGETS.map((w) => ({ ...w })))} className="text-text-tertiary">
              Reset
            </Button>
            <Button type="button" size="sm" onClick={done} loading={saving}>
              <Check size={14} /> Done
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} className="text-text-tertiary">
            <SlidersHorizontal size={13} /> Customize
          </Button>
        )}
      </div>

      {editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={layout.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {layout.map((w) => (
                <SortableRow
                  key={w.id}
                  w={w}
                  node={nodeById.get(w.id)}
                  onHide={() => toggleHide(w.id)}
                  onWidth={() => toggleWidth(w.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-[13px] text-text-secondary">All widgets are hidden.</p>
          <button type="button" onClick={() => setEditing(true)} className="mt-1 text-tiny text-[var(--blue-text)] hover:underline">
            Customize to bring them back
          </button>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {shown.map((w, i) => {
            const node = nodeById.get(w.id);
            if (!node) return null;
            return (
              <motion.div
                key={w.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.05, ease: "easeOut" }}
                className={w.width === "full" ? "lg:col-span-2" : "lg:col-span-1"}
              >
                {node}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableRow({
  w,
  node,
  onHide,
  onWidth,
}: {
  w: DashWidget;
  node: React.ReactNode;
  onHide: () => void;
  onWidth: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-80" : ""}>
      <div className="mb-1 flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] bg-card px-1.5 py-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="cursor-grab rounded p-1 text-text-tertiary hover:text-text-primary active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        <span className="mr-auto truncate text-tiny font-medium text-text-secondary">
          {WIDGET_LABELS[w.id] ?? w.id}
        </span>
        <EditBtn label={w.width === "full" ? "Make half width" : "Make full width"} onClick={onWidth}>
          {w.width === "full" ? <Square size={12} /> : <RectangleHorizontal size={12} />}
        </EditBtn>
        <EditBtn label={w.hidden ? "Show" : "Hide"} onClick={onHide}>
          {w.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </EditBtn>
      </div>
      <div className={w.hidden ? "opacity-40" : ""}>{node}</div>
    </div>
  );
}

function EditBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-text-primary"
    >
      {children}
    </button>
  );
}
