/**
 * Pure logic for the nudge cron — separated from the Next route so tests can
 * import without dragging in route runtime + middleware.
 */

import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  listDueThisWeek,
  listBlockedProjects,
  listStaleFriends,
} from "@/db/queries/this-week";

const { nudges } = schema;

export type NudgeCandidate = { signature: string; line: string };

export async function gatherNudgeCandidates(
  ownerId: string,
): Promise<NudgeCandidate[]> {
  const [due, blocked, stale] = await Promise.all([
    listDueThisWeek(ownerId),
    listBlockedProjects(ownerId),
    listStaleFriends(ownerId),
  ]);

  const cands: NudgeCandidate[] = [];
  for (const d of due.filter((x) => x.isOverdue).slice(0, 5)) {
    cands.push({
      signature: `overdue:milestone:${d.milestoneId}`,
      line: `${d.title} (${d.projectTitle}) was due ${d.dueDate} — still open.`,
    });
  }
  for (const b of blocked.filter((x) => x.isOverdue).slice(0, 5)) {
    cands.push({
      signature: `overdue:blocker:${b.id}`,
      line: `${b.title} is waiting on "${b.waitingOn}" past expected unblock.`,
    });
  }
  for (const s of stale.slice(0, 5)) {
    cands.push({
      signature: `stale:friend:${s.id}`,
      line: `Last touch with ${s.name} was ${s.daysSince ?? "never"} day(s) ago.`,
    });
  }
  return cands;
}

export async function filterDedupedCandidates(
  ownerId: string,
  cands: NudgeCandidate[],
): Promise<NudgeCandidate[]> {
  if (cands.length === 0) return [];
  // "Today" as a UTC day boundary; matches the partial index suggested in the
  // schema doc (date_trunc('day', fired_at)) closely enough for dedup.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const recent = await db
    .select({ signature: nudges.signature })
    .from(nudges)
    .where(and(eq(nudges.ownerId, ownerId), gte(nudges.firedAt, since)));
  const seen = new Set(recent.map((r) => r.signature));
  return cands.filter((c) => !seen.has(c.signature));
}

export async function recordNudgesFired(
  ownerId: string,
  cands: NudgeCandidate[],
) {
  if (cands.length === 0) return;
  await db
    .insert(nudges)
    .values(cands.map((c) => ({ ownerId, signature: c.signature })))
    .onConflictDoNothing();
}
