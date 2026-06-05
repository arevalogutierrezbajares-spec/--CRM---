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
import { WIDGET_LABELS, DEFAULT_WIDGETS, type DashWidget, type WidgetSize } from "@/lib/dashboard/layout";

const WIDGET_SIZES: WidgetSize[] = ["compact", "standard", "wide", "full"];
const SIZE_LABEL: Record<WidgetSize, string> = {
  compact: "Compact",
  standard: "Standard",
  wide: "Wide",
  full: "Full",
};
const SIZE_CLASS: Record<WidgetSize, string> = {
  compact: "lg:col-span-1 xl:col-span-3",
  standard: "lg:col-span-1 xl:col-span-4",
  wide: "lg:col-span-2 xl:col-span-8",
  full: "lg:col-span-2 xl:col-span-12",
};

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
  function cycleSize(id: string) {
    setLayout((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const next = WIDGET_SIZES[(WIDGET_SIZES.indexOf(w.size) + 1) % WIDGET_SIZES.length];
        return { ...w, size: next };
      }),
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
            <span className="mr-auto text-tiny font-medium uppercase tracking-wide text-text-tertiary">Dashboard layout</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLayout(DEFAULT_WIDGETS.map((w) => ({ ...w })))} className="h-[40px] text-text-tertiary">
              Reset
            </Button>
            <Button type="button" size="sm" onClick={done} loading={saving} className="h-[40px]">
              <Check size={14} /> Done
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-[40px] text-text-tertiary">
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
                  onSize={() => cycleSize(w.id)}
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
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-12">
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
                className={`${SIZE_CLASS[w.size]} min-w-0 h-full [&>*]:h-full`}
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
  onSize,
}: {
  w: DashWidget;
  node: React.ReactNode;
  onHide: () => void;
  onSize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-80" : ""}>
      <div className="mb-1 flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] bg-card px-1.5 py-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="grid h-[40px] w-[40px] cursor-grab place-items-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary active:cursor-grabbing active:scale-[0.96]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        <span className="mr-auto truncate text-tiny font-medium text-text-secondary">
          {WIDGET_LABELS[w.id] ?? w.id}
        </span>
        <span className="rounded-full bg-surface px-2 py-1 text-tiny text-text-tertiary">{SIZE_LABEL[w.size]}</span>
        <EditBtn label={`Resize from ${SIZE_LABEL[w.size]}`} onClick={onSize}>
          {w.size === "compact" || w.size === "standard" ? <RectangleHorizontal size={13} /> : <Square size={13} />}
        </EditBtn>
        <EditBtn label={w.hidden ? "Show" : "Hide"} onClick={onHide}>
          {w.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
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
      className="grid h-[40px] w-[40px] place-items-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary active:scale-[0.96]"
    >
      {children}
    </button>
  );
}
