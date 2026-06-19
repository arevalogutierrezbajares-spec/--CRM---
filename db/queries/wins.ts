import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type WinTier = "w" | "W" | "DUB";

export type WinEventRow = {
  ts: string;
  day: string;
  tier: WinTier;
  source: string;
  label: string;
  value: number;
};

export type WinsDay = {
  day: string;
  commits: number;
  sessions: number;
  activeMin: number;
  tokens: number;
};

export type WinsWeek = {
  weekOf: string;
  totals: { w: number; W: number; DUB: number; all: number };
  days: WinsDay[];
  events: WinEventRow[];
};

/** The scored WINS data for a workspace's week (Monday key), or null if not ingested yet. */
export async function getWinsForWeek(workspaceId: string, weekOf: string): Promise<WinsWeek | null> {
  const [row] = await db
    .select({
      weekOf: schema.winsWeeks.weekOf,
      totals: schema.winsWeeks.totals,
      days: schema.winsWeeks.days,
      events: schema.winsWeeks.events,
    })
    .from(schema.winsWeeks)
    .where(and(eq(schema.winsWeeks.workspaceId, workspaceId), eq(schema.winsWeeks.weekOf, weekOf)))
    .limit(1);
  if (!row) return null;
  return { weekOf: row.weekOf, totals: row.totals, days: row.days, events: row.events };
}
