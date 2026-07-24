/**
 * Finalize pipeline core: chunks → assembled WAV → dual-channel transcription
 * → attributed dialogue → durable recording row → AI filing → chunk cleanup.
 * Shared by the finalize route (helper-driven) and the cron crash-salvage
 * sweep (FR-CALL-OPS-5) so a crashed call files exactly like a clean one.
 */
import "server-only";
import {
  getCaptureSession,
  updateCaptureSession,
  getWorkspaceCaptureSettings,
  type CaptureSessionRow,
} from "@/db/queries/capture-sessions";
import { createCallRecording } from "@/db/queries/call-recordings";
import {
  listSessionChunks,
  putObject,
  removeObjects,
  type ChunkEntry,
} from "./storage";
import { assembleSessionAudio } from "./assemble";
import {
  assembledObjectPath,
  assembledMp3ObjectPath,
  chunkObjectPath,
  CAPTURE_SAMPLE_RATE,
  CAPTURE_CHANNELS,
  WAV_HEADER_BYTES,
  TRANSCRIBE_WINDOW_BYTES,
  STORE_AUDIO_MAX_BYTES,
  MAX_HIGHLIGHT_MATCH_GAP_SECS,
  isInPersonMeetingSource,
  isMixedAcousticSource,
} from "./constants";
import { Mp3StreamEncoder, estimatedMp3Bytes } from "./mp3";
import {
  transcribeDualChannelBytes,
  buildDialogue,
  detectSilentChannels,
  type Utterance,
  type TranscriptionResult,
} from "./deepgram";
import {
  fileCallTranscript,
  runThemeLibrarian,
  runCallAudit,
  shouldRunAudit,
  type FileCallResult,
} from "./file-call";
import {
  buildThemedDoc,
  facetsFromThemedDoc,
  renderThemedBrief,
  type ThemedDoc,
} from "./themed-doc";
import {
  replaceCallThemeFacets,
  updateCallRecording,
} from "@/db/queries/call-recordings";
import type {
  AgendaItem,
  CoverageMark,
  Highlight,
  LiveTheme,
  OperatorNote,
  TermCorrection,
} from "./validate";

/** A highlight resolved to the words spoken at that moment. */
export type FlaggedMoment = {
  atSec: number;
  quote: string;
  note: string | null;
  /** El Cuaderno: operator's live #theme tag (validated); null = unfiled. */
  themeKey: string | null;
};

/** An operator-typed live note resolved to the words spoken at that moment. */
export type ResolvedOperatorNote = {
  atSec: number;
  quote: string;
  note: string;
  /** El Cuaderno: operator's live #theme tag (validated); null = unfiled. */
  themeKey: string | null;
};

// The marker↔utterance matching gap lives in constants.ts (dependency-free, so
// the pure themed-doc module shares the exact rule). Re-exported here because
// callers already import it from this module.
export { MAX_HIGHLIGHT_MATCH_GAP_SECS } from "./constants";

/**
 * The words spoken at a given moment: the utterance covering that time (or the
 * nearest one within {@link MAX_HIGHLIGHT_MATCH_GAP_SECS}). Returns "" when the
 * transcript is empty or the moment lands too far from any real audio — a
 * distant nearest-match means the backing audio is gone, so don't misquote it.
 * Shared by highlight and live-note resolution so both quote identically.
 */
function quoteAt(tSecs: number, utterances: Utterance[]): string {
  if (utterances.length === 0) return "";
  let best = utterances[0];
  let bestDist = Infinity;
  for (const u of utterances) {
    const dist =
      tSecs >= u.start && tSecs <= u.end
        ? 0
        : Math.min(Math.abs(u.start - tSecs), Math.abs(u.end - tSecs));
    if (dist < bestDist) {
      bestDist = dist;
      best = u;
      if (dist === 0) break;
    }
  }
  return bestDist <= MAX_HIGHLIGHT_MATCH_GAP_SECS
    ? best.text.trim().slice(0, 200)
    : "";
}

/**
 * Map each operator-flagged moment onto the transcript: the utterance covering
 * that time (or the nearest one within {@link MAX_HIGHLIGHT_MATCH_GAP_SECS})
 * supplies the quoted words, so the brief can show what was actually said — not
 * just a timestamp. Robust to empty transcripts and dropped audio (quote = "").
 */
export function resolveHighlights(
  highlights: Highlight[],
  utterances: Utterance[],
): FlaggedMoment[] {
  if (highlights.length === 0) return [];
  return highlights.map((h) => ({
    atSec: h.tSecs,
    quote: quoteAt(h.tSecs, utterances),
    note: h.note,
    themeKey: h.themeKey ?? null,
  }));
}

/**
 * Map each operator-typed live note onto the transcript, exactly like
 * {@link resolveHighlights}: the same nearest-utterance quote (with the same
 * {@link MAX_HIGHLIGHT_MATCH_GAP_SECS} guard) shows what was being said as the
 * operator typed. The note text itself is always kept verbatim.
 *
 * Slice 2: when a note carries an `anchor`, the operator deliberately aimed at
 * anchor.tSecs — resolve the quote there and display that as the atSec. The
 * anchor's own `quote` is advisory context only and is never stored verbatim;
 * we always re-quote from the final utterances.
 */
export function resolveNotes(
  notes: OperatorNote[],
  utterances: Utterance[],
): ResolvedOperatorNote[] {
  if (notes.length === 0) return [];
  return notes.map((n) => {
    const atSec = n.anchor ? n.anchor.tSecs : n.tSecs;
    return {
      atSec,
      quote: quoteAt(atSec, utterances),
      note: n.text,
      themeKey: n.themeKey ?? null,
    };
  });
}

/** Escape a literal string for embedding in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply live glossary corrections to a transcript: for each term with a
 * non-empty `wrong`, replace case-insensitive WHOLE-WORD occurrences of
 * `wrong` (possibly multi-word) with `right` in every utterance's text.
 * Unicode-aware boundaries (lookarounds on letters/digits/_) so accented
 * Spanish terms correct cleanly and partial words ("art" in "start") never
 * mangle. Pure: returns corrected copies + a replacement count; the input
 * array is never mutated.
 */
export function applyTermCorrections(
  utterances: Utterance[],
  terms: TermCorrection[],
): { utterances: Utterance[]; replacements: number } {
  const rules: { re: RegExp; right: string }[] = [];
  for (const t of terms) {
    const wrong = (t.wrong ?? "").trim();
    if (!wrong || !t.right) continue;
    try {
      rules.push({
        re: new RegExp(
          `(?<![\\p{L}\\p{N}_])${escapeRegExp(wrong)}(?![\\p{L}\\p{N}_])`,
          "giu",
        ),
        right: t.right,
      });
    } catch {
      // Advisory: an unbuildable pattern must never fail a finalize.
    }
  }
  if (rules.length === 0 || utterances.length === 0) {
    return { utterances, replacements: 0 };
  }
  let replacements = 0;
  const corrected = utterances.map((u) => {
    let text = u.text;
    for (const { re, right } of rules) {
      // Function replacer: `right` is literal text, never a $-pattern.
      text = text.replace(re, () => {
        replacements++;
        return right;
      });
    }
    return text === u.text ? u : { ...u, text };
  });
  return { utterances: corrected, replacements };
}

/**
 * Memory-bounded transcription for long calls: group chunks into windows of
 * ≤ TRANSCRIBE_WINDOW_BYTES, assemble + transcribe each window on its own, and
 * stitch the utterances back together with cumulative time offsets. Peak RAM is
 * one window (~32 MB), never the whole call — so finalize cannot OOM no matter
 * how long the call ran. Channel-indexed attribution is preserved across
 * windows; only an utterance straddling a 30 s chunk boundary could split, a
 * negligible cosmetic effect on the dialogue.
 */
export async function transcribeWindowed(
  chunks: ChunkEntry[],
  fmt: { sampleRate: number; channels: number },
  opts: { encodeMp3?: boolean; mixedAcoustic?: boolean; keyterms?: string[] } = {},
): Promise<
  | { ok: true; result: TranscriptionResult; durationSecs: number; mp3: Uint8Array | null }
  | { ok: false; status: number; error: string }
> {
  // Size estimate per chunk for windowing decisions — when the storage listing
  // didn't populate sizes (size 0), assume a nominal 2 MB so windows stay
  // bounded by count instead of collapsing into one giant window.
  const NOMINAL_CHUNK_BYTES = 2 * 1024 * 1024;
  const windows: ChunkEntry[][] = [];
  let cur: ChunkEntry[] = [];
  let curBytes = 0;
  for (const c of chunks) {
    const sz = Math.max(c.size, NOMINAL_CHUNK_BYTES);
    if (cur.length > 0 && curBytes + sz > TRANSCRIBE_WINDOW_BYTES) {
      windows.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(c);
    curBytes += sz;
  }
  if (cur.length > 0) windows.push(cur);

  const bytesPerSec = fmt.channels * 2 * fmt.sampleRate;
  const merged: Utterance[] = [];
  let offsetSecs = 0;
  let totalDataBytes = 0;
  let language: string | null = null;
  // Encode a compact playback MP3 alongside transcription, fed window-by-window
  // so the whole call is never held in memory (the OOM we're avoiding).
  const mp3Encoder = opts.encodeMp3 ? new Mp3StreamEncoder(fmt.sampleRate) : null;

  for (const win of windows) {
    const asm = await assembleSessionAudio(win, fmt);
    if (!asm.ok) {
      return {
        ok: false,
        status: asm.error.includes("download") ? 502 : 400,
        error: asm.error,
      };
    }
    const winDurationSecs = asm.dataBytes / bytesPerSec;
    const txr = await transcribeDualChannelBytes({
      wav: asm.wav,
      durationSecs: Math.round(winDurationSecs),
      mixedAcoustic: opts.mixedAcoustic,
      keyterms: opts.keyterms,
    });
    if (!txr.ok) return { ok: false, status: 502, error: txr.error };
    if (language === null) language = txr.result.language;
    for (const u of txr.result.utterances) {
      merged.push({ ...u, start: u.start + offsetSecs, end: u.end + offsetSecs });
    }
    // Feed the window's PCM (past the 44-byte WAV header) to the MP3 encoder.
    mp3Encoder?.addStereoPcm(asm.wav.subarray(WAV_HEADER_BYTES));
    offsetSecs += winDurationSecs;
    totalDataBytes += asm.dataBytes;
    // asm.wav is dropped here → reclaimed before the next window assembles.
  }

  const durationSecs = Math.round(totalDataBytes / bytesPerSec);
  merged.sort((a, b) => a.start - b.start);
  const room = !!opts.mixedAcoustic;
  return {
    ok: true,
    durationSecs,
    mp3: mp3Encoder ? mp3Encoder.finish() : null,
    result: {
      utterances: merged,
      dialogueText: buildDialogue(merged, {
        founder: room ? "Room" : "Founder",
        participant: "Participant",
      }),
      language: language ?? "multi",
      // Silence detection must run over the WHOLE call, not per window.
      suspectFlags: detectSilentChannels(merged, durationSecs, {
        mixedAcoustic: room,
      }),
    },
  };
}

// Capture-source predicates live in constants.ts (dependency-free, so unit
// tests can import them without pulling in the db layer). Re-exported here
// because callers already import them from this module.
export {
  SOURCE_APP_IN_PERSON_MEETING,
  SOURCE_APP_SPEAKERPHONE,
  isInPersonMeetingSource,
  isSpeakerphoneSource,
  isMixedAcousticSource,
} from "./constants";

export type FinalizeOutcome =
  | {
      ok: true;
      recordingId: string;
      result: FileCallResult;
      suspectFlags: string[];
      partial: boolean;
    }
  | { ok: false; status: number; error: string; missing?: number[] };

export type PrecomputedTranscript = {
  language?: string | null;
  engine?: string | null;
  utterances: Utterance[];
};

export async function finalizeSession(opts: {
  session: CaptureSessionRow;
  founderLabel: string;
  endedAt: Date;
  durationSecs: number | null;
  totalChunks: number | null; // null = salvage mode: use whatever chunks exist
  partial: boolean;
  contactName?: string | null;
  /** Local free STT+diarize result from the Mac Helper — skips Deepgram. */
  precomputedTranscript?: PrecomputedTranscript | null;
  /** Operator-flagged "important moments" (time-anchored) — steer the brief. */
  highlights?: Highlight[];
  /** Operator-typed live notes (time-anchored) — woven into the brief. */
  notes?: OperatorNote[];
  /** Live transcription-term corrections — Deepgram keyterms + wrong→right post-pass. */
  terms?: TermCorrection[];
  /** El Cuaderno: pre-call agenda items (advisory). */
  agenda?: AgendaItem[];
  /** El Cuaderno: live theme list — union of agenda-seeded + live-created. */
  themes?: LiveTheme[];
  /** El Cuaderno Slice 2: live agenda coverage marks (advisory). */
  coverage?: CoverageMark[];
}): Promise<FinalizeOutcome> {
  const { session } = opts;
  const workspaceId = session.workspaceId;

  const fail = async (status: number, error: string): Promise<FinalizeOutcome> => {
    await updateCaptureSession({
      id: session.id,
      workspaceId,
      patch: { status: "failed", error: error.slice(0, 500) },
    });
    return { ok: false, status, error };
  };

  // 1. Inventory chunks (with sizes, for streaming assembly). Names sort by
  // seq (zero-padded).
  const chunks = await listSessionChunks(workspaceId, session.id);
  if (chunks.length === 0) {
    return fail(409, "No chunks uploaded for this session");
  }
  if (opts.totalChunks !== null) {
    const have = new Set(chunks.map((c) => c.path));
    const missing: number[] = [];
    for (let seq = 0; seq < opts.totalChunks; seq++) {
      if (!have.has(chunkObjectPath(workspaceId, session.id, seq))) {
        missing.push(seq);
      }
    }
    if (missing.length > 0) {
      // Not a failure — helper re-uploads the gaps and retries finalize.
      await updateCaptureSession({
        id: session.id,
        workspaceId,
        patch: { status: "recording" },
      });
      return { ok: false, status: 409, error: "Missing chunks", missing };
    }
  }

  // 2–4. Transcribe (memory-bounded) + store audio best-effort.
  //
  // A call only fits in one buffer when it's small. The whole-call assembly +
  // Deepgram POST is what OOM'd finalize on long calls (a 77-min call is
  // ~295 MB, and the fetch body copy pushes peak RAM past the function limit →
  // the function is killed and the session wedges in `finalizing`). So:
  //   • small call (≤ STORE_AUDIO_MAX_BYTES): assemble once, store for playback,
  //     transcribe single-shot (unchanged behaviour for the common case).
  //   • long / unknown-size call: transcribe in windows (peak RAM = one window)
  //     and skip stored audio — transcript + brief always land regardless of
  //     length (FR-CALL-TRX-3/5). Long-call playback is a tracked follow-up.
  const totalBytes = chunks.reduce((n, c) => n + Math.max(c.size, 0), 0);
  const fmt = { sampleRate: CAPTURE_SAMPLE_RATE, channels: CAPTURE_CHANNELS };
  const inPersonMeeting = isInPersonMeetingSource(session.sourceApp);
  // Acoustic shape, not wording: in-person rooms AND speakerphone captures put
  // every speaker on ch0, so channel identity means nothing and diarization is
  // the only thing that can tell participants apart.
  const mixedAcoustic = isMixedAcousticSource(session.sourceApp);
  // Glossary `right` values → nova-3 keyterm prompting, so corrected terms
  // transcribe right at the source (Deepgram paths only; empty = no-op).
  const keyterms = (opts.terms ?? []).map((t) => t.right).filter((r) => r.trim());

  // Audio is always transcribed, but only persisted when the workspace opts in.
  // Transcript-only mode skips the bucket upload entirely (and the MP3 encode),
  // so there's no recurring storage cost — the Helper keeps the local copy.
  const { retentionDays, storeCallAudio } =
    await getWorkspaceCaptureSettings(workspaceId);

  let txResult: TranscriptionResult;
  let durationSecs: number | null;
  let audioPath: string | null = null;
  let audioStored = false;
  let audioBytes: number | null = null;
  let transcriptEngine: string | null = null;

  const pre = opts.precomputedTranscript;
  const hasPrecomputed =
    !!pre && Array.isArray(pre.utterances) && pre.utterances.length > 0;

  if (hasPrecomputed && pre) {
    // Free local path (WhisperX / Vibe / whisper.cpp): skip Deepgram entirely.
    const utterances = pre.utterances.map((u) => ({
      speaker: String(u.speaker || "SPEAKER_00").slice(0, 64),
      diarizationId: u.diarizationId
        ? String(u.diarizationId).slice(0, 64)
        : u.speaker?.startsWith("SPEAKER_")
          ? String(u.speaker).slice(0, 64)
          : undefined,
      channel: typeof u.channel === "number" ? u.channel : 0,
      start: typeof u.start === "number" ? u.start : 0,
      end: typeof u.end === "number" ? u.end : 0,
      text: String(u.text ?? "").slice(0, 8000),
    })).filter((u) => u.text.trim().length > 0);
    durationSecs = opts.durationSecs;
    transcriptEngine = pre.engine
      ? `local:${String(pre.engine).slice(0, 40)}`
      : "local";
    txResult = {
      utterances,
      dialogueText: buildDialogue(utterances, {
        founder: inPersonMeeting ? "Room" : opts.founderLabel,
        participant: "Participant",
      }),
      language: pre.language ? String(pre.language).slice(0, 32) : "multi",
      suspectFlags: detectSilentChannels(utterances, durationSecs ?? 0, {
        mixedAcoustic,
      }),
    };
    // Still try to store audio for playback when size allows.
    if (storeCallAudio && totalBytes > 0 && totalBytes <= STORE_AUDIO_MAX_BYTES) {
      const asm = await assembleSessionAudio(chunks, fmt);
      if (asm.ok) {
        if (!durationSecs) {
          durationSecs = Math.round(
            asm.dataBytes / (CAPTURE_CHANNELS * 2) / CAPTURE_SAMPLE_RATE,
          );
        }
        audioPath = assembledObjectPath(workspaceId, session.id);
        const stored = await putObject(audioPath, asm.wav);
        if (stored.ok) {
          audioStored = true;
          audioBytes = asm.wav.length;
        } else {
          audioPath = null;
        }
      }
    }
  } else if (totalBytes > 0 && totalBytes <= STORE_AUDIO_MAX_BYTES) {
    const asm = await assembleSessionAudio(chunks, fmt);
    if (!asm.ok) {
      return fail(asm.error.includes("download") ? 502 : 400, asm.error);
    }
    durationSecs =
      Math.round(asm.dataBytes / (CAPTURE_CHANNELS * 2) / CAPTURE_SAMPLE_RATE) ||
      opts.durationSecs ||
      null;
    const tx = await transcribeDualChannelBytes({
      wav: asm.wav,
      durationSecs: durationSecs ?? 0,
      mixedAcoustic,
      keyterms: keyterms.length > 0 ? keyterms : undefined,
    });
    if (!tx.ok) return fail(502, tx.error);
    txResult = tx.result;
    transcriptEngine = mixedAcoustic ? "deepgram+diarize" : "deepgram";

    // Store the audio best-effort for playback (FR-CALL-ACC-3), unless the
    // workspace is transcript-only. If storage rejects it we keep transcript +
    // brief rather than failing the call.
    if (storeCallAudio) {
      audioPath = assembledObjectPath(workspaceId, session.id);
      const stored = await putObject(audioPath, asm.wav);
      if (stored.ok) {
        audioStored = true;
        audioBytes = asm.wav.length;
      } else {
        audioPath = null;
        console.warn(
          `[capture] audio not stored for session ${session.id} (${asm.wav.length} bytes): ${stored.error} — transcript retained`,
        );
      }
    }
  } else {
    // Long call: window the transcription AND encode a compact playback MP3 in
    // the same pass — unless the call is so long the MP3 still wouldn't fit, in
    // which case we keep the transcript and skip audio (graceful).
    const estDurationSecs = totalBytes / (CAPTURE_CHANNELS * 2 * CAPTURE_SAMPLE_RATE);
    const wantMp3 =
      storeCallAudio && estimatedMp3Bytes(estDurationSecs) <= STORE_AUDIO_MAX_BYTES;
    const w = await transcribeWindowed(chunks, fmt, {
      encodeMp3: wantMp3,
      mixedAcoustic,
      keyterms: keyterms.length > 0 ? keyterms : undefined,
    });
    if (!w.ok) return fail(w.status, w.error);
    txResult = w.result;
    durationSecs = w.durationSecs || opts.durationSecs || null;
    transcriptEngine = mixedAcoustic ? "deepgram+diarize" : "deepgram";

    if (storeCallAudio && w.mp3 && w.mp3.length <= STORE_AUDIO_MAX_BYTES) {
      audioPath = assembledMp3ObjectPath(workspaceId, session.id);
      const stored = await putObject(audioPath, w.mp3, "audio/mpeg");
      if (stored.ok) {
        audioStored = true;
        audioBytes = w.mp3.length;
      } else {
        audioPath = null;
        console.warn(
          `[capture] long-call MP3 not stored for session ${session.id} (${w.mp3.length} bytes): ${stored.error} — transcript retained`,
        );
      }
    } else {
      console.warn(
        `[capture] long call session ${session.id} (~${Math.round(totalBytes / 1048576)} MB) transcribed windowed; audio too long to store as MP3 — transcript retained`,
      );
    }
  }

  // Glossary post-pass (BOTH transcription paths — precomputed local STT and
  // Deepgram converge here): whole-word wrong→right replacement BEFORE the
  // dialogue text is built and before createCallRecording, so the stored
  // transcript, utterances jsonb, and brief all see corrected text. Advisory:
  // a correction failure must never fail a finalize.
  if ((opts.terms ?? []).length > 0) {
    try {
      const fixed = applyTermCorrections(txResult.utterances, opts.terms ?? []);
      if (fixed.replacements > 0) {
        txResult = { ...txResult, utterances: fixed.utterances };
      }
    } catch (e) {
      console.warn(
        `[capture] term corrections skipped for session ${session.id}: ${String(e)}`,
      );
    }
  }

  // In-person: room mic on L; diarization yields SPEAKER_00… which buildDialogue
  // keeps unless speakerMap maps them. contactName seeds founder/room label only.
  const founderLabel = inPersonMeeting
    ? (opts.contactName ?? "").trim() || "Room"
    : opts.founderLabel;
  const participantLabel = inPersonMeeting
    ? "Remote"
    : (opts.contactName ?? "").trim() || "Participant";
  // If contactName is set and only one cluster appears, map SPEAKER_00 → name.
  const speakerMap: Record<string, string> = {};
  if (mixedAcoustic && (opts.contactName ?? "").trim()) {
    const name = (opts.contactName ?? "").trim();
    const clusters = [
      ...new Set(
        txResult.utterances
          .map((u) => u.diarizationId ?? (u.speaker.startsWith("SPEAKER_") ? u.speaker : null))
          .filter((x): x is string => !!x),
      ),
    ].sort();
    if (clusters.length === 1) speakerMap[clusters[0]] = name;
    // Multiple clusters: leave SPEAKER_xx for manual mapping in CRM (D1 UI).
  }
  const dialogueText =
    txResult.utterances.length > 0
      ? buildDialogue(txResult.utterances, {
          founder: founderLabel,
          participant: participantLabel,
          speakerMap,
        })
      : "(no speech detected)";

  // 5. Durable-first recording row (FR-CALL-TRX-5): transcript + audio +
  // attribution persisted BEFORE any LLM filing.
  const recordingId = await createCallRecording({
    workspaceId,
    createdBy: session.createdBy,
    transcript: dialogueText,
    durationSecs,
    language: txResult.language,
    audioPath: audioStored ? audioPath : null,
    audioBytes: audioStored ? audioBytes : null,
    audioPurgeAt: audioStored
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
      : null,
    channels: CAPTURE_CHANNELS,
    sourceApp: session.sourceApp,
    utterances: txResult.utterances,
    speakerMap: Object.keys(speakerMap).length ? speakerMap : null,
    transcriptEngine,
    suspectFlags: txResult.suspectFlags.length ? txResult.suspectFlags : null,
    partial: opts.partial,
    agenda: (opts.agenda ?? []).length > 0 ? opts.agenda : null,
  });

  // 5b. El Cuaderno: build the pre-AI themed document from the operator's live
  // #theme structure. Advisory — any throw here leaves themedDoc null and the
  // filing below takes the legacy path (a call is never lost to theming).
  const resolvedFlags = resolveHighlights(opts.highlights ?? [], txResult.utterances);
  const resolvedNotes = resolveNotes(opts.notes ?? [], txResult.utterances);
  let themedDoc: ThemedDoc | null = null;
  if ((opts.themes ?? []).length > 0) {
    try {
      themedDoc = buildThemedDoc({
        themes: opts.themes ?? [],
        agenda: opts.agenda ?? [],
        resolvedNotes,
        resolvedFlags,
        utterances: txResult.utterances,
        labels: {
          founder: founderLabel,
          participant: participantLabel,
          speakerMap: Object.keys(speakerMap).length ? speakerMap : undefined,
        },
        coverage: opts.coverage ?? [],
      });
    } catch (e) {
      console.warn(
        `[capture] themed doc build failed for session ${session.id} — legacy filing: ${String(e)}`,
      );
    }
  }

  // 6. AI filing (brief/note/action items/contact). A filing failure never
  // loses the call — the row above already exists.
  let result: FileCallResult;
  try {
    result = await fileCallTranscript({
      workspaceId,
      userId: session.createdBy,
      recordingId,
      transcript: dialogueText,
      durationSecs,
      contactName: opts.contactName ?? null,
      attributed: true,
      founderLabel,
      inPersonMeeting,
      flaggedMoments: resolvedFlags,
      operatorNotes: resolvedNotes,
      themedDoc,
      utterances: txResult.utterances,
      spendRoute: "capture:finalize:file",
    });
  } catch (e) {
    result = {
      title: inPersonMeeting ? "Meeting" : "Call",
      brief: "",
      note: "",
      actionItemCount: 0,
      contact: null,
      contactAmbiguous: false,
      meetingId: null,
      themedDoc: null,
    };
    // Session still counts as filed (recording exists); error noted.
    await updateCaptureSession({
      id: session.id,
      workspaceId,
      patch: { error: `filing: ${String(e).slice(0, 400)}` },
    });
  }

  // 6b. El Cuaderno: per-call theme facets (cross-call theme queries). Only
  // when the themed path actually filed the call (result.themedDoc set — its
  // jsonb is persisted by the filing itself). Advisory: a facet failure never
  // fails the finalize. NOTE (slice 1): the themes-table upsert is deliberately
  // skipped — facets keep theme_id null and are label-keyed until a later
  // slice makes themes durable.
  if (result.themedDoc) {
    try {
      await replaceCallThemeFacets({
        workspaceId,
        callId: recordingId,
        facets: facetsFromThemedDoc(result.themedDoc),
      });
    } catch (e) {
      console.warn(
        `[capture] theme facets not stored for session ${session.id}: ${String(e)}`,
      );
    }
  }

  // 6c. El Cuaderno Slice 3: advisory enrichment on top of the durable, already-
  // persisted themed doc (durable-first — the recording + brief already exist, so
  // a slow or failed pass never loses the call). The librarian (Haiku) adds
  // cite-verified supporting/contradicting quotes per theme; the auditor (Sonnet,
  // threshold-gated) builds the call-wide commitments/blockers/decisions ledger +
  // per-speaker synthesis. Both are cite-gated; the whole block is try/catch.
  if (result.themedDoc) {
    try {
      let enriched: ThemedDoc = result.themedDoc;
      if (enriched.themes.some((t) => t.evidence.length > 0)) {
        enriched = await runThemeLibrarian({
          workspaceId,
          userId: session.createdBy,
          recordingId,
          spendRoute: "capture:finalize:file",
          transcript: dialogueText,
          doc: enriched,
          utterances: txResult.utterances,
        });
      }
      if (shouldRunAudit(enriched)) {
        enriched = await runCallAudit({
          workspaceId,
          userId: session.createdBy,
          recordingId,
          spendRoute: "capture:finalize:file",
          transcript: dialogueText,
          doc: enriched,
          utterances: txResult.utterances,
        });
      }
      if (enriched !== result.themedDoc) {
        await updateCallRecording({
          id: recordingId,
          workspaceId,
          themedDoc: enriched,
          brief: renderThemedBrief(enriched),
        });
      }
    } catch (e) {
      console.warn(
        `[capture] slice-3 enrichment skipped for session ${session.id}: ${String(e)}`,
      );
    }
  }

  // 7. Mark filed + clean up chunk objects (assembled file is the artifact).
  await updateCaptureSession({
    id: session.id,
    workspaceId,
    patch: {
      status: "filed",
      endedAt: opts.endedAt,
      durationSecs,
      totalChunks: opts.totalChunks ?? chunks.length,
      partial: opts.partial,
      recordingId,
    },
  });
  await removeObjects(chunks.map((c) => c.path));

  return {
    ok: true,
    recordingId,
    result,
    suspectFlags: txResult.suspectFlags,
    partial: opts.partial,
  };
}

/** Re-read a filed session's result for idempotent finalize retries. */
export async function existingFinalizeResponse(opts: {
  sessionId: string;
  workspaceId: string;
}): Promise<{ recordingId: string } | null> {
  const session = await getCaptureSession({
    id: opts.sessionId,
    workspaceId: opts.workspaceId,
  });
  if (session?.status === "filed" && session.recordingId) {
    return { recordingId: session.recordingId };
  }
  return null;
}
