import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  crons?: Array<{ path?: string; schedule?: string }>;
};

/**
 * The Vercel plan (Hobby, 2026-07-24) allows at most 2 daily cron jobs, so all
 * six logical jobs are fanned out from a single dispatcher, /api/cron/daily-tick,
 * invoked on two slots. See app/api/cron/daily-tick/route.ts.
 */
describe("Vercel cron deployment config", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
  ) as VercelConfig;

  it("stays within the plan's 2-cron limit", () => {
    expect(config.crons?.length).toBeGreaterThan(0);
    expect(config.crons?.length).toBeLessThanOrEqual(2);
  });

  it("routes every cron through the daily-tick dispatcher", () => {
    for (const cron of config.crons ?? []) {
      expect(cron.path).toMatch(/^\/api\/cron\/daily-tick(\?|$)/);
      expect(cron.schedule).toMatch(/\S/);
    }
  });

  it("schedules both dispatcher slots", () => {
    const paths = (config.crons ?? []).map((c) => c.path ?? "");
    expect(paths.some((p) => p.includes("slot=am"))).toBe(true);
    expect(paths.some((p) => p.includes("slot=pm"))).toBe(true);
  });

  it("uses Vercel-supported numeric cron fields", () => {
    for (const cron of config.crons ?? []) {
      expect(cron.schedule).not.toMatch(/[A-Za-z]/);
    }
  });
});
