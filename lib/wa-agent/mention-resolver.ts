/**
 * Mention pre-resolver: runs before the LLM call to identify workspace
 * contacts whose names appear in the inbound message.
 *
 * Why: The agent frequently needs to call find_contact to resolve a name to
 * an ID. If we surface the ID *before* the LLM runs, we save one round-trip
 * and prevent hallucinated UUIDs.
 *
 * Algorithm:
 *  1. Fetch all non-archived contacts for the workspace (name + id).
 *  2. For each contact, check if the inbound text contains the full name or
 *     a significant part of it (first + last name both present, or a single
 *     unique name token ≥ 5 chars).
 *  3. Return matches as { id, name, matchedToken }.
 *
 * The caller (loop.ts) injects the matches into the system prompt so the
 * agent knows the IDs without calling find_contact.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts } = schema;

export type MentionMatch = {
  id: string;
  name: string;
  matchedToken: string;
};

/**
 * Tokenise a contact name into searchable parts.
 * Returns tokens with length ≥ 4 to avoid false positives on short words.
 */
function nameTokens(name: string): string[] {
  return name
    .split(/[\s,.\-]+/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 4);
}

/**
 * Resolve contact mentions in `messageBody` for the given workspace.
 * Returns up to 10 matches, ordered by match strength (full name > partial).
 */
export async function resolveMentions(
  workspaceId: string,
  messageBody: string,
): Promise<MentionMatch[]> {
  const body = messageBody.toLowerCase();

  // Fetch all active workspace contacts (name + id only — small payload)
  const allContacts = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.archived, false),
      ),
    )
    .limit(500);

  const matches: MentionMatch[] = [];

  for (const c of allContacts) {
    const fullNameLower = c.name.toLowerCase();

    // Check for full name match first (strongest signal)
    if (body.includes(fullNameLower)) {
      matches.push({ id: c.id, name: c.name, matchedToken: c.name });
      continue;
    }

    // Check for significant partial matches (all tokens present)
    const tokens = nameTokens(c.name);
    if (tokens.length === 0) continue;

    const allPresent = tokens.every((t) => body.includes(t));
    if (allPresent) {
      matches.push({ id: c.id, name: c.name, matchedToken: tokens.join(" ") });
      continue;
    }

    // For single-token names (nicknames, companies), accept a direct match
    // only if the token is ≥ 6 chars (reduces false positives)
    if (tokens.length === 1 && tokens[0].length >= 6) {
      const token = tokens[0];
      // Use word-boundary-style check: token must appear with non-alpha around it
      const re = new RegExp(`(?<![a-z])${token}(?![a-z])`, "i");
      if (re.test(body)) {
        matches.push({ id: c.id, name: c.name, matchedToken: token });
      }
    }
  }

  // Deduplicate by contact ID (shouldn't happen, but be safe)
  const seen = new Set<string>();
  const deduped = matches.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return deduped.slice(0, 10);
}

/**
 * Build the "known entities" system prompt supplement from resolved mentions.
 * Returns an empty string if there are no matches.
 */
export function mentionSupplementLine(matches: MentionMatch[]): string {
  if (matches.length === 0) return "";
  const list = matches
    .map((m) => `"${m.name}" (contact_id: ${m.id})`)
    .join(", ");
  return `\nKNOWN ENTITIES IN THIS MESSAGE: ${list}. Use these IDs directly without calling find_contact.`;
}
