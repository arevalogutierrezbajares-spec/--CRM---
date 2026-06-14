import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts } = schema;

/** Matches the nudge cron's stale notion (STALE_THRESHOLD_DAYS = 60). */
export const RECONNECT_THRESHOLD_DAYS = 60;

export type ReconnectCandidate = {
  id: string;
  name: string;
  organization: string | null;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  lastTouchAt: Date | null;
  daysSince: number | null;
};

/**
 * Warm-network contacts (friends + partners) who have gone cold — no touch in
 * RECONNECT_THRESHOLD_DAYS, or never touched. Coldest first (never-touched lead
 * the list). Leads/prospects are deliberately excluded: those are active
 * pipeline, not lapsed relationships to rekindle.
 */
export async function listReconnectCandidates(
  workspaceId: string,
): Promise<ReconnectCandidate[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - RECONNECT_THRESHOLD_DAYS);

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      organization: contacts.organization,
      relationshipType: contacts.relationshipType,
      lastTouchAt: contacts.lastTouchAt,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.archived, false),
        inArray(contacts.relationshipType, ["friend", "partner"]),
        or(isNull(contacts.lastTouchAt), lt(contacts.lastTouchAt, threshold)),
      ),
    )
    .orderBy(sql`${contacts.lastTouchAt} asc nulls first`)
    .limit(30);

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    organization: r.organization,
    relationshipType: r.relationshipType,
    lastTouchAt: r.lastTouchAt,
    daysSince: r.lastTouchAt
      ? Math.floor((now - r.lastTouchAt.getTime()) / 86400000)
      : null,
  }));
}
