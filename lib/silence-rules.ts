/**
 * AGB-406 — silence rules.
 *
 * Operator/contact-level rules that suppress brain output. Centralized so any
 * brain endpoint can `if (isSilenced(...)) return;`.
 *
 * Rule sources today (cheap to evaluate, no DB schema change):
 *   - tag `personal-only` on a contact → never include in briefings
 *   - tag `ai-ok` on a contact → may pass content to LLMs (opt-in)
 *   - env `AGB_BRAIN_DISABLED=1` → kill switch for all brain output
 *   - env `AGB_BRAIN_QUIET_HOURS_TZ` + `AGB_BRAIN_QUIET_HOURS=22-7`
 *     → suppress notifications during these hours (local to the tz)
 */

import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";

const { contactTags, tags } = schema;

export function brainKillSwitch(): boolean {
  return process.env.AGB_BRAIN_DISABLED === "1";
}

export function inQuietHours(now: Date = new Date()): boolean {
  const range = process.env.AGB_BRAIN_QUIET_HOURS;
  if (!range) return false;
  const m = range.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  const tz = process.env.AGB_BRAIN_QUIET_HOURS_TZ ?? "UTC";
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(now),
    10,
  );
  if (start < end) return hour >= start && hour < end;
  // wraps midnight (e.g. 22-7)
  return hour >= start || hour < end;
}

export async function isContactSilenced(
  contactId: string,
): Promise<boolean> {
  const rows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(
      and(
        eq(contactTags.contactId, contactId),
        inArray(tags.name, ["personal-only"]),
      ),
    );
  return rows.length > 0;
}

export async function canShareWithAI(contactId: string): Promise<boolean> {
  if (brainKillSwitch()) return false;
  if (await isContactSilenced(contactId)) return false;
  // For now, AI calls are allowed unless explicitly silenced. A strict
  // opt-in mode (`ai-ok` required) can be enabled by setting
  // AGB_BRAIN_STRICT_OPTIN=1.
  if (process.env.AGB_BRAIN_STRICT_OPTIN === "1") {
    const rows = await db
      .select({ name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(
        and(eq(contactTags.contactId, contactId), eq(tags.name, "ai-ok")),
      );
    return rows.length > 0;
  }
  return true;
}
