"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from "framer-motion";
import { Trophy, RotateCcw } from "lucide-react";

/**
 * WINS board — the dynamic Reel for the weekly review.
 *
 * Replays the week Mon→Sun: as a scrubber sweeps across the day track, each
 * day's "W-events" get thrown in and caught onto that day's stack, while the
 * weekly total racks up odometer-style. Volume-based Ws come from the
 * scripts/wins-ingest.ts pipeline (Claude usage + AGB-CRM git activity).
 *
 * Tiers: `w` small (green) · `W` big (amber) · `DUB` combo (purple).
 */

type Tier = "w" | "W" | "DUB";
export type WinEvent = {
  ts: string;
  day: string;
  tier: Tier;
  source: string;
  label: string;
  value: number;
};
export type WinsData = {
  weekOf: string;
  totals: { w: number; W: number; DUB: number; all: number };
  days: { day: string; commits: number; sessions: number; activeMin: number; tokens: number }[];
  events: WinEvent[];
};

const TIER_STYLE: Record<Tier, { fg: string; bg: string; size: number; glow: string; idle: number }> = {
  w: { fg: "var(--green-text)", bg: "var(--green-bg)", size: 30, glow: "transparent", idle: 1 },
  W: { fg: "var(--amber-text)", bg: "var(--amber-bg)", size: 48, glow: "var(--amber-text)", idle: 1.6 },
  DUB: { fg: "var(--purple-text)", bg: "var(--purple-bg)", size: 40, glow: "var(--purple-text)", idle: 1.3 },
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dowOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return DOW[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

// Mon→Sun sweep timing: each day lands DAY_STAGGER after the previous, so the
// reveal order emerges from per-glyph framer delays — no interval, no setState.
const DAY_STAGGER = 0.42;
const SWEEP_DURATION = 7 * DAY_STAGGER;

export function WinsBoard({ data }: { data: WinsData }) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0); // replay nonce — bumped to re-run the sweep

  const days = useMemo(() => {
    const byDay = new Map<string, WinEvent[]>();
    for (const e of data.events) (byDay.get(e.day) ?? byDay.set(e.day, []).get(e.day)!).push(e);
    return data.days.map((d) => ({ ...d, events: byDay.get(d.day) ?? [] }));
  }, [data]);

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-card p-4">
      {/* header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[var(--amber-text)]" />
          <h2 className="font-display text-[20px] leading-none tracking-tight text-text-primary">
            Wins this week
          </h2>
          <span className="ml-1 text-tiny text-text-tertiary">
            taking Ws — Claude grind + CRM time
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Odometer total={data.totals.all} tick={tick} reduce={!!reduce} />
          {!reduce && (
            <button
              onClick={() => setTick((t) => t + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-text-tertiary transition-colors hover:text-text-primary"
              title="Replay the week"
              aria-label="Replay the week"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* day track — keyed by `tick` so a replay remounts and re-runs the sweep */}
      <div key={tick} className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div
            key={d.day}
            className="flex min-h-[120px] flex-col items-center rounded-lg border border-[var(--border)] bg-[var(--bg-subtle,transparent)] p-1.5"
          >
            <span className="mb-1 text-tiny font-medium text-text-tertiary">{dowOf(d.day)}</span>
            <div className="flex flex-1 flex-col-reverse items-center justify-start gap-1">
              {d.events.map((e, k) => (
                <WGlyph key={k} event={e} dayIndex={i} index={k} reduce={!!reduce} />
              ))}
            </div>
            {d.events.length === 0 && <span className="mt-auto text-tiny text-text-tertiary/50">·</span>}
          </div>
        ))}
      </div>

      {/* footer breakdown */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-tiny text-text-tertiary">
        <Legend tier="w" label={`${data.totals.w} small`} />
        <Legend tier="W" label={`${data.totals.W} big`} />
        <Legend tier="DUB" label={`${data.totals.DUB} combo`} />
        <span className="ml-auto">
          {sum(days, "commits")} commits · {sum(days, "sessions")} sessions ·{" "}
          {sum(days, "activeMin")} min · {(sum(days, "tokens") / 1000).toFixed(0)}k tokens
        </span>
      </div>
    </section>
  );
}

function sum(days: { commits: number; sessions: number; activeMin: number; tokens: number }[], k: "commits" | "sessions" | "activeMin" | "tokens") {
  return days.reduce((n, d) => n + d[k], 0);
}

// Pre-catch (thrown) transform. The catch is a squash-and-stretch keyframe
// sequence; the idle loop lives on an inner element so the two compose.
const THROWN = { x: -16, y: -104, rotate: -130, scaleX: 0.5, scaleY: 0.5 };

function WGlyph({ event, dayIndex, index, reduce }: { event: WinEvent; dayIndex: number; index: number; reduce: boolean }) {
  const s = TIER_STYLE[event.tier];
  const label = event.tier === "DUB" ? "W+" : "W";
  // The Mon→Sun sweep: the glyph's day sets the base delay, stacking within a day adds a touch.
  const landDelay = dayIndex * DAY_STAGGER + index * 0.09;

  return (
    // OUTER — the throw & catch: falls in, overshoots, squashes on impact, recovers.
    <motion.div
      initial={reduce ? false : { ...THROWN, opacity: 0 }}
      animate={
        reduce
          ? { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 }
          : {
              x: 0,
              rotate: [-130, 8, 0],
              y: [-104, 0, -14, 0], // fall → land → little bounce → settle
              scaleX: [0.5, 1.35, 0.86, 1], // stretch falling → squash on impact → recover
              scaleY: [0.5, 0.68, 1.16, 1],
              opacity: 1,
            }
      }
      transition={
        reduce
          ? { duration: 0 }
          : {
              duration: 0.66,
              delay: landDelay,
              ease: "easeOut",
              times: [0, 0.55, 0.8, 1],
              opacity: { duration: 0.22, delay: landDelay },
            }
      }
      title={`${event.label} · ${event.source}`}
      className="grid place-items-center"
      style={{ willChange: "transform" }}
    >
      {/* INNER — the idle: a gentle alive bob + wiggle once it has landed. */}
      <motion.span
        animate={reduce ? { y: 0, rotate: 0 } : { y: [0, -3 * s.idle, 0], rotate: [0, -3.5 * s.idle, 3.5 * s.idle, 0] }}
        transition={
          reduce
            ? { duration: 0 }
            : { repeat: Infinity, repeatType: "loop", duration: 2.8 - s.idle * 0.35, ease: "easeInOut", delay: landDelay + 0.66 }
        }
        className="font-display font-bold leading-none select-none"
        style={{
          fontSize: s.size,
          color: s.fg,
          textShadow: event.tier === "w" ? "none" : `0 1px 0 rgba(0,0,0,0.06), 0 0 16px ${s.glow}`,
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}

// Odometer racks 0 → total over the sweep, driven by a framer motion value
// (no React setState, so no cascading-render lint trip). Restarts on replay.
function Odometer({ total, tick, reduce }: { total: number; tick: number; reduce: boolean }) {
  const count = useMotionValue(reduce ? total : 0);
  const text = useTransform(count, (v) => Math.round(v).toString());

  useEffect(() => {
    if (reduce) {
      count.set(total);
      return;
    }
    count.set(0);
    const controls = animate(count, total, { duration: SWEEP_DURATION, ease: "easeOut" });
    return () => controls.stop();
  }, [tick, total, reduce, count]);

  return (
    <div className="flex items-baseline gap-1 tabular-nums">
      <motion.span className="font-display text-[34px] leading-none text-[var(--amber-text)]">{text}</motion.span>
      <span className="font-display text-[20px] leading-none text-text-tertiary">W</span>
    </div>
  );
}

function Legend({ tier, label }: { tier: Tier; label: string }) {
  const s = TIER_STYLE[tier];
  return (
    <span className="flex items-center gap-1">
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-[3px] text-[8px] font-bold"
        style={{ color: s.fg, background: s.bg }}
      >
        {tier === "DUB" ? "+" : "W"}
      </span>
      {label}
    </span>
  );
}
