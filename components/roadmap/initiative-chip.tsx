"use client";

import Link from "next/link";

/** Deterministic hue from the initiative id — every surface shows the same
 *  color for the same initiative without extra joins (FR-UNI-2). */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** The unified-data thread: one chip per task row, everywhere. Click → that
 *  initiative. Read-only by design (INV-7 — initiatives edit only in the
 *  roadmap module). */
export function InitiativeChip({
  initiativeId,
  title,
  size = "sm",
}: {
  initiativeId: string;
  title: string;
  size?: "xs" | "sm";
}) {
  const hue = hueFor(initiativeId);
  const color = `oklch(0.62 0.13 ${hue})`;
  const sz = size === "xs" ? "text-tiny px-1.5 py-px" : "text-[11px] px-2 py-0.5";
  return (
    <Link
      href={`/initiatives/${initiativeId}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex max-w-[160px] items-center gap-1 rounded-full border font-medium hover:opacity-80 transition-opacity ${sz}`}
      style={{
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        color,
        background: `color-mix(in oklab, ${color} 9%, transparent)`,
      }}
      title={`Initiative: ${title}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{title}</span>
    </Link>
  );
}
