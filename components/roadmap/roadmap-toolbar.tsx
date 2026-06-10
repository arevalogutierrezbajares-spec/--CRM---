"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { exportRoadmap, getCopyForAiPayload } from "@/app/(app)/roadmap/actions";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary hover:bg-surface transition-colors disabled:opacity-50";

/** Roadmap-MD round-trip controls (FR-RMD-1/2/3, FR-PLV-2). */
export function RoadmapToolbar({ currentVersion }: { currentVersion: number }) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const note = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
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
      {flash && <span className="text-[12px] text-text-secondary">{flash}</span>}
    </div>
  );
}
