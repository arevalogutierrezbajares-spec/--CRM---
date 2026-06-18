/**
 * Pure helpers for roadmap @-mention people-tags. No React / no DB imports, so
 * both the client bubble renderer and unit tests can use them directly.
 *
 * Mentions live inline in initiative titles as `@NameNoSpaces` tokens (the same
 * Model-A convention Town Hall uses). These helpers map tokens ⇄ workspace
 * members and strip tokens for compact displays.
 */

export type MentionMember = { userId: string; displayName: string };

// Same token shape the composer + `renderWithMentions` use.
export const MENTION_TOKEN_RE = /(@[\p{L}\d'’.-]+)/u;
export const MENTION_TOKEN_RE_G = /(@[\p{L}\d'’.-]+)/gu;

/** Index a member by the handle keys a token might use (spaceless full + first name). */
export function buildHandleIndex(
  members: MentionMember[],
): Map<string, MentionMember> {
  const idx = new Map<string, MentionMember>();
  for (const m of members) {
    const full = m.displayName.toLowerCase().replace(/\s+/g, "");
    const first = m.displayName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    // First match wins so an exact spaceless-full token isn't shadowed by a
    // colliding first name added later.
    if (full && !idx.has(full)) idx.set(full, m);
    if (first && !idx.has(first)) idx.set(first, m);
  }
  return idx;
}

/** Distinct members tagged in a title, in first-seen order. */
export function mentionedMembers(
  text: string,
  members: MentionMember[],
): MentionMember[] {
  const index = buildHandleIndex(members);
  const seen = new Set<string>();
  const out: MentionMember[] = [];
  for (const m of text.matchAll(MENTION_TOKEN_RE_G)) {
    const member = index.get(m[1].slice(1).toLowerCase());
    if (member && !seen.has(member.userId)) {
      seen.add(member.userId);
      out.push(member);
    }
  }
  return out;
}

/** The broadcast token `@all` (and synonyms) means "everyone on the team". */
const ALL_TOKENS = new Set(["all", "everyone", "team"]);

/** True if a token (with or without leading @) is the everyone/broadcast token. */
export function isAllToken(token: string): boolean {
  return ALL_TOKENS.has(token.replace(/^@/, "").toLowerCase());
}

/** True if the text contains an `@all` / `@everyone` / `@team` broadcast token. */
export function hasAllMention(text: string): boolean {
  for (const m of text.matchAll(MENTION_TOKEN_RE_G)) {
    if (isAllToken(m[1])) return true;
  }
  return false;
}

/**
 * Remove @tokens from a title for compact displays (e.g. timeline bars) where
 * bubbles are too heavy. Collapses the whitespace the token leaves behind.
 */
export function stripMentionTokens(text: string): string {
  return text
    .replace(MENTION_TOKEN_RE_G, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
