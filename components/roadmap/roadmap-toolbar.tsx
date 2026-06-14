"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  bulkDeleteRoadmap,
  exportRoadmap,
  getCopyForAiPayload,
} from "@/app/(app)/roadmap/actions";
import { useRoadmapSelection } from "./roadmap-selection";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary hover:bg-surface transition-colors disabled:opacity-50";

/** Roadmap-MD round-trip controls (FR-RMD-1/2/3, FR-PLV-2) + multi-select delete. */
export function RoadmapToolbar({ currentVersion }: { currentVersion: number }) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const sel = useRoadmapSelection();

  const note = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  };

  const onDelete = () => {
    const n = sel.count;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected item${n === 1 ? "" : "s"}? This can't be undone.`)) return;
    startTransition(async () => {
      const r = await bulkDeleteRoadmap({
        initiativeIds: sel.initiativeIds,
        taskIds: sel.taskIds,
      });
      if (r.ok) {
        sel.clear();
        sel.setSelectMode(false);
        toast.success(`Deleted ${r.deleted} item${r.deleted === 1 ? "" : "s"}`);
      } else {
        toast.error("Delete failed");
      }
    });
  };

  const onExport = () =>
    startTransition(async () => {
      const { md, version } = await exportRoadmap();
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roadmap-v${version}.md`;
      a.click();
      URL.revokeObjectURL(url);
      note(`Exported plan v${version}`);
    });

  const onCopyForAi = () =>
    startTransition(async () => {
      const { payload, version } = await getCopyForAiPayload();
      await navigator.clipboard.writeText(payload);
      note(`Copied plan v${version} + format spec — paste into any AI`);
    });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onExport}
        disabled={pending}
        className={btn}
        style={{ borderColor: "var(--border-default)" }}
      >
        Export .md
      </button>
      <button
        type="button"
        onClick={onCopyForAi}
        disabled={pending}
        className={btn}
        style={{ borderColor: "var(--border-default)" }}
      >
        Copy for AI
      </button>
      <Link
        href="/roadmap/import"
        className={btn}
        style={{ borderColor: "var(--border-default)" }}
      >
        Import
      </Link>
      <Link
        href="/roadmap/plans"
        className="text-[12px] text-text-secondary hover:text-text-primary px-1"
      >
        {currentVersion > 0 ? `Plan v${currentVersion}` : "No plans yet"}
      </Link>

      {/* Multi-select → delete */}
      <span className="mx-1 h-5 w-px" style={{ background: "var(--border-default)" }} />
      <button
        type="button"
        onClick={() => sel.setSelectMode(!sel.selectMode)}
        className={btn}
        style={{
          borderColor: sel.selectMode ? "var(--blue-mid)" : "var(--border-default)",
          color: sel.selectMode ? "var(--blue-mid)" : undefined,
        }}
        title="Select milestones and deliverables to delete"
      >
        <CheckSquare size={14} />
        {sel.selectMode ? "Done selecting" : "Select"}
      </button>
      {sel.selectMode && (
        <>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending || sel.count === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--red-mid)" }}
          >
            <Trash2 size={14} />
            Delete{sel.count > 0 ? ` (${sel.count})` : ""}
          </button>
          {sel.count > 0 && (
            <button
              type="button"
              onClick={sel.clear}
              className="text-[12px] text-text-secondary hover:text-text-primary px-1"
            >
              Clear
            </button>
          )}
        </>
      )}
      {flash && <span className="text-[12px] text-text-secondary">{flash}</span>}
    </div>
  );
}
