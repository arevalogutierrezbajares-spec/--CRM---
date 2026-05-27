import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import {
  gatherNudgeCandidates,
  filterDedupedCandidates,
  recordNudgesFired,
} from "@/lib/nudge-engine";
import { FAKE_USER_ID } from "./setup";

const { contacts, projects, milestones, nudges } = schema;

describe("[integration] nudge engine", () => {
  it("gathers candidates from overdue/blocked/stale", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 120);

    const [proj] = await db
      .insert(projects)
      .values({ title: "Overdue project", ownerId: FAKE_USER_ID })
      .returning();
    await db.insert(milestones).values({
      projectId: proj.id,
      title: "Send proposal",
      ownerId: FAKE_USER_ID,
      dueDate: yesterday.toISOString().slice(0, 10),
    });

    const past = new Date();
    past.setDate(past.getDate() - 3);
    await db.insert(projects).values({
      title: "Blocked project",
      ownerId: FAKE_USER_ID,
      status: "waiting",
      waitingOn: "their signature",
      expectedUnblockDate: past.toISOString().slice(0, 10),
    });

    await db.insert(contacts).values({
      name: "Stale Friend",
      ownerId: FAKE_USER_ID,
      relationshipType: "friend",
      lastTouchAt: longAgo,
    });

    const cands = await gatherNudgeCandidates(FAKE_USER_ID);
    const sigs = cands.map((c) => c.signature);
    expect(sigs.some((s) => s.startsWith("overdue:milestone:"))).toBe(true);
    expect(sigs.some((s) => s.startsWith("overdue:blocker:"))).toBe(true);
    expect(sigs.some((s) => s.startsWith("stale:friend:"))).toBe(true);
  });

  it("dedupes candidates already fired today", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const [proj] = await db
      .insert(projects)
      .values({ title: "P", ownerId: FAKE_USER_ID })
      .returning();
    const [m] = await db
      .insert(milestones)
      .values({
        projectId: proj.id,
        title: "Overdue",
        ownerId: FAKE_USER_ID,
        dueDate: yesterday.toISOString().slice(0, 10),
      })
      .returning();

    const sig = `overdue:milestone:${m.id}`;
    await db.insert(nudges).values({ ownerId: FAKE_USER_ID, signature: sig });

    const cands = await gatherNudgeCandidates(FAKE_USER_ID);
    const fresh = await filterDedupedCandidates(FAKE_USER_ID, cands);
    expect(fresh.find((c) => c.signature === sig)).toBeUndefined();
  });

  it("recordNudgesFired inserts new signatures", async () => {
    await recordNudgesFired(FAKE_USER_ID, [
      { signature: "stale:friend:abc", line: "x" },
      { signature: "stale:friend:def", line: "y" },
    ]);
    const rows = await db.select().from(nudges);
    expect(rows.map((r) => r.signature).sort()).toEqual([
      "stale:friend:abc",
      "stale:friend:def",
    ]);
  });
});
