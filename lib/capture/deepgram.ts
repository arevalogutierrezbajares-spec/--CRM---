/**
 * Dual-channel prerecorded transcription via Deepgram (FR-CALL-TRX-3/4,
 * FR-CALL-ATT-1). Channel 0 = founder/room mic, channel 1 = system/participants.
 *
 * For two-party *calls*, speaker attribution falls out of the channel index
 * (no ML diarization). For *in-person meetings* (mic-only room mix), optional
 * Deepgram `diarize=true` labels SPEAKER_0… within channel 0 — preferred path
 * is still free local WhisperX / whisper.cpp (see docs/LOCAL-DIARIZATION-PLAN.md).
 */
import "server-only";
import {
  FOUNDER_CHANNEL,
  FLAG_FOUNDER_SILENT,
  FLAG_PARTICIPANT_SILENT,
} from "./constants";

export type Utterance = {
  /**
   * Display / cluster id:
   * - "founder" | "participant" — dual-channel call sides
   * - "SPEAKER_00"… — diarization clusters (meeting or multi-person far side)
   */
  speaker: string;
  channel: number;
  start: number; // seconds
  end: number;
  text: string;
  /** Raw diarization cluster before human mapping (optional). */
  diarizationId?: string;
};

export type TranscriptionResult = {
  utterances: Utterance[];
  /** Time-ordered dialogue, e.g. "[00:12] Founder: …" — the searchable text. */
  dialogueText: string;
  language: string | null;
  suspectFlags: string[];
};

/** Map channel-based sides + optional diarization clusters → display names. */
export type DialogueLabels = {
  founder: string;
  participant: string;
  /** e.g. { SPEAKER_00: "Carlos", SPEAKER_01: "Ana" } */
  speakerMap?: Record<string, string>;
};

type DeepgramUtterance = {
  start?: number;
  end?: number;
  channel?: number;
  transcript?: string;
  speaker?: number;
};

function fmtTs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Resolve display label for one utterance.
 * Priority: speakerMap[diarizationId|speaker] → channel founder/participant
 * → raw speaker string.
 */
export function resolveSpeakerLabel(
  u: Utterance,
  labels: DialogueLabels,
): string {
  const map = labels.speakerMap ?? {};
  const key = u.diarizationId ?? u.speaker;
  if (map[key]) return map[key];
  if (u.speaker.startsWith("SPEAKER_") && map[u.speaker]) return map[u.speaker];

  // Dual-channel call sides (no diarization clusters).
  if (u.speaker === "founder" || (u.channel === FOUNDER_CHANNEL && !u.diarizationId)) {
    // Meeting diarization: keep SPEAKER_xx rather than collapsing to one "Room".
    if (u.speaker.startsWith("SPEAKER_")) return u.speaker;
    if (u.speaker === "founder") return labels.founder;
  }
  if (u.speaker === "participant") return labels.participant;
  if (u.speaker.startsWith("SPEAKER_")) return u.speaker;
  return u.channel === FOUNDER_CHANNEL ? labels.founder : labels.participant;
}

export function buildDialogue(
  utterances: Utterance[],
  labels: DialogueLabels,
): string {
  return utterances
    .map((u) => {
      const who = resolveSpeakerLabel(u, labels);
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
  opts?: { mixedAcoustic?: boolean },
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
    // Mixed-acoustic captures (in-person room, speakerphone) are mic-only:
    // the R channel is silent by design, so never flag it as suspect.
    if (suspicious(1) && !opts?.mixedAcoustic) {
      flags.push(FLAG_PARTICIPANT_SILENT);
    }
  }
  return flags;
}

function deepgramParams(opts?: { diarize?: boolean }): URLSearchParams {
  const p = new URLSearchParams({
    model: "nova-3",
    language: "multi",
    multichannel: "true",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    mip_opt_out: "true",
  });
  // Diarization within each channel. Required for mixed-acoustic captures,
  // where every speaker shares ch0 and channel identity carries no speaker
  // information at all.
  if (opts?.diarize) p.set("diarize", "true");
  return p;
}

function mapDeepgramSpeaker(
  u: DeepgramUtterance,
  opts?: { mixedAcoustic?: boolean; diarize?: boolean },
): { speaker: string; diarizationId?: string } {
  const ch = u.channel ?? 0;
  const hasDiarize =
    opts?.diarize && typeof u.speaker === "number" && Number.isFinite(u.speaker);

  if (hasDiarize) {
    const id = `SPEAKER_${String(u.speaker).padStart(2, "0")}`;
    // On calls, still prefix with side so founder channel clusters ≠ remote.
    if (!opts?.mixedAcoustic) {
      const side = ch === FOUNDER_CHANNEL ? "founder" : "participant";
      return { speaker: `${side}:${id}`, diarizationId: id };
    }
    return { speaker: id, diarizationId: id };
  }

  return {
    speaker: ch === FOUNDER_CHANNEL ? "founder" : "participant",
  };
}

function parseDeepgram(
  json: {
    results?: {
      utterances?: DeepgramUtterance[];
      channels?: { detected_language?: string }[];
    };
  } | null,
  durationSecs: number,
  opts?: { mixedAcoustic?: boolean; diarize?: boolean },
): { ok: true; result: TranscriptionResult } | { ok: false; error: string } {
  if (!json?.results) return { ok: false, error: "Deepgram: empty results" };
  const raw = Array.isArray(json.results.utterances) ? json.results.utterances : [];
  const utterances: Utterance[] = raw
    .filter((u) => (u.transcript ?? "").trim().length > 0)
    .map((u) => {
      const sp = mapDeepgramSpeaker(u, opts);
      return {
        speaker: sp.speaker,
        diarizationId: sp.diarizationId,
        channel: u.channel ?? 0,
        start: u.start ?? 0,
        end: u.end ?? u.start ?? 0,
        text: (u.transcript ?? "").trim(),
      };
    })
    .sort((a, b) => a.start - b.start);

  const labels: DialogueLabels = {
    founder: opts?.mixedAcoustic ? "Room" : "Founder",
    participant: "Participant",
  };

  return {
    ok: true,
    result: {
      utterances,
      dialogueText: buildDialogue(utterances, labels),
      language: json.results.channels?.[0]?.detected_language ?? "multi",
      suspectFlags: detectSilentChannels(utterances, durationSecs, opts),
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
  mixedAcoustic?: boolean;
  /** Enable speaker diarization (paid Deepgram). Prefer free local worker for meetings. */
  diarize?: boolean;
}): Promise<
  | { ok: true; result: TranscriptionResult }
  | { ok: false; error: string }
> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { ok: false, error: "DEEPGRAM_API_KEY not set" };
  // Mixed-acoustic captures default to diarize so multi-person mixes get
  // SPEAKER_xx labels when the free local worker is not used. Without it every
  // speaker collapses into a single channel-derived label.
  const diarize = opts.diarize ?? !!opts.mixedAcoustic;
  // Node undici is happier with a real Buffer body than a bare Uint8Array for
  // multi-MB POSTs (fewer flaky "fetch failed" / EPIPE on longish bodies).
  const body =
    typeof Buffer !== "undefined"
      ? Buffer.from(opts.wav.buffer, opts.wav.byteOffset, opts.wav.byteLength)
      : opts.wav;
  const url = `https://api.deepgram.com/v1/listen?${deepgramParams({ diarize })}`;
  // Transient TLS/EPIPE flakes on flaky networks — same class of failure the
  // Mac Helper sees on chunk upload. Retry a few times before failing finalize.
  const delaysMs = [0, 800, 2000, 5000];
  let lastError = "unknown";
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (delaysMs[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, delaysMs[attempt]));
    }
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
        body: body as unknown as BodyInit,
      });
    } catch (e) {
      lastError = `Deepgram unreachable: ${String(e)}`;
      continue;
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      // 5xx is worth retrying; 4xx (bad request / auth) is not.
      if (resp.status >= 500) {
        lastError = `Deepgram ${resp.status}: ${text.slice(0, 300)}`;
        continue;
      }
      return { ok: false, error: `Deepgram ${resp.status}: ${text.slice(0, 300)}` };
    }
    const json = (await resp.json().catch(() => null)) as Parameters<
      typeof parseDeepgram
    >[0];
    return parseDeepgram(json, opts.durationSecs, {
      mixedAcoustic: opts.mixedAcoustic,
      diarize,
    });
  }
  return { ok: false, error: lastError };
}

/**
 * Transcribe a dual-channel WAV that Deepgram fetches from `audioUrl`
 * (signed URL — keeps the audio out of this function's memory).
 */
export async function transcribeDualChannel(opts: {
  audioUrl: string;
  durationSecs: number;
  mixedAcoustic?: boolean;
  diarize?: boolean;
}): Promise<
  | { ok: true; result: TranscriptionResult }
  | { ok: false; error: string }
> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { ok: false, error: "DEEPGRAM_API_KEY not set" };
  const diarize = opts.diarize ?? !!opts.mixedAcoustic;

  let resp: Response;
  try {
    resp = await fetch(
      `https://api.deepgram.com/v1/listen?${deepgramParams({ diarize })}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: opts.audioUrl }),
      },
    );
  } catch (e) {
    return { ok: false, error: `Deepgram unreachable: ${String(e)}` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, error: `Deepgram ${resp.status}: ${body.slice(0, 300)}` };
  }

  const json = (await resp.json().catch(() => null)) as Parameters<typeof parseDeepgram>[0];
  return parseDeepgram(json, opts.durationSecs, {
    mixedAcoustic: opts.mixedAcoustic,
    diarize,
  });
}
