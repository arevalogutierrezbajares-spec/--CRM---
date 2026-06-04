/**
 * Canonical mention/ref token format, shared by the combobox (insert), the
 * composer (submit filter) and the quick-add cards (pick reconciliation) so the
 * three can never drift. Tokens are whitespace-stripped — both so a multi-word
 * name/project/doc round-trips through `detectTrigger` (which stops at spaces)
 * and so `parseCapture`'s strip regex removes the whole token from the title
 * (no "Revenue Push" tail leaking into the saved item).
 */

export function personToken(displayName: string): string {
  return `@${displayName.replace(/\s+/g, "")}`;
}

export function refToken(kind: "@" | "#", label: string): string {
  return `${kind}${label.replace(/\s+/g, "")}`;
}

/** Is this person's token still literally present in the body text? */
export function personInBody(body: string, displayName: string): boolean {
  return body.toLowerCase().includes(personToken(displayName).toLowerCase());
}

/** Is this ref's token still literally present in the body text? */
export function refInBody(body: string, kind: "@" | "#", label: string): boolean {
  return body.toLowerCase().includes(refToken(kind, label).toLowerCase());
}
