"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

const NEON = "#3ddc91";
const GLOW = "0 0 8px rgba(61,220,145,0.55)";

/**
 * Retro CRT-style live countdown to the workspace "big milestone": phosphor-green
 * LED digits (D : H : M : S) on a dark panel with scanlines + blinking colons.
 * `now` is seeded from a server prop and ticks via setInterval (timer-driven
 * setState only — never in the effect body).
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
      title="Edit this milestone in workspace settings"
      className="group relative block overflow-hidden rounded-lg border px-3 py-2"
      style={{ borderColor: "#232a33", background: "linear-gradient(180deg, #0c1016 0%, #0a0d12 100%)" }}
    >
      {/* Angel Falls — Venezuela's icon — looping behind the LED panel */}
      <video
        aria-hidden
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster="/videos/angel-falls.jpg"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-65"
      >
        <source src="/videos/angel-falls.webm" type="video/webm" />
        <source src="/videos/angel-falls.mp4" type="video/mp4" />
      </video>
      {/* Darkening overlay so the phosphor digits stay readable over the video */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(8,11,16,0.5) 0%, rgba(8,11,16,0.82) 100%)" }}
      />
      {/* CRT scanlines */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)" }}
      />

      <div className="relative">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7fd9b0" }}>
          <CalendarClock size={11} />
          <span className="truncate">{title || "Big milestone"}</span>
        </div>

        {done ? (
          <div className="mt-1.5 font-mono text-[18px] font-bold" style={{ color: NEON, textShadow: GLOW }}>
            ● LAUNCHED
          </div>
        ) : (
          <div className="mt-1.5 flex items-end gap-1.5">
            <Cell value={days} label="DAYS" />
            <Colon />
            <Cell value={pad(hours)} label="HRS" />
            <Colon />
            <Cell value={pad(mins)} label="MIN" />
            <Colon />
            <Cell value={pad(secs)} label="SEC" />
          </div>
        )}

        {subpoints.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {subpoints.slice(0, 2).map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 font-mono text-[10px]" style={{ color: "#6f8c7d" }}>
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: NEON }} />
                <span className="line-clamp-1">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Cell({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-mono text-[20px] font-bold leading-none tabular-nums"
        style={{ color: NEON, textShadow: GLOW }}
      >
        {value}
      </span>
      <span className="mt-0.5 font-mono text-[8px] tracking-[0.15em]" style={{ color: "#5b7a6a" }}>
        {label}
      </span>
    </div>
  );
}

function Colon() {
  return (
    <span className="mb-2 animate-pulse font-mono text-[16px] font-bold leading-none" style={{ color: "#2f6b50" }}>
      :
    </span>
  );
}
