import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { touches } = schema;

export type Reciprocity = {
  initiatedByMe: number;
  initiatedByThem: number;
  total: number;
  balance: "you-owe" | "they-owe" | "balanced" | "no-data";
  ratio: number; // 0..1; how much *they* drove the relationship
};

/**
 * AGB-205 — measure who's initiating contact.
 *
 * Heuristic for "they initiated":
 *   - channel = email           → likely inbound (email intake creates these)
 *   - channel = whatsapp        → also typically inbound when not /log'd
 *   - channel ∈ {manual, voice_memo, obsidian, meeting, call} → I initiated
 *
 * This is good enough for v1; a future enhancement would add a
 * `touches.direction` enum ('outbound' | 'inbound').
 */
export async function reciprocityFor(opts: {
  ownerId: string;
  contactId: string;
}): Promise<Reciprocity> {
  const rows = await db
    .select({ channel: touches.channel, createdBy: touches.createdBy })
    .from(touches)
    .where(eq(touches.contactId, opts.contactId));

  let me = 0;
  let them = 0;
  for (const t of rows) {
    if (t.channel === "email" || t.channel === "whatsapp") them++;
    else me++;
  }
  const total = me + them;
  if (total === 0) {
    return {
      initiatedByMe: 0,
      initiatedByThem: 0,
      total: 0,
      balance: "no-data",
      ratio: 0,
    };
  }
  const ratio = them / total;
  // Balance: "they owe" means you've been driving heavily; "you owe" means
  // they have. Threshold at 30/70.
  let balance: Reciprocity["balance"];
  if (ratio < 0.3) balance = "they-owe";
  else if (ratio > 0.7) balance = "you-owe";
  else balance = "balanced";

  return { initiatedByMe: me, initiatedByThem: them, total, balance, ratio };
}
