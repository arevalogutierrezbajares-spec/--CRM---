#!/usr/bin/env tsx
/**
 * WINS board ingest — turns local Claude Code usage + AGB-CRM git activity into
 * "W-events" for the weekly-review Reel.
 *
 * Volume-based scoring (transparent, tune in SCORING below):
 *   - 1 commit on AGB-CRM .................... w  (small)
 *   - 1 Claude session with cwd in AGB-CRM ... w
 *   - each 30 active minutes on AGB-CRM ...... w
 *   - 100k Claude output tokens in a day ..... W  (big)
 *   - "goal day" (>=3 commits AND >=1 session) W
 *   - streak day (consecutive active day) .... DUB (combo)
 *
 * Data sources (all local — this runs on your machine, not Vercel):
 *   ~/.claude/history.jsonl ............ prompts, keyed by `project` (cwd)
 *   ~/.claude/projects/<enc>/*.jsonl ... transcripts, per-record `cwd` + token usage
 *   git -C <repo> log .................. commits/day
 *
 * Modes:
 *   (default)          refresh wins.json AND upsert the row into Supabase
 *   --dry              write wins.json only, never touch the DB
 *   --week=YYYY-MM-DD  Monday of the week to compute (default: current week)
 *   --out=<path>       output file for the snapshot (default: ./wins.json)
 *   --workspace=<id>   target workspace (else $WINS_WORKSPACE_ID, else first row)
 *
 * Usage:
 *   pnpm tsx scripts/wins-ingest.ts --dry     # preview, no DB
 *   pnpm tsx scripts/wins-ingest.ts           # refresh snapshot + upsert to Supabase
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { config } from "dotenv";

// ---------------------------------------------------------------- config

const REPO = "/Users/tomas/AGB-CRM";
const CLAUDE_DIR = join(homedir(), ".claude");
const HISTORY = join(CLAUDE_DIR, "history.jsonl");
const PROJECTS = join(CLAUDE_DIR, "projects");

const SCORING = {
  activeMinPerW: 30, // 1 w per 30 active minutes
  tokensPerBigW: 100_000, // 1 W per 100k output tokens/day
  idleCapMs: 5 * 60_000, // gap > 5min between records = idle, not counted
  goalDay: { commits: 3, sessions: 1 }, // both thresholds => +1 W
};

// ---------------------------------------------------------------- types

type Tier = "w" | "W" | "DUB";
type WinEvent = {
  ts: string; // ISO — when it happened (or day-anchored)
  day: string; // YYYY-MM-DD
  tier: Tier;
  source: "commit" | "session" | "focus" | "tokens" | "goal" | "streak";
  label: string;
  value: number; // raw count behind the event (commits, minutes, tokens…)
};

type DayAgg = {
  day: string;
  commits: { label: string; ts: string }[];
  sessions: Set<string>;
  activeMs: number;
  outputTokens: number;
};

// ---------------------------------------------------------------- helpers

function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

function dayKey(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

function inRepo(cwd: string | undefined): boolean {
  return !!cwd && (cwd === REPO || cwd.startsWith(REPO + "/"));
}

type JsonlRecord = {
  timestamp?: string;
  project?: string;
  cwd?: string;
  sessionId?: string;
  message?: { usage?: { output_tokens?: number } };
};

function* readJsonl(path: string): Generator<JsonlRecord> {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      /* skip malformed */
    }
  }
}

// ---------------------------------------------------------------- collect

function emptyWeek(monday: string): Map<string, DayAgg> {
  const m = new Map<string, DayAgg>();
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    m.set(day, { day, commits: [], sessions: new Set(), activeMs: 0, outputTokens: 0 });
  }
  return m;
}

function collectGit(week: Map<string, DayAgg>, monday: string) {
  const until = addDays(monday, 7);
  let out = "";
  try {
    out = execSync(
      `git -C "${REPO}" log --since="${monday} 00:00" --until="${until} 00:00" --pretty=format:"%cI%x09%s"`,
      { encoding: "utf8" },
    );
  } catch {
    return;
  }
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [iso, subject = ""] = line.split("\t");
    const day = iso.slice(0, 10);
    const agg = week.get(day);
    if (agg) agg.commits.push({ label: subject, ts: iso });
  }
}

function collectClaude(week: Map<string, DayAgg>, monday: string) {
  const lo = Date.parse(monday + "T00:00:00Z");
  const hi = Date.parse(addDays(monday, 7) + "T00:00:00Z");

  // Prompts (history.jsonl) → session presence per day.
  for (const rec of readJsonl(HISTORY)) {
    if (!inRepo(rec.project)) continue;
    const t = Number(rec.timestamp);
    if (!(t >= lo && t < hi)) continue;
    week.get(dayKey(t))?.sessions.add(rec.sessionId || "?");
  }

  // Transcripts (projects/*/*.jsonl) → tokens + active minutes, filtered by cwd.
  if (!existsSync(PROJECTS)) return;
  for (const dir of readdirSync(PROJECTS)) {
    const full = join(PROJECTS, dir);
    let files: string[];
    try {
      files = readdirSync(full).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      // session timeline for idle-capped active time
      const stamps: { t: number; cwd?: string }[] = [];
      for (const rec of readJsonl(join(full, f))) {
        const t = rec.timestamp ? Date.parse(rec.timestamp) : NaN;
        if (!Number.isFinite(t) || t < lo || t >= hi) continue;
        if (!inRepo(rec.cwd)) continue;
        stamps.push({ t, cwd: rec.cwd });
        // session presence straight from the transcript (history.jsonl mislabels cwd)
        if (rec.sessionId) week.get(dayKey(t))!.sessions.add(rec.sessionId);
        const ot = rec?.message?.usage?.output_tokens;
        if (ot) week.get(dayKey(t))!.outputTokens += ot;
      }
      // active minutes: sum consecutive gaps under the idle cap, per day
      stamps.sort((a, b) => a.t - b.t);
      for (let i = 1; i < stamps.length; i++) {
        const gap = stamps[i].t - stamps[i - 1].t;
        if (gap > 0 && gap <= SCORING.idleCapMs) {
          week.get(dayKey(stamps[i].t))!.activeMs += gap;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- score

function scoreWeek(week: Map<string, DayAgg>, monday: string): WinEvent[] {
  const events: WinEvent[] = [];
  let streak = 0;

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const a = week.get(day)!;
    const activeMin = Math.round(a.activeMs / 60_000);
    const active = a.commits.length > 0 || a.sessions.size > 0 || activeMin > 0;

    // commits
    for (const c of a.commits) {
      events.push({ ts: c.ts, day, tier: "w", source: "commit", label: c.label || "commit", value: 1 });
    }
    // sessions
    if (a.sessions.size > 0) {
      events.push({
        ts: day + "T12:00:00Z",
        day,
        tier: "w",
        source: "session",
        label: `${a.sessions.size} Claude session${a.sessions.size > 1 ? "s" : ""}`,
        value: a.sessions.size,
      });
    }
    // focus (every 30 active min)
    const focusW = Math.floor(activeMin / SCORING.activeMinPerW);
    for (let k = 0; k < focusW; k++) {
      events.push({
        ts: day + "T12:00:00Z",
        day,
        tier: "w",
        source: "focus",
        label: `${activeMin} min focused`,
        value: activeMin,
      });
    }
    // big W: token volume
    const bigW = Math.floor(a.outputTokens / SCORING.tokensPerBigW);
    for (let k = 0; k < bigW; k++) {
      events.push({
        ts: day + "T12:00:00Z",
        day,
        tier: "W",
        source: "tokens",
        label: `${(a.outputTokens / 1000).toFixed(0)}k tokens generated`,
        value: a.outputTokens,
      });
    }
    // big W: goal day
    if (a.commits.length >= SCORING.goalDay.commits && a.sessions.size >= SCORING.goalDay.sessions) {
      events.push({ ts: day + "T18:00:00Z", day, tier: "W", source: "goal", label: "Goal day cleared", value: a.commits.length });
    }
    // streak
    if (active) {
      streak += 1;
      if (streak >= 2) {
        events.push({ ts: day + "T20:00:00Z", day, tier: "DUB", source: "streak", label: `${streak}-day streak`, value: streak });
      }
    } else {
      streak = 0;
    }
  }
  return events;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const weekArg = args.find((a) => a.startsWith("--week="))?.slice(7);
  const outArg = args.find((a) => a.startsWith("--out="))?.slice(6) ?? join(REPO, "wins.json");
  const monday = weekArg ? mondayOf(new Date(weekArg + "T00:00:00Z")) : mondayOf(new Date());

  const week = emptyWeek(monday);
  collectGit(week, monday);
  collectClaude(week, monday);
  const events = scoreWeek(week, monday);

  const byTier = (t: Tier) => events.filter((e) => e.tier === t).length;
  const days = [...week.values()].map((d) => ({
    day: d.day,
    commits: d.commits.length,
    sessions: d.sessions.size,
    activeMin: Math.round(d.activeMs / 60_000),
    tokens: d.outputTokens,
  }));

  const payload = {
    weekOf: monday,
    generatedAt: new Date().toISOString(),
    repo: "AGB-CRM",
    totals: { w: byTier("w"), W: byTier("W"), DUB: byTier("DUB"), all: events.length },
    days,
    events: events.sort((a, b) => a.ts.localeCompare(b.ts)),
  };

  // Always refresh the bundled snapshot (the page's fallback before/without DB).
  writeFileSync(outArg, JSON.stringify(payload, null, 2));
  console.log(`✓ wrote ${outArg}`);
  console.log(`  week of ${monday} — ${payload.totals.all} Ws (w:${payload.totals.w} W:${payload.totals.W} DUB:${payload.totals.DUB})`);
  console.table(days);

  if (dry) {
    console.log("  (--dry) snapshot only — Supabase not touched.");
    return;
  }

  // Upsert into Supabase. Loaded lazily so --dry needs no DB / env.
  config({ path: join(REPO, ".env.local") });
  const { db, schema } = await import("@/db");

  const explicitWs = args.find((a) => a.startsWith("--workspace="))?.slice(12) || process.env.WINS_WORKSPACE_ID;
  let workspaceId: string;
  if (explicitWs) {
    workspaceId = explicitWs;
  } else {
    const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).limit(1);
    if (!w) throw new Error("No workspace found — pass --workspace=<id> or set WINS_WORKSPACE_ID");
    workspaceId = w.id;
  }

  await db
    .insert(schema.winsWeeks)
    .values({
      workspaceId,
      weekOf: monday,
      totals: payload.totals,
      days: payload.days,
      events: payload.events,
    })
    .onConflictDoUpdate({
      target: [schema.winsWeeks.workspaceId, schema.winsWeeks.weekOf],
      set: { totals: payload.totals, days: payload.days, events: payload.events, generatedAt: new Date() },
    });

  console.log(`✓ upserted wins_weeks · workspace ${workspaceId} · week ${monday}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
