"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import type { PlanDocData } from "@/db/queries/roadmap";
import { createFunction, createInitiative } from "@/app/(app)/roadmap/actions";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildRoadmapMatrix,
  UNASSIGNED_LOB,
  type MatrixInitiative,
} from "@/lib/roadmap-matrix";

const HEALTH: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};

const STATUSES = ["planning", "active", "paused", "done"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

/**
 * FR-E6 matrix: functions (rows / horizontals) × LoBs (columns / verticals).
 * Reserved Uncategorized row + Unassigned column surface orphans as a fix-me
 * queue; the header badge counts them. Empty cells offer "+ add here" which
 * pre-fills that function+LoB so new work is never created orphaned.
 */
export function RoadmapMatrix({ data }: { data: PlanDocData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fnFilter, setFnFilter] = useState<string>("all");
  const [lobFilter, setLobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const initiatives = useMemo<MatrixInitiative[]>(
    () =>
      data.initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        healthColor: i.healthColor,
        lobId: i.lobId,
        functionId: i.functionId,
        ownerUserId: i.ownerUserId,
        people: i.people,
      })),
    [data.initiatives],
  );

  const matrix = useMemo(
    () =>
      buildRoadmapMatrix(data.functions, data.lobs, initiatives, {
        functionId: fnFilter === "all" ? null : fnFilter,
        lobId: lobFilter === "all" ? null : lobFilter,
        status: statusFilter === "all" ? null : statusFilter,
      }),
    [data.functions, data.lobs, initiatives, fnFilter, lobFilter, statusFilter],
  );

  const orphanCount = matrix.orphanFunctionCount + matrix.orphanLobCount;

  const addHere = (functionId: string | null, lobId: string | null) =>
    startTransition(async () => {
      const r = await createInitiative({
        functionId,
        lobId: lobId === UNASSIGNED_LOB ? null : lobId,
        title: "New milestone",
      });
      if (r.ok) {
        toast.success("Milestone added");
        router.push(`/initiatives/${r.id}`);
      } else {
        toast.error("Couldn't add milestone");
      }
    });

  const gridCols = `minmax(150px,180px) repeat(${matrix.columns.length}, minmax(190px,1fr))`;

  return (
    <div className="space-y-3">
      {/* Filters + orphan badge */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Function"
          value={fnFilter}
          onChange={setFnFilter}
          options={[
            { value: "all", label: "All functions" },
            ...data.functions.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <FilterSelect
          label="Line of business"
          value={lobFilter}
          onChange={setLobFilter}
          options={[
            { value: "all", label: "All LoBs" },
            ...data.lobs.map((l) => ({ value: l.id, label: l.title })),
            { value: UNASSIGNED_LOB, label: "Unassigned" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[{ value: "all", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <AddFunctionButton />
        <span className="flex-1" />
        {orphanCount > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "var(--amber-bg, rgba(139,94,32,0.14))", color: "var(--amber-text)" }}
            title="Initiatives missing a function and/or a line of business"
          >
            <AlertTriangle size={13} /> {orphanCount} to categorize
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">Everything categorized ✓</span>
        )}
      </div>

      {matrix.columns.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-[13px] text-text-secondary" style={{ borderColor: "var(--border-default)" }}>
          Add a line of business to start the matrix.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols }}>
            {/* Header row */}
            <div className="sticky left-0 z-10 border-b border-r bg-surface px-2 py-2 text-tiny font-semibold uppercase tracking-wider text-text-tertiary" style={{ borderColor: "var(--border-default)" }}>
              Function ╲ LoB
            </div>
            {matrix.columns.map((col) => (
              <div
                key={col.key}
                className="border-b px-2 py-2 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--border-default)",
                  color: col.isUnassigned ? "var(--amber-text)" : "var(--text-primary)",
                  background: col.isUnassigned ? "var(--amber-bg, rgba(139,94,32,0.08))" : "var(--bg-surface)",
                }}
              >
                {col.title}
              </div>
            ))}

            {/* Function rows */}
            {matrix.rows.map((row) => (
              <RowCells
                key={row.key}
                row={row}
                columns={matrix.columns}
                pending={pending}
                onAdd={addHere}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RowCells({
  row,
  columns,
  pending,
  onAdd,
}: {
  row: ReturnType<typeof buildRoadmapMatrix>["rows"][number];
  columns: ReturnType<typeof buildRoadmapMatrix>["columns"];
  pending: boolean;
  onAdd: (functionId: string | null, lobId: string | null) => void;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 flex items-center gap-1.5 border-r border-t bg-surface px-2 py-2 text-[12.5px] font-medium"
        style={{
          borderColor: "var(--border-default)",
          color: row.isUncategorized ? "var(--amber-text)" : "var(--text-primary)",
        }}
      >
        {row.isUncategorized && <AlertTriangle size={12} className="shrink-0" />}
        <span className="min-w-0 truncate">{row.name}</span>
        <span className="ml-auto text-tiny tabular-nums text-text-tertiary">{row.total || ""}</span>
      </div>
      {columns.map((col) => {
        const cell = row.cells.find((c) => c.columnKey === col.key);
        const items = cell?.items ?? [];
        const fnId = row.fn?.id ?? null;
        return (
          <div
            key={col.key}
            className="group/cell min-h-[64px] border-t px-1.5 py-1.5"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="space-y-1">
              {items.map((it) => (
                <Link
                  key={it.id}
                  href={`/initiatives/${it.id}`}
                  className="block rounded-md border bg-card px-2 py-1.5 transition-colors hover:bg-surface"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HEALTH[it.healthColor] ?? "var(--green-mid)" }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">{it.title}</span>
                  </div>
                  {it.people.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-0.5">
                      {it.people.slice(0, 4).map((p) => (
                        <span
                          key={p.userId}
                          title={p.displayName}
                          className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-semibold text-white"
                          style={{ background: "var(--blue-text)" }}
                        >
                          {initials(p.displayName)}
                        </span>
                      ))}
                      {it.people.length > 4 && (
                        <span className="text-tiny text-text-tertiary">+{it.people.length - 4}</span>
                      )}
                    </div>
                  )}
                </Link>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => onAdd(fnId, col.lobId)}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-tiny text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary focus-visible:opacity-100 group-hover/cell:opacity-100 disabled:opacity-30 [@media(hover:none)]:opacity-100"
                style={{ borderColor: "var(--border-default)" }}
                title="Add a milestone here"
              >
                <Plus size={11} /> here
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function AddFunctionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await createFunction(n);
      if (r.ok) {
        setName("");
        setOpen(false);
        toast.success(`Added “${n}”`);
        router.refresh();
      } else {
        toast.error(r.error ?? "Couldn't add function");
      }
    });
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setName(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] text-text-secondary hover:text-text-primary"
          style={{ borderColor: "var(--border-default)" }}
        >
          <Plus size={12} /> Function
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="New function name…"
          className="h-[34px] text-[12px]"
          aria-label="New function name"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="mt-1.5 w-full rounded-md px-2 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
          style={{ background: "var(--blue-mid)" }}
        >
          Add function
        </button>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-md border bg-card px-2 py-1 text-[12px]"
        style={{ borderColor: "var(--border-default)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
