/**
 * FR-DOC-2 — pure URL → category heuristic.
 * Pre-populates the category dropdown when a URL is pasted. User can always
 * override; this never overrides an explicit selection. Unit-tested in
 * __tests__/unit/project-links-detect.test.ts.
 */

export type LinkCategory =
  | "business"
  | "marketing"
  | "tech"
  | "ops"
  | "design"
  | "finance"
  | "other";

/** Patterns are tested in order; first match wins. */
const PATTERNS: Array<[RegExp, LinkCategory]> = [
  // Business — productivity / docs / decks
  [/(^|\.)docs\.google\.com$/i, "business"],
  [/(^|\.)drive\.google\.com$/i, "business"],
  [/(^|\.)sheets\.google\.com$/i, "business"],
  [/(^|\.)slides\.google\.com$/i, "business"],
  [/(^|\.)onedrive\.live\.com$/i, "business"],
  [/(^|\.)sharepoint\.com$/i, "business"],
  [/(^|\.)office\.com$/i, "business"],
  [/(^|\.)office365\.com$/i, "business"],

  // Design
  [/(^|\.)figma\.com$/i, "design"],
  [/(^|\.)canva\.com$/i, "design"],
  [/(^|\.)miro\.com$/i, "design"],
  [/(^|\.)sketch\.com$/i, "design"],
  [/(^|\.)framer\.com$/i, "design"],

  // Tech — code + deploys
  [/(^|\.)github\.com$/i, "tech"],
  [/(^|\.)gitlab\.com$/i, "tech"],
  [/(^|\.)bitbucket\.org$/i, "tech"],
  [/(^|\.)vercel\.app$/i, "tech"],
  [/(^|\.)vercel\.com$/i, "tech"],
  [/(^|\.)netlify\.app$/i, "tech"],
  [/(^|\.)cloudflare\.com$/i, "tech"],
  [/(^|\.)supabase\.co$/i, "tech"],
  [/(^|\.)supabase\.com$/i, "tech"],
  [/(^|\.)npmjs\.com$/i, "tech"],
  [/(^|\.)docker\.com$/i, "tech"],
  [/(^|\.)linear\.app$/i, "tech"],

  // Ops — wikis, project tracking, scheduling
  [/(^|\.)notion\.so$/i, "ops"],
  [/(^|\.)notion\.site$/i, "ops"],
  [/(^|\.)coda\.io$/i, "ops"],
  [/(^|\.)dropboxpaper\.com$/i, "ops"],
  [/(^|\.)paper\.dropbox\.com$/i, "ops"],
  [/(^|\.)airtable\.com$/i, "ops"],
  [/(^|\.)clickup\.com$/i, "ops"],
  [/(^|\.)asana\.com$/i, "ops"],
  [/(^|\.)monday\.com$/i, "ops"],
  [/(^|\.)trello\.com$/i, "ops"],
  [/(^|\.)calendly\.com$/i, "ops"],

  // Finance
  [/(^|\.)stripe\.com$/i, "finance"],
  [/(^|\.)quickbooks\.intuit\.com$/i, "finance"],
  [/(^|\.)xero\.com$/i, "finance"],
  [/(^|\.)mercury\.com$/i, "finance"],
  [/(^|\.)brex\.com$/i, "finance"],
  [/(^|\.)ramp\.com$/i, "finance"],

  // Marketing — social + analytics
  [/(^|\.)instagram\.com$/i, "marketing"],
  [/(^|\.)tiktok\.com$/i, "marketing"],
  [/(^|\.)youtube\.com$/i, "marketing"],
  [/(^|\.)youtu\.be$/i, "marketing"],
  [/(^|\.)twitter\.com$/i, "marketing"],
  [/(^|\.)x\.com$/i, "marketing"],
  [/(^|\.)linkedin\.com$/i, "marketing"],
  [/(^|\.)facebook\.com$/i, "marketing"],
  [/(^|\.)threads\.net$/i, "marketing"],
  [/(^|\.)pinterest\.com$/i, "marketing"],
  [/(^|\.)mailchimp\.com$/i, "marketing"],
  [/(^|\.)hubspot\.com$/i, "marketing"],
];

export function detectCategory(url: string): LinkCategory {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  for (const [pattern, cat] of PATTERNS) {
    if (pattern.test(host)) return cat;
  }
  return "other";
}
