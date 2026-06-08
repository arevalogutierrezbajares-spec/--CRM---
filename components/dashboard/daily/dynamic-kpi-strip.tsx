"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  FileText,
  Flag,
  Megaphone,
  PersonStanding,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { CountUp } from "../shared/count-up";
import type { HomeCommandMetric } from "@/db/queries/dashboard";

const FALLBACK_METRICS: HomeCommandMetric[] = [
  {
    id: "clients",
    label: "Client motion",
    value: 0,
    subline: "CRM read unavailable",
    detail: "Client signal data did not load. Check the Home database warning.",
    href: "/contacts",
    progressPct: 0,
    tone: "blue",
  },
  {
    id: "vav_launch",
    label: "VAV launch",
    value: 0,
    suffix: "%",
    subline: "launch read unavailable",
    detail: "VAV launch data did not load. Check the Home database warning.",
    href: "/lob",
    progressPct: 0,
    tone: "green",
  },
  {
    id: "influencers",
    label: "Influencer engine",
    value: 0,
    subline: "CRM read unavailable",
    detail: "Influencer signal data did not load. Check the Home database warning.",
    href: "/contacts",
    progressPct: 0,
    tone: "purple",
  },
  {
    id: "docs",
    label: "Docs moved",
    value: 0,
    subline: "doc read unavailable",
    detail: "Document activity did not load. Check the Home database warning.",
    href: "/lob",
    progressPct: 0,
    tone: "amber",
  },
];

const TONE: Record<
  HomeCommandMetric["tone"],
  { text: string; bg: string; mid: string }
> = {
  blue: { text: "var(--blue-text)", bg: "var(--blue-bg)", mid: "var(--blue-mid)" },
  green: { text: "var(--green-text)", bg: "var(--green-bg)", mid: "var(--green-mid)" },
  amber: { text: "var(--amber-text)", bg: "var(--amber-bg)", mid: "var(--amber-mid)" },
  purple: {
    text: "var(--purple-text)",
    bg: "var(--purple-bg)",
    mid: "var(--purple-mid)",
  },
};

const CAP = 8; // most figures we draw before showing "+N"

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** The "scene": the metric's quantity rendered as a living visual. */
function Scene({ metric, color }: { metric: HomeCommandMetric; color: string }) {
  if (metric.id === "vav_launch") {
    const pct = clampPct(metric.value);
    const launched = pct >= 100;
    return (
      <div className="relative mt-3 h-9" aria-hidden>
        {/* track (rocket + fill share the same 0–100% origin) */}
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-card" />
        <div
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* finish flag — lights up at launch */}
        <Flag
          size={14}
          className="absolute right-0 top-1/2 -translate-y-1/2"
          style={{ color, opacity: launched ? 1 : 0.45 }}
        />
        {/* rocket rides the fill; at 100% it has "launched" past the flag */}
        {!launched && (
          <span
            className="absolute top-1/2"
            style={{ left: `${pct}%`, transform: "translate(-50%,-50%)" }}
          >
            <Rocket
              size={20}
              style={{ color, animation: "home-kpi-lift 1.6s ease-in-out infinite" }}
            />
          </span>
        )}
      </div>
    );
  }

  if (metric.id === "influencers") {
    const dots = Math.max(0, Math.min(metric.value, CAP));
    const overflow = Math.max(0, metric.value - dots);
    return (
      <div className="mt-3 flex h-9 items-center gap-1.5" aria-hidden>
        <Megaphone
          size={20}
          style={{ color, animation: "home-kpi-pulse 1.5s ease-in-out infinite" }}
        />
        <div className="flex items-center gap-1">
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{
                background: color,
                animation: "home-kpi-blip 1.4s ease-in-out infinite",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
          {overflow > 0 && (
            <span className="text-[11px] font-medium text-text-tertiary tabular-nums">
              +{overflow}
            </span>
          )}
        </div>
      </div>
    );
  }

  // clients (walking figures) + docs (page stack) share a row-of-icons scene.
  const Icon: LucideIcon = metric.id === "clients" ? PersonStanding : FileText;
  const anim = metric.id === "clients" ? "home-kpi-walk" : "home-kpi-tick";
  const n = Math.max(0, Math.min(metric.value, CAP));
  const overflow = Math.max(0, metric.value - n);
  return (
    <div className="mt-3 flex h-9 items-end gap-0.5" aria-hidden>
      {n === 0 ? (
        <span className="text-[12px] text-text-tertiary">—</span>
      ) : (
        Array.from({ length: n }).map((_, i) => (
          <Icon
            key={i}
            size={metric.id === "clients" ? 19 : 16}
            style={{
              color,
              animation: `${anim} 1.25s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))
      )}
      {overflow > 0 && (
        <span className="ml-1 self-center text-[11px] font-medium text-text-tertiary tabular-nums">
          +{overflow}
        </span>
      )}
    </div>
  );
}

export function DynamicKpiStrip({
  metrics,
  error,
}: {
  metrics: HomeCommandMetric[];
  error?: string | null;
}) {
  const visibleMetrics = metrics.length > 0 ? metrics : FALLBACK_METRICS;
  const showingFallback = metrics.length === 0 || Boolean(error);
  const [selectedId, setSelectedId] = useState(visibleMetrics[0]?.id ?? null);
  const selected = useMemo(
    () =>
      visibleMetrics.find((m) => m.id === selectedId) ??
      visibleMetrics[0] ??
      null,
    [visibleMetrics, selectedId],
  );

  if (!selected) return null;

  const activeTone = TONE[selected.tone];

  return (
    <DashCard className="home-kpi-motion overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel icon={Activity}>Home motion</SectionLabel>
        <span className="rounded-full bg-surface px-2 py-1 text-tiny text-text-tertiary">
          {showingFallback ? "CRM signal fallback" : "Live CRM signals"}
        </span>
      </div>
      {showingFallback && (
        <p className="-mt-1 mb-2 text-[12px] text-text-secondary">
          Showing the KPI scene shell while the CRM signal query recovers.
        </p>
      )}

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {visibleMetrics.map((metric) => {
          const tone = TONE[metric.tone];
          const isSelected = selected.id === metric.id;
          return (
            <button
              key={metric.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedId(metric.id)}
              onFocus={() => setSelectedId(metric.id)}
              className={cn(
                "group min-h-[136px] rounded-lg border p-3 text-left outline-none transition-[border-color,background,transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-[0.98]",
                isSelected ? "bg-surface" : "hover:bg-surface/70",
              )}
              style={{
                borderColor: isSelected ? tone.text : "var(--border-default)",
                // Ring (not just hue) marks the active card — non-color cue.
                boxShadow: isSelected ? `0 0 0 2px ${tone.text}` : undefined,
                background: isSelected
                  ? `linear-gradient(180deg, ${tone.bg}, transparent 92%)`
                  : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                    {metric.label}
                  </div>
                  <div className="mt-1 flex items-baseline gap-0.5 text-[27px] font-semibold leading-none text-text-primary tabular-nums">
                    <CountUp value={metric.value} />
                    {metric.suffix && (
                      <span className="text-[13px] text-text-secondary">
                        {metric.suffix}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <Scene metric={metric} color={tone.text} />

              <div className="mt-2 truncate text-[12px] text-text-secondary">
                {metric.subline}
              </div>
            </button>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="mt-2.5 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: activeTone.text,
          background: `color-mix(in oklab, ${activeTone.bg} 72%, transparent)`,
        }}
      >
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-text-primary">
            {selected.label}
          </div>
          <p className="mt-0.5 text-[12px] text-text-secondary">{selected.detail}</p>
        </div>
        <Link
          href={selected.href}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium text-text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{ borderColor: "var(--border-default)" }}
        >
          Open source <ArrowUpRight size={13} />
        </Link>
      </div>

      <style jsx global>{`
        @keyframes home-kpi-walk {
          0%,
          100% {
            transform: translateY(0) rotate(-5deg);
          }
          50% {
            transform: translateY(-3px) rotate(5deg);
          }
        }
        @keyframes home-kpi-lift {
          0%,
          100% {
            transform: translateY(1px) rotate(-6deg);
          }
          50% {
            transform: translateY(-4px) rotate(-2deg);
          }
        }
        @keyframes home-kpi-pulse {
          0%,
          100% {
            transform: scale(1) rotate(-3deg);
          }
          50% {
            transform: scale(1.1) rotate(3deg);
          }
        }
        @keyframes home-kpi-blip {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }
        @keyframes home-kpi-tick {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-kpi-motion * {
            animation: none !important;
          }
        }
      `}</style>
    </DashCard>
  );
}
