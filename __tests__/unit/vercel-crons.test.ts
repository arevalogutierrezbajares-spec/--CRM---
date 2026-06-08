import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  crons?: Array<{ path?: string; schedule?: string }>;
};

describe("Vercel cron deployment config", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
  ) as VercelConfig;

  it("schedules the email recovery sync route", () => {
    expect(config.crons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/api/cron/email-sync",
          schedule: "*/5 * * * *",
        }),
      ]),
    );
  });

  it("keeps every configured cron on a protected route namespace", () => {
    expect(config.crons?.length).toBeGreaterThan(0);
    for (const cron of config.crons ?? []) {
      expect(cron.path).toMatch(/^\/api\/cron\//);
      expect(cron.schedule).toMatch(/\S/);
    }
  });
});
