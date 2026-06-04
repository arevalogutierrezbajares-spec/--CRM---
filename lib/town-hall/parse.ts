/**
 * Town Hall composer payload parsing — shared by the server action and the
 * client composer. The client builds an explicit token list (from the @/#
 * autocomplete), but we ALSO re-parse the raw body server-side as a fallback /
 * defense so a hand-typed @name or #ref still resolves.
 *
 * Plain module (no "use server") so it can export non-async helpers/types that
 * both the action layer and the client import.
 */

export type RefType =
  | "action_item"
  | "milestone"
  | "meeting"
  | "project"
  | "doc";

export const REF_TYPES: RefType[] = [
  "action_item",
  "milestone",
  "meeting",
  "project",
  "doc",
];

/**
 * A "token" the composer attached: an @mention resolved to a user id, or a
 * #reference resolved to an object. `text` is the literal that appears in the
 * body (without the leading @/#) so we can also locate it by scanning.
 */
export type ComposerMention = { userId: string; text: string };
export type ComposerRef = {
  refType: RefType;
  refId: string;
  label: string;
};

export type ComposerPayload = {
  body: string;
  kind: "message" | "note";
  mentions: ComposerMention[];
  refs: ComposerRef[];
};

/**
 * Pull bare @handles out of free text. A handle is the run of word chars (plus
 * `.` `_` `-`) right after an `@`. Used to resolve hand-typed mentions against
 * workspace members when the composer didn't attach an explicit token.
 */
export function extractMentionHandles(body: string): string[] {
  const out: string[] = [];
  const re = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9._-]{1,64})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[2].toLowerCase());
  }
  return Array.from(new Set(out));
}

/** Normalize a display name → comparable handle (lowercased, no spaces). */
export function handleFromName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

/** Short single-line snippet of a post body for notifications / DMs. */
export function snippet(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function isRefType(v: unknown): v is RefType {
  return typeof v === "string" && (REF_TYPES as string[]).includes(v);
}
