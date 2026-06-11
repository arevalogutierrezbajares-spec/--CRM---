/**
 * Dual-channel prerecorded transcription via Deepgram (FR-CALL-TRX-3/4,
 * FR-CALL-ATT-1). Channel 0 = founder, channel 1 = participants — speaker
 * attribution falls out of the channel index, no diarization guesswork.
 */
import "server-only";
import {
  FOUNDER_CHANNEL,
  FLAG_FOUNDER_SILENT,
  FLAG_PARTICIPANT_SILENT,
} from "./constants";

export type Utterance = {
  speaker: string; // "founder" | "participant"
  channel: number;
  start: number; // seconds
  end: number;
  text: string;
};

export type TranscriptionResult = {
  utterances: Utterance[];
  /** Time-ordered dialogue, e.g. "[00:12] Founder: …" — the searchable text. */
  dialogueText: string;
  language: string | null;
  suspectFlags: string[];
};

type DeepgramUtterance = {
  start?: number;
  end?: number;
  channel?: number;
  transcript?: string;
};

function fmtTs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildDialogue(
  utterances: Utterance[],
  labels: { founder: string; participant: string },
): string {
  return utterances
    .map((u) => {
      const who = u.channel === FOUNDER_CHANNEL ? labels.founder : labels.participant;
      return `[${fmtTs(u.start)}] ${who}: ${u.text}`;
    })
    .join("\n");
}

/**
 * Near-silent channel detection (FR-CALL-OPS-4) from utterance coverage —
 * avoids re-downloading audio. A channel that spoke <2% of the call OR has no
 * utterances while the other side has several is suspect (muted mic /
 * mis-routed system audio).
 */
export function detectSilentChannels(
  utterances: Utterance[],
  durationSecs: number,
): string[] {
  const speech = [0, 0];
  const count = [0, 0];
  for (const u of utterances) {
    const ch = u.channel === FOUNDER_CHANNEL ? 0 : 1;
    speech[ch] += Math.max(0, u.end - u.start);
    count[ch] += 1;
  }
  const flags: string[] = [];
  const floor = Math.max(2, durationSecs * 0.02);
  const suspicious = (ch: number) =>
    count[ch] === 0 || (speech[ch] < floor && count[1 - ch] >= 3);
  if (durationSecs >= 20) {
    if (suspicious(0)) flags.push(FLAG_FOUNDER_SILENT);
    if (suspicious(1)) flags.push(FLAG_PARTICIPANT_SILENT);
  }
  return flags;
}

// nova-3 multichannel, ES/EN code-switching (FR-CALL-TRX-4), channel index =
// speaker. mip_opt_out belt-and-suspenders for NFR-CALL-SEC-3 (no-training is
// also an account-level posture — see docs/CALL-CAPTURE-PROTOCOL.md).
function deepgramParams(): URLSearchParams {
  return new URLSearchParams({
    model: "nova-3",
    language: "multi",
    multichannel: "true",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    mip_opt_out: "true",
  });
}

function parseDeepgram(
  json: {
    results?: {
      utterances?: DeepgramUtterance[];
      channels?: { detected_language?: string }[];
    };
  } | null,
  durationSecs: number,
): { ok: true; result: TranscriptionResult } | { ok: false; error: string } {
  if (!json?.results) return { ok: false, error: "Deepgram: empty results" };
  const raw = Array.isArray(json.results.utterances) ? json.results.utterances : [];
  const utterances: Utterance[] = raw
    .filter((u) => (u.transcript ?? "").trim().length > 0)
    .map((u) => ({
      speaker: (u.channel ?? 0) === FOUNDER_CHANNEL ? "founder" : "participant",
      channel: u.channel ?? 0,
      start: u.start ?? 0,
      end: u.end ?? u.start ?? 0,
      text: (u.transcript ?? "").trim(),
    }))
    .sort((a, b) => a.start - b.start);
  return {
    ok: true,
    result: {
      utterances,
      dialogueText: buildDialogue(utterances, {
        founder: "Founder",
        participant: "Participant",
      }),
      language: json.results.channels?.[0]?.detected_language ?? "multi",
      suspectFlags: detectSilentChannels(utterances, durationSecs),
    },
  };
}

/**
 * Transcribe a dual-channel WAV by POSTing the audio bytes directly to
 * Deepgram. Decouples transcription from object storage entirely — a 21-min
 * call is ~82 MB as raw WAV, which exceeds the storage object-size limit, but
 * Deepgram accepts it in the request body. This is the primary path.
 */
export async function transcribeDualChannelBytes(opts: {
  wav: Uint8Array;
  durationSecs: number;
}): Promise<
  | { ok: true; result: TranscriptionResult }
  | { ok: false; error: string }
> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { ok: false, error: "DEEPGRAM_API_KEY not set" };
  let resp: Response;
  try {
    resp = await fetch(`https://api.deepgram.com/v1/listen?${deepgramParams()}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
      // undici's fetch (Node/Vercel) accepts a Uint8Array body directly; the
      // DOM BodyInit type is just over-conservative about the buffer's origin.
      body: opts.wav as unknown as BodyInit,
    });
  } catch (e) {
    return { ok: false, error: `Deepgram unreachable: ${String(e)}` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, error: `Deepgram ${resp.status}: ${body.slice(0, 300)}` };
  }
  const json = (await resp.json().catch(() => null)) as Parameters<typeof parseDeepgram>[0];
  return parseDeepgram(json, opts.durationSecs);
}

/**
 * Transcribe a dual-channel WAV that Deepgram fetches from `audioUrl`
 * (signed URL — keeps the audio out of this function's memory).
 */
export async function transcribeDualChannel(opts: {
  audioUrl: string;
  durationSecs: number;
}): Promise<
  | { ok: true; result: TranscriptionResult }
  | { ok: false; error: string }
> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { ok: false, error: "DEEPGRAM_API_KEY not set" };

  let resp: Response;
  try {
    resp = await fetch(`https://api.deepgram.com/v1/listen?${deepgramParams()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: opts.audioUrl }),
    });
  } catch (e) {
    return { ok: false, error: `Deepgram unreachable: ${String(e)}` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, error: `Deepgram ${resp.status}: ${body.slice(0, 300)}` };
  }

  const json = (await resp.json().catch(() => null)) as Parameters<typeof parseDeepgram>[0];
  return parseDeepgram(json, opts.durationSecs);
}
