/**
 * ÑIGO greeting identities: the single source of truth for who gets greeted
 * how*. Drives two things:
 *   1. The spoken nickname the British/ÑIGO voice says ("Good morning, Sir Charles").
 *   2. The audio file slug → /greetings/{slug}-{period}.mp3.
 *
 * The generation script (scripts/gen-greetings.ts) reads GREETING_IDENTITIES ×
 * GREETING_PERIODS to render every clip; the home page maps the signed-in user
 * to one identity via greetingIdentity().
 */

export type GreetingPeriod = "morning" | "afternoon" | "evening";

export type GreetingSlug = "charles" | "joe" | "topg" | "agb" | "founder";

export type GreetingIdentity = {
  /** Stable file slug → /greetings/{slug}-{period}.mp3 */
  slug: GreetingSlug;
  /** What the voice says after "Good {period}, ". */
  spokenTitle: string;
};

export const GREETING_PERIODS: GreetingPeriod[] = ["morning", "afternoon", "evening"];

/** Every identity the ÑIGO voice can greet. `founder` is the generic fallback. */
export const GREETING_IDENTITIES: GreetingIdentity[] = [
  { slug: "charles", spokenTitle: "Sir Charles" },
  { slug: "joe", spokenTitle: "Master Joe" },
  { slug: "topg", spokenTitle: "Master Top G" },
  { slug: "agb", spokenTitle: "Don AGB" },
  { slug: "founder", spokenTitle: "Founder" },
];

/**
 * Map a signed-in teammate to their ÑIGO greeting identity. Mirrors the
 * `formalTitle()` matcher on the home page, but resolves the *spoken* nickname
 * + the audio slug. Falls back to the generic "Founder" clip.
 */
export function greetingIdentity(displayName: string, email: string): GreetingIdentity {
  const key = `${email.split("@")[0] ?? ""} ${displayName}`.toLowerCase();
  if (key.includes("tg.2000") || key.includes("tomas")) return { slug: "topg", spokenTitle: "Master Top G" };
  if (key.includes("charles")) return { slug: "charles", spokenTitle: "Sir Charles" };
  if (key.includes("jose") || key.includes("joe") || key.includes("ernesto")) return { slug: "joe", spokenTitle: "Master Joe" };
  if (key.includes("arevalo") || key.includes("agb")) return { slug: "agb", spokenTitle: "Don AGB" };
  return { slug: "founder", spokenTitle: "Founder" };
}

/** The exact line the voice speaks (and we could caption) for an identity + period. */
export function greetingLine(spokenTitle: string, period: GreetingPeriod): string {
  return `Good ${period}, ${spokenTitle}.`;
}

/** Public URL of the rendered clip for an identity + period. */
export function greetingAudioSrc(slug: GreetingSlug, period: GreetingPeriod): string {
  return `/greetings/${slug}-${period}.mp3`;
}
