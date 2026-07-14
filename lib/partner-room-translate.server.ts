import "server-only";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { claudeChat } from "@/lib/anthropic";
import {
  resolveRoomLocale,
  roomLocaleMeta,
  roomAutoTranslates,
} from "@/lib/partner-room-i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Machine translation for operator-authored room content.
//
// Operators write welcome messages, next steps, doc labels, and chat in Spanish
// or English. When a room's guest locale is a CLIENT-ONLY language (pt/ru/ar),
// that content is translated once via Claude and cached in
// partner_room_translations, keyed by a hash of the source text + target
// locale. es/en rooms render content as authored (roomAutoTranslates === false).
//
// Failure is always graceful: if the API key is missing, the model errors, or
// anything throws, we return the ORIGINAL text. A guest never sees an error or a
// blank — worst case they see the operator's original language.
// ─────────────────────────────────────────────────────────────────────────────

/** sha256 (hex) of the normalized source text — the content-addressed cache key. */
function hashText(text: string): string {
  return createHash("sha256").update(text.normalize("NFC")).digest("hex");
}

function systemPrompt(targetLanguageName: string): string {
  return [
    `You are a professional translator for a premium executive-protection and`,
    `secure-transport brand. Translate the user's text into ${targetLanguageName}.`,
    `Register: formal, discreet, trustworthy — suitable for high-net-worth and`,
    `diplomatic clients. Preserve meaning, names, numbers, URLs, and line breaks.`,
    `Do NOT add notes, quotes, or explanations. Output ONLY the translation.`,
  ].join(" ");
}

export type LocalizedText = {
  /** What the guest should see (translated when applicable, else the original). */
  display: string;
  /** The operator's original text, for a "show original" affordance. */
  original: string;
  /** True only when `display` is a machine translation distinct from `original`. */
  isTranslated: boolean;
};

/**
 * Translate one piece of operator content for a room's guest locale, using the
 * persistent cache. Returns the display string (original when the locale is
 * es/en, when text is empty, or on any failure).
 */
export async function translateForRoom(
  text: string | null | undefined,
  targetLocale: string | null | undefined,
  opts?: { sourceLang?: string | null; workspaceId?: string | null },
): Promise<string> {
  const raw = (text ?? "").trim();
  if (!raw) return text ?? "";

  const locale = resolveRoomLocale(targetLocale);
  if (!roomAutoTranslates(locale)) return text ?? ""; // es/en → as authored

  const sourceHash = hashText(raw);

  // Cache hit?
  try {
    const [hit] = await db
      .select({ t: schema.partnerRoomTranslations.translatedText })
      .from(schema.partnerRoomTranslations)
      .where(
        and(
          eq(schema.partnerRoomTranslations.sourceHash, sourceHash),
          eq(schema.partnerRoomTranslations.targetLocale, locale),
        ),
      )
      .limit(1);
    if (hit?.t) return hit.t;
  } catch {
    // Cache read failure is non-fatal — fall through to a live translation.
  }

  // Live translation.
  const res = await claudeChat({
    system: systemPrompt(roomLocaleMeta(locale).englishName),
    prompt: raw,
    maxTokens: Math.min(4096, Math.ceil(raw.length / 2) + 256),
  });
  if (!res.ok) return text ?? ""; // graceful fallback to the original

  const translated = res.text.trim();
  if (!translated) return text ?? "";

  // Cache it (ignore races — another request may have inserted the same key).
  try {
    await db
      .insert(schema.partnerRoomTranslations)
      .values({
        sourceHash,
        targetLocale: locale,
        sourceLang: opts?.sourceLang ?? null,
        sourceText: raw,
        translatedText: translated,
        workspaceId: opts?.workspaceId ?? null,
      })
      .onConflictDoNothing();
  } catch {
    // A failed cache write still returns a valid translation.
  }

  return translated;
}

/** Like translateForRoom, but returns original + translated for a toggle. */
export async function localizeForRoom(
  text: string | null | undefined,
  targetLocale: string | null | undefined,
  opts?: { sourceLang?: string | null; workspaceId?: string | null },
): Promise<LocalizedText> {
  const original = text ?? "";
  const display = await translateForRoom(text, targetLocale, opts);
  return { display, original, isTranslated: display !== original && original !== "" };
}

/**
 * Batch variant — translates many strings concurrently, each cached
 * independently. Order-preserving. Empty/whitespace entries pass through.
 */
export async function translateManyForRoom(
  texts: Array<string | null | undefined>,
  targetLocale: string | null | undefined,
  opts?: { sourceLang?: string | null; workspaceId?: string | null },
): Promise<string[]> {
  const locale = resolveRoomLocale(targetLocale);
  if (!roomAutoTranslates(locale)) return texts.map((t) => t ?? "");
  return Promise.all(texts.map((t) => translateForRoom(t, locale, opts)));
}
