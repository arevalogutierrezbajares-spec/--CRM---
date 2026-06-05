"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

/**
 * Live D:H:M:S countdown to the workspace "big milestone". Seeds `now` from a
 * server prop and ticks via setInterval (timer-driven setState only — never in
 * the effect body — to satisfy react-hooks/set-state-in-effect + purity).
 */
export function CountdownCard({
  targetDate,
  title,
  subpoints,
  nowMs,
}: {
  targetDate: string; // YYYY-MM-DD
  title: string | null;
  subpoints: string[];
  nowMs: number;
}) {
  // Deterministic from the prop (an explicit arg → not the forbidden argless new Date()).
  const targetMs = new Date(`${targetDate}T00:00:00`).getTime();
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, targetMs - now);
  const sec = Math.floor(remaining / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const done = remaining <= 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Link
      href="/workspace"
      className="group flex flex-col rounded-lg border bg-card px-3.5 py-3 transition-colors hover:border-[var(--blue-mid)]"
      style={{ borderColor: "var(--border-default)" }}
      title="Edit this milestone in workspace settings"
    >
      <div className="flex items-center gap-1.5 text-label text-text-tertiary">
        <CalendarClock size={12} /> {title || "Big milestone"}
      </div>
      {done ? (
        <div className="mt-1 text-[22px] font-semibold tracking-tight text-green-mid">It&apos;s here 🎉</div>
      ) : (
        <div className="mt-1 flex items-baseline gap-1 tabular-nums">
          <span className="text-[22px] font-semibold tracking-tight text-text-primary">{days}</span>
          <span className="text-[12px] text-text-tertiary">d</span>
          <span className="ml-1 text-[13px] font-medium text-text-secondary">
            {pad(hours)}:{pad(mins)}:{pad(secs)}
          </span>
        </div>
      )}
      {subpoints.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {subpoints.slice(0, 3).map((s, i) => (
            <li key={i} className="flex items-start gap-1 text-tiny text-text-tertiary">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--blue-mid)]" />
              <span className="line-clamp-1">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
