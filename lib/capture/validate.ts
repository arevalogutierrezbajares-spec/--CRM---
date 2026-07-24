/**
 * Path-param guards for capture routes. Non-UUID ids reaching a uuid-typed
 * column comparison throw a Postgres 500; validating first turns those into a
 * clean 404 (security/robustness finding).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * v1 chunks are 30 s each, so even a 12-hour call is ~1440 chunks. Cap finalize
 * at a generous ceiling so an unbounded totalChunks can't drive a
 * multi-billion-iteration loop / giant allocation (DoS finding).
 */
export const MAX_TOTAL_CHUNKS = 5000;

/** Cap precomputed local transcripts so a helper can't DoS finalize. */
export const MAX_PRECOMPUTED_UTTERANCES = 5000;
export const MAX_PRECOMPUTED_TEXT_CHARS = 8000;

// ── El Cuaderno: theme keys, agenda, live themes ─────────────────────────────

/** Cap agenda + theme lists so a helper can't DoS finalize. */
export const MAX_AGENDA = 24;
export const MAX_THEMES = 64;
export const MAX_THEME_LABEL_CHARS = 120;
export const MAX_THEME_KEY_CHARS = 48;

/** Slug rule (pinned wire format): lowercase a-z0-9 + hyphens, ≤48 chars. */
const THEME_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when a raw value is a valid theme key per the pinned slug rule. */
export function isValidThemeKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_THEME_KEY_CHARS &&
    THEME_KEY_RE.test(value)
  );
}

/**
 * Slugify a label into a theme key: strip diacritics, lowercase, collapse
 * non-alphanumerics into single hyphens, cap at 48. Returns null when nothing
 * sluggable survives (so the caller can drop the item, never throw).
 */
export function slugifyThemeLabel(label: string): string | null {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_THEME_KEY_CHARS)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : null;
}

export type AgendaItem = { key: string; label: string };
export type LiveTheme = { key: string; label: string; agenda: boolean };

/**
 * Shared agenda/theme item validation: label trimmed + capped; key = the
 * provided slug when valid, else slugified from the label; deduped by key
 * (first occurrence wins). Advisory — anything unusable is dropped, never
 * thrown.
 */
function parseThemeItems(raw: unknown, cap: number): { key: string; label: string; item: Record<string, unknown> }[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: { key: string; label: string; item: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, cap)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = (o.label == null ? "" : String(o.label))
      .trim()
      .slice(0, MAX_THEME_LABEL_CHARS);
    if (!label) continue;
    const key = isValidThemeKey(o.key) ? o.key : slugifyThemeLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, item: o });
  }
  return out;
}

/**
 * Validate the helper-supplied pre-call agenda. Advisory/never-throws; [] for
 * anything unusable. Deduped by key, capped at {@link MAX_AGENDA}.
 */
export function parseAgenda(raw: unknown): AgendaItem[] {
  return parseThemeItems(raw, MAX_AGENDA).map(({ key, label }) => ({ key, label }));
}

/**
 * Validate the helper-supplied live theme list (union of agenda-seeded +
 * live-created). Advisory/never-throws; [] for anything unusable. Deduped by
 * key, capped at {@link MAX_THEMES}.
 */
export function parseThemes(raw: unknown): LiveTheme[] {
  return parseThemeItems(raw, MAX_THEMES).map(({ key, label, item }) => ({
    key,
    label,
    agenda: item.agenda === true,
  }));
}

/**
 * Validate an optional marker themeKey: a valid slug passes through; anything
 * else (absent, malformed, wrong type) becomes null so the marker lands in
 * "unfiled" rather than failing the finalize.
 */
function parseThemeKey(value: unknown): string | null {
  return isValidThemeKey(value) ? value : null;
}

/** Cap operator-flagged highlights so a helper can't DoS finalize. */
export const MAX_HIGHLIGHTS = 500;
export const MAX_HIGHLIGHT_NOTE_CHARS = 500;

/** themeKey optional on the type (old helpers omit it); parse always sets it. */
export type Highlight = { tSecs: number; note: string | null; themeKey?: string | null };

/**
 * Validate helper-supplied "flagged moments". Returns [] for anything unusable
 * (never throws — highlights are advisory and must never fail a finalize).
 * Sorted by time so the brief lists them in call order.
 */
export function parseHighlights(raw: unknown): Highlight[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Highlight[] = [];
  for (const item of raw.slice(0, MAX_HIGHLIGHTS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const t = typeof o.tSecs === "number" ? o.tSecs : Number(o.tSecs);
    if (!Number.isFinite(t) || t < 0) continue;
    const rawNote = o.note == null ? "" : String(o.note).trim();
    out.push({
      tSecs: Math.min(t, 24 * 3600),
      note: rawNote ? rawNote.slice(0, MAX_HIGHLIGHT_NOTE_CHARS) : null,
      themeKey: parseThemeKey(o.themeKey),
    });
  }
  out.sort((a, b) => a.tSecs - b.tSecs);
  return out;
}

/** Cap operator-typed live notes so a helper can't DoS finalize. */
export const MAX_NOTES = 500;
export const MAX_NOTE_CHARS = 1000;
/** An anchor quote is throwaway context — cap it like the resolved quote. */
export const MAX_ANCHOR_QUOTE_CHARS = 200;

/**
 * Slice 2: an optional deliberate aim-point for a note. When present, quote
 * resolution re-quotes at {@link NoteAnchor.tSecs} instead of the note's own
 * tSecs. `quote` is the live text the operator was aiming at — advisory context
 * only; the resolver always re-quotes from the final utterances, never stores
 * this verbatim.
 */
export type NoteAnchor = { quote: string; tSecs: number };

/** themeKey optional on the type (old helpers omit it); parse always sets it. */
export type OperatorNote = {
  tSecs: number;
  text: string;
  themeKey?: string | null;
  /** Slice 2: optional aim-point; absent/invalid ⇒ null (note itself survives). */
  anchor?: NoteAnchor | null;
};

/**
 * Validate an optional note anchor: `tSecs` clamped to [0, 24h]; `quote`
 * trimmed + capped (may be empty). Anything without a usable tSecs → null, so a
 * malformed anchor never fails a finalize — the note simply resolves at its own
 * tSecs.
 */
function parseAnchor(value: unknown): NoteAnchor | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const t = typeof o.tSecs === "number" ? o.tSecs : Number(o.tSecs);
  if (!Number.isFinite(t) || t < 0) return null;
  const quote = (o.quote == null ? "" : String(o.quote))
    .trim()
    .slice(0, MAX_ANCHOR_QUOTE_CHARS);
  return { tSecs: Math.min(t, 24 * 3600), quote };
}

/**
 * Validate helper-supplied operator-typed live notes. Returns [] for anything
 * unusable (never throws — notes are advisory and must never fail a finalize).
 * Sorted by time so the brief lists them in call order.
 */
export function parseNotes(raw: unknown): OperatorNote[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: OperatorNote[] = [];
  for (const item of raw.slice(0, MAX_NOTES)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const t = typeof o.tSecs === "number" ? o.tSecs : Number(o.tSecs);
    if (!Number.isFinite(t) || t < 0) continue;
    const text = o.text == null ? "" : String(o.text).trim();
    if (!text) continue;
    const anchor = parseAnchor(o.anchor);
    out.push({
      tSecs: Math.min(t, 24 * 3600),
      text: text.slice(0, MAX_NOTE_CHARS),
      themeKey: parseThemeKey(o.themeKey),
      // Absent by default — only deliberate aim-points carry an anchor, so
      // unanchored notes keep their minimal (slice-1) shape.
      ...(anchor ? { anchor } : {}),
    });
  }
  out.sort((a, b) => a.tSecs - b.tSecs);
  return out;
}

// ── El Cuaderno Slice 2: coverage marks ──────────────────────────────────────

/** Cap coverage marks so a helper can't DoS finalize. */
export const MAX_COVERAGE = 64;

export type CoverageState = "touched" | "done";
export type CoverageMark = { key: string; state: CoverageState };

/**
 * Validate helper-supplied agenda coverage marks ("operator says this item is
 * touched/done"). Advisory/never-throws; [] for anything unusable. Keyed by a
 * valid theme slug, last-write-wins per key, capped at {@link MAX_COVERAGE}. A
 * `tSecs` may ride along on the wire but is not consumed here.
 */
export function parseCoverage(raw: unknown): CoverageMark[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const byKey = new Map<string, CoverageState>();
  for (const item of raw.slice(0, MAX_COVERAGE)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isValidThemeKey(o.key)) continue;
    if (o.state !== "touched" && o.state !== "done") continue;
    byKey.set(o.key, o.state); // last-write-wins per key
  }
  return [...byKey].map(([key, state]) => ({ key, state }));
}

/** Cap live transcription-term corrections so a helper can't DoS finalize. */
export const MAX_TERMS = 100;
export const MAX_TERM_CHARS = 80;

export type TermCorrection = { wrong: string | null; right: string };

/**
 * Validate helper-supplied transcription-term corrections ("heard X, it's Y").
 * `right` is required; `wrong` is optional (null = keyterm-prompt only, no
 * post-pass replacement). Deduped case-insensitively on (wrong, right).
 * Returns [] for anything unusable (never throws — terms are advisory and must
 * never fail a finalize).
 */
export function parseTerms(raw: unknown): TermCorrection[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: TermCorrection[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_TERMS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const right = o.right == null ? "" : String(o.right).trim().slice(0, MAX_TERM_CHARS);
    if (!right) continue;
    const rawWrong = o.wrong == null ? "" : String(o.wrong).trim().slice(0, MAX_TERM_CHARS);
    const wrong = rawWrong ? rawWrong : null;
    const key = `${(wrong ?? "").toLowerCase()} ${right.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ wrong, right });
  }
  return out;
}

export type PrecomputedUtteranceIn = {
  speaker?: unknown;
  diarizationId?: unknown;
  channel?: unknown;
  start?: unknown;
  end?: unknown;
  text?: unknown;
};

/**
 * Validate helper-supplied local STT/diarize payload. Returns null if unusable.
 */
export function parsePrecomputedTranscript(
  raw: unknown,
): {
  language: string | null;
  engine: string | null;
  utterances: {
    speaker: string;
    diarizationId?: string;
    channel: number;
    start: number;
    end: number;
    text: string;
  }[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.utterances) || o.utterances.length === 0) return null;
  if (o.utterances.length > MAX_PRECOMPUTED_UTTERANCES) return null;
  const utterances: {
    speaker: string;
    diarizationId?: string;
    channel: number;
    start: number;
    end: number;
    text: string;
  }[] = [];
  for (const item of o.utterances as PrecomputedUtteranceIn[]) {
    const text = String(item?.text ?? "").trim().slice(0, MAX_PRECOMPUTED_TEXT_CHARS);
    if (!text) continue;
    const speaker = String(item?.speaker ?? "SPEAKER_00").slice(0, 64);
    const diarizationId = item?.diarizationId
      ? String(item.diarizationId).slice(0, 64)
      : speaker.startsWith("SPEAKER_")
        ? speaker
        : undefined;
    utterances.push({
      speaker,
      diarizationId,
      channel: typeof item?.channel === "number" ? item.channel : 0,
      start: typeof item?.start === "number" ? item.start : 0,
      end: typeof item?.end === "number" ? item.end : 0,
      text,
    });
  }
  if (utterances.length === 0) return null;
  return {
    language: o.language != null ? String(o.language).slice(0, 32) : null,
    engine: o.engine != null ? String(o.engine).slice(0, 40) : null,
    utterances,
  };
}
