import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import {
  gatherNudgeCandidates,
  filterDedupedCandidates,
  recordNudgesFired,
} from "@/lib/nudge-engine";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { contacts, linesOfBusiness, projects, milestones, nudges } = schema;

const base = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };

async function makeLob(title: string) {
  const [lob] = await db
    .insert(linesOfBusiness)
    .values({ ...base, title })
    .returning();
  return lob.id;
}

describe("[integration] nudge engine", () => {
  it("gathers candidates from overdue/blocked/stale", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 120);

    const lobId = await makeLob("Nudge LoB");
    const [proj] = await db
      .insert(projects)
      .values({ ...base, lobId, title: "Overdue project" })
      .returning();
    await db.insert(milestones).values({
      ...base,
      projectId: proj.id,
      title: "Send proposal",
      dueDate: yesterday.toISOString().slice(0, 10),
    });

    const past = new Date();
    past.setDate(past.getDate() - 3);
    await db.insert(projects).values({
      ...base,
      lobId,
      title: "Blocked project",
      status: "waiting",
      waitingOn: "their signature",
      expectedUnblockDate: past.toISOString().slice(0, 10),
    });

    await db.insert(contacts).values({
      ...base,
      name: "Stale Friend",
      relationshipType: "friend",
      lastTouchAt: longAgo,
    });

    const cands = await gatherNudgeCandidates(FAKE_WORKSPACE_ID);
    const sigs = cands.map((c) => c.signature);
    expect(sigs.some((s) => s.startsWith("overdue:milestone:"))).toBe(true);
    expect(sigs.some((s) => s.startsWith("overdue:blocker:"))).toBe(true);
    expect(sigs.some((s) => s.startsWith("stale:friend:"))).toBe(true);
  });

  it("dedupes candidates already fired today", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const lobId = await makeLob("Dedupe LoB");
    const [proj] = await db
      .insert(projects)
      .values({ ...base, lobId, title: "P" })
      .returning();
    const [m] = await db
      .insert(milestones)
      .values({
        ...base,
        projectId: proj.id,
        title: "Overdue",
        dueDate: yesterday.toISOString().slice(0, 10),
      })
      .returning();

    const sig = `overdue:milestone:${m.id}`;
    await db.insert(nudges).values({
      workspaceId: FAKE_WORKSPACE_ID,
      forUserId: FAKE_USER_ID,
      signature: sig,
    });

    const cands = await gatherNudgeCandidates(FAKE_WORKSPACE_ID);
    const fresh = await filterDedupedCandidates(FAKE_USER_ID, cands);
    expect(fresh.find((c) => c.signature === sig)).toBeUndefined();
  });

  it("recordNudgesFired inserts new signatures", async () => {
    await recordNudgesFired({
      workspaceId: FAKE_WORKSPACE_ID,
      forUserId: FAKE_USER_ID,
      cands: [
        { signature: "stale:friend:abc", line: "x" },
        { signature: "stale:friend:def", line: "y" },
      ],
    });
    const rows = await db.select().from(nudges);
    expect(rows.map((r) => r.signature).sort()).toEqual([
      "stale:friend:abc",
      "stale:friend:def",
    ]);
  });
});
