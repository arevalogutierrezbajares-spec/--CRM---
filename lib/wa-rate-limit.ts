/**
 * Per-sender sliding-window rate limit, backed by wa_activity.
 *
 * Defaults:
 *   - 30 messages per 60 seconds
 *   - 200 messages per 24 hours
 *
 * Tunable via env:
 *   - AGB_WA_RATE_PER_MIN (default 30)
 *   - AGB_WA_RATE_PER_DAY (default 200)
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { waActivity } = schema;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: "per_minute" | "per_day"; retryAfterSeconds: number };

export async function checkRateLimit(
  senderPhone: string,
): Promise<RateLimitVerdict> {
  const perMin = envInt("AGB_WA_RATE_PER_MIN", 30);
  const perDay = envInt("AGB_WA_RATE_PER_DAY", 200);

  const oneMinAgo = new Date(Date.now() - 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 86400 * 1000);
  const oneMinAgoIso = oneMinAgo.toISOString();

  const rows = await db
    .select({
      lastMin: sql<number>`coalesce(sum(case when ${waActivity.createdAt} >= ${oneMinAgoIso}::timestamptz then 1 else 0 end), 0)`,
      lastDay: sql<number>`count(*)`,
    })
    .from(waActivity)
    .where(
      and(
        eq(waActivity.senderPhone, senderPhone),
        eq(waActivity.direction, "in"),
        gte(waActivity.createdAt, oneDayAgo),
      ),
    );

  const lastMin = Number(rows[0]?.lastMin ?? 0);
  const lastDay = Number(rows[0]?.lastDay ?? 0);

  if (lastMin >= perMin) {
    return { allowed: false, reason: "per_minute", retryAfterSeconds: 60 };
  }
  if (lastDay >= perDay) {
    return {
      allowed: false,
      reason: "per_day",
      retryAfterSeconds: 60 * 60, // tell them to try in an hour
    };
  }
  return { allowed: true };
}
