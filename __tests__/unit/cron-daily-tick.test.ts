import { describe, it, expect } from "vitest";
import { jobsForSlot } from "@/app/api/cron/daily-tick/route";

describe("daily-tick jobsForSlot", () => {
  it("pm slot runs only the latency-sensitive pair", () => {
    expect(jobsForSlot("pm", 3)).toEqual([
      "/api/cron/email-sync",
      "/api/cron/reminders",
    ]);
  });

  it("am slot adds the dailies", () => {
    expect(jobsForSlot("am", 3)).toEqual([
      "/api/cron/email-sync",
      "/api/cron/reminders",
      "/api/cron/watchdogs",
      "/api/cron/nudges",
      "/api/cron/audio-purge",
    ]);
  });

  it("Monday am adds the weekly briefing", () => {
    expect(jobsForSlot("am", 1)).toContain("/api/cron/weekly-briefing");
    expect(jobsForSlot("am", 2)).not.toContain("/api/cron/weekly-briefing");
    expect(jobsForSlot("pm", 1)).not.toContain("/api/cron/weekly-briefing");
  });

  it("unknown slot behaves as pm", () => {
    expect(jobsForSlot("x", 1)).toEqual(jobsForSlot("pm", 1));
  });
});
