import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/daily-tick?slot=am|pm — single-dispatcher cron.
 *
 * The Vercel plan allows 2 daily cron jobs; this endpoint fans one invocation
 * out to every scheduled job so nothing silently dies. Both slots run the
 * latency-sensitive jobs (email-sync, reminders — degraded from every-5-min
 * to twice daily, an accepted plan-limit tradeoff, 2026-07-24); the AM slot also
 * runs the true dailies, and weekly-briefing fires Mondays only.
 *
 * Jobs are invoked over HTTP against this deployment's own origin with the
 * same CRON_SECRET bearer, sequentially, each fenced by try/catch — one bad
 * job never blocks the rest, and the summary is always a 200 so the platform
 * doesn't misread a partial failure as a cron outage (details are in logs).
 */

/** Which job paths run for a slot on a given UTC weekday (0 = Sunday). */
export function jobsForSlot(slot: string, utcWeekday: number): string[] {
  const both = ["/api/cron/email-sync", "/api/cron/reminders"];
  if (slot !== "am") return both;
  const am = [...both, "/api/cron/watchdogs", "/api/cron/nudges", "/api/cron/audio-purge"];
  if (utcWeekday === 1) am.push("/api/cron/weekly-briefing");
  return am;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot") === "am" ? "am" : "pm";
  const origin = req.nextUrl.origin;
  const jobs = jobsForSlot(slot, new Date().getUTCDay());

  const results: { job: string; status: number | string; ms: number }[] = [];
  for (const path of jobs) {
    const started = Date.now();
    try {
      const res = await fetch(`${origin}${path}`, {
        headers: { authorization: `Bearer ${secret}` },
        // Each sub-job gets a bounded slice so one hang can't eat the budget.
        signal: AbortSignal.timeout(60_000),
      });
      results.push({ job: path, status: res.status, ms: Date.now() - started });
    } catch (e) {
      results.push({
        job: path,
        status: String(e).slice(0, 120),
        ms: Date.now() - started,
      });
      console.error(`[daily-tick] ${path} failed:`, e);
    }
  }

  console.log(`[daily-tick] slot=${slot}`, JSON.stringify(results));
  return NextResponse.json({ ok: true, slot, results });
}
