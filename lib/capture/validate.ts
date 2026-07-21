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

/** Cap operator-flagged highlights so a helper can't DoS finalize. */
export const MAX_HIGHLIGHTS = 500;
export const MAX_HIGHLIGHT_NOTE_CHARS = 500;

export type Highlight = { tSecs: number; note: string | null };

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
    });
  }
  out.sort((a, b) => a.tSecs - b.tSecs);
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
