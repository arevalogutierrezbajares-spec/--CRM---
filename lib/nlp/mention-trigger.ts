/**
 * At-caret @/# trigger detection for the mention combobox. Shared by the Town
 * Hall composer and the Home quick-add inputs so the autocomplete behaves
 * identically everywhere.
 */

export type MentionTrigger =
  | { kind: "@"; query: string; start: number }
  | { kind: "#"; query: string; start: number }
  | null;

/**
 * Detect an in-progress @ or # token immediately left of the caret. Returns the
 * trigger kind, the query typed so far, and the index of the trigger char (so a
 * completion can be spliced in). Unicode-aware so accented names match.
 */
export function detectTrigger(text: string, caret: number): MentionTrigger {
  const upto = text.slice(0, caret);
  const m = upto.match(/(^|\s)([@#])([\p{L}\p{N}._-]*)$/u);
  if (!m) return null;
  const kind = m[2] as "@" | "#";
  const query = m[3] ?? "";
  const start = caret - query.length - 1; // index of the @ or #
  return { kind, query, start };
}

/**
 * Splice a chosen token in place of the in-progress trigger, leaving a trailing
 * space. Returns the new text and the caret position after the inserted token.
 */
export function spliceToken(
  text: string,
  start: number,
  caret: number,
  token: string,
): { next: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const next = `${before}${token} ${after}`;
  return { next, caret: before.length + token.length + 1 };
}
