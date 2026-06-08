"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  FileClock,
  Footprints,
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

const TONE: Record<HomeCommandMetric["tone"], { text: string; bg: string; mid: string }> = {
  blue: { text: "var(--blue-text)", bg: "var(--blue-bg)", mid: "var(--blue-mid)" },
  green: { text: "var(--green-text)", bg: "var(--green-bg)", mid: "var(--green-mid)" },
  amber: { text: "var(--amber-text)", bg: "var(--amber-bg)", mid: "var(--amber-mid)" },
  purple: { text: "var(--purple-text)", bg: "var(--purple-bg)", mid: "var(--purple-mid)" },
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function iconFor(metric: HomeCommandMetric): { Icon: LucideIcon; animation: string; Companion?: LucideIcon } {
  if (metric.id === "clients") return { Icon: PersonStanding, Companion: Footprints, animation: "home-kpi-walk 1.45s ease-in-out infinite" };
  if (metric.id === "vav_launch") return { Icon: Rocket, animation: "home-kpi-lift 1.7s ease-in-out infinite" };
  if (metric.id === "influencers") return { Icon: Megaphone, animation: "home-kpi-pulse 1.55s ease-in-out infinite" };
  return { Icon: FileClock, animation: "home-kpi-tick 1.35s ease-in-out infinite" };
}

export function DynamicKpiStrip({ metrics }: { metrics: HomeCommandMetric[] }) {
  const [selectedId, setSelectedId] = useState(metrics[0]?.id ?? null);
  const selected = useMemo(
    () => metrics.find((m) => m.id === selectedId) ?? metrics[0] ?? null,
    [metrics, selectedId],
  );

  if (metrics.length === 0 || !selected) return null;

  const activeTone = TONE[selected.tone];

  return (
    <DashCard className="home-kpi-motion overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel icon={Activity}>Home motion</SectionLabel>
        <span className="rounded-full bg-surface px-2 py-1 text-tiny text-text-tertiary">
          Live CRM signals
        </span>
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const tone = TONE[metric.tone];
          const pct = clampPct(metric.progressPct);
          const isSelected = selected.id === metric.id;
          const { Icon, Companion, animation } = iconFor(metric);
          return (
            <button
              key={metric.id}
              type="button"
              onClick={() => setSelectedId(metric.id)}
              onMouseEnter={() => setSelectedId(metric.id)}
              className={cn(
                "group min-h-[132px] rounded-lg border p-3 text-left outline-none transition-[border-color,background,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-[0.98]",
                isSelected ? "bg-surface" : "hover:bg-surface/70",
              )}
              style={{
                borderColor: isSelected ? tone.text : "var(--border-default)",
                background: isSelected ? `linear-gradient(180deg, ${tone.bg}, transparent 92%)` : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                    {metric.label}
                  </div>
                  <div className="mt-1 flex items-baseline gap-0.5 text-[27px] font-semibold leading-none text-text-primary tabular-nums">
                    <CountUp value={metric.value} />
                    {metric.suffix && <span className="text-[13px] text-text-secondary">{metric.suffix}</span>}
                  </div>
                </div>
                <span
                  className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full"
                  style={{ background: tone.bg, color: tone.text }}
                  aria-hidden
                >
                  <Icon size={22} style={{ animation }} />
                  {Companion && (
                    <Companion
                      size={12}
                      className="absolute bottom-1 right-1 opacity-70"
                      style={{ animation: "home-kpi-footprints 1.45s ease-in-out infinite" }}
                    />
                  )}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct}%`, background: tone.mid }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] text-text-secondary">{metric.subline}</span>
                <span className="shrink-0 text-tiny text-text-tertiary tabular-nums">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="mt-2.5 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: activeTone.text, background: `color-mix(in oklab, ${activeTone.bg} 72%, transparent)` }}
      >
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-text-primary">{selected.label}</div>
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
          0%, 100% { transform: translateX(-2px) rotate(-4deg); }
          50% { transform: translateX(6px) rotate(4deg); }
        }
        @keyframes home-kpi-footprints {
          0%, 100% { opacity: 0.35; transform: translateX(-3px); }
          50% { opacity: 0.85; transform: translateX(2px); }
        }
        @keyframes home-kpi-lift {
          0%, 100% { transform: translateY(2px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes home-kpi-pulse {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          50% { transform: scale(1.08) rotate(2deg); }
        }
        @keyframes home-kpi-tick {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(6deg); }
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
