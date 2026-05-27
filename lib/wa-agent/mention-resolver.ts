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
  /** Organization the contact belongs to, if any. Helps the agent write
   *  context-rich replies without an extra contact_summary lookup. */
  org: string | null;
  /** lead | partner | prospect | friend — surfaces who this person IS so
   *  the agent doesn't ask "which Oscar?" or look up the relationship type. */
  rel: "friend" | "lead" | "partner" | "prospect";
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

  // Fetch all active workspace contacts (name + id + org + relationship).
  // Including org/rel lets the agent compose a context-rich reply without
  // a second contact_summary round-trip just for "Oscar Pietri (La Guaquira)".
  const allContacts = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      org: contacts.organization,
      rel: contacts.relationshipType,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.archived, false),
      ),
    )
    .limit(500);

  const matches: MentionMatch[] = [];

  // Build a token → contacts[] index so we know which tokens are unique to
  // a single contact (safe to match on alone) vs ambiguous across many.
  const tokenIndex = new Map<string, typeof allContacts>();
  for (const c of allContacts) {
    for (const t of nameTokens(c.name)) {
      const existing = tokenIndex.get(t) ?? [];
      existing.push(c);
      tokenIndex.set(t, existing);
    }
  }

  for (const c of allContacts) {
    const fullNameLower = c.name.toLowerCase();

    const base = { id: c.id, name: c.name, org: c.org, rel: c.rel };

    // Check for full name match first (strongest signal)
    if (body.includes(fullNameLower)) {
      matches.push({ ...base, matchedToken: c.name });
      continue;
    }

    const tokens = nameTokens(c.name);
    if (tokens.length === 0) continue;

    // All tokens present (matches "Juan Carlos Guinand" when message says
    // "juan carlos guinand" or any order)
    const allPresent = tokens.every((t) => body.includes(t));
    if (allPresent) {
      matches.push({ ...base, matchedToken: tokens.join(" ") });
      continue;
    }

    // Single-token match: only safe if the token is unique to ONE contact
    // in the workspace. Otherwise we'd mis-attribute "talked to Maria" when
    // there are 3 Marias.
    for (const t of tokens) {
      if (!body.includes(t)) continue;
      const owners = tokenIndex.get(t) ?? [];
      if (owners.length !== 1) continue; // ambiguous — let the agent disambiguate
      // Token must appear as a whole word, not as a substring of another word.
      const re = new RegExp(`(?<![a-zA-Z])${t}(?![a-zA-Z])`, "i");
      if (!re.test(body)) continue;
      matches.push({ ...base, matchedToken: t });
      break;
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
  // Compact: name(org)[rel]=id ; ... — keep it short so Claude reads it as
  // authoritative ground truth, not a "hint" to verify.
  const list = matches
    .map((m) => {
      const orgPart = m.org ? `(${m.org})` : "";
      return `${m.name}${orgPart}[${m.rel}]=${m.id}`;
    })
    .join(" ; ");
  return `\nRESOLVED: ${list}\n^ Treat as ground truth. Do NOT call find_contact/contact_summary for these.`;
}
