import { describe, expect, it } from "vitest";
import { computeHealth } from "@/lib/health";

const NOW = new Date("2026-05-26T12:00:00Z");

describe("computeHealth", () => {
  it("returns green for done projects regardless of milestones", () => {
    expect(
      computeHealth({
        status: "done",
        milestones: [{ status: "pending", dueDate: "2020-01-01" }],
        now: NOW,
      }),
    ).toBe("green");
  });

  it("returns red for lost projects", () => {
    expect(computeHealth({ status: "lost", now: NOW })).toBe("red");
  });

  it("returns amber for waiting status with no expected unblock", () => {
    expect(computeHealth({ status: "waiting", now: NOW })).toBe("amber");
  });

  it("returns red for waiting status with expected unblock in the past", () => {
    expect(
      computeHealth({
        status: "waiting",
        expectedUnblockDate: "2026-05-01",
        now: NOW,
      }),
    ).toBe("red");
  });

  it("returns amber for waiting status with future expected unblock", () => {
    expect(
      computeHealth({
        status: "waiting",
        expectedUnblockDate: "2026-06-15",
        now: NOW,
      }),
    ).toBe("amber");
  });

  it("returns red when any milestone is overdue and not done", () => {
    expect(
      computeHealth({
        status: "active",
        milestones: [
          { status: "done", dueDate: "2026-05-01" }, // done, ignored
          { status: "pending", dueDate: "2026-05-20" }, // overdue
        ],
        now: NOW,
      }),
    ).toBe("red");
  });

  it("returns amber when a milestone is due within 3 days but none overdue", () => {
    expect(
      computeHealth({
        status: "active",
        milestones: [{ status: "pending", dueDate: "2026-05-28" }],
        now: NOW,
      }),
    ).toBe("amber");
  });

  it("returns green when all milestones are done or far in the future", () => {
    expect(
      computeHealth({
        status: "active",
        milestones: [
          { status: "done", dueDate: "2026-05-01" },
          { status: "pending", dueDate: "2026-08-15" },
        ],
        now: NOW,
      }),
    ).toBe("green");
  });

  it("ignores milestones with no due date", () => {
    expect(
      computeHealth({
        status: "active",
        milestones: [{ status: "pending", dueDate: null }],
        now: NOW,
      }),
    ).toBe("green");
  });
});
