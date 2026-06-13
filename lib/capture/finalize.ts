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
  getWorkspaceRetentionDays,
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
} from "./constants";
import { Mp3StreamEncoder, estimatedMp3Bytes } from "./mp3";
import {
  transcribeDualChannelBytes,
  buildDialogue,
  detectSilentChannels,
  type Utterance,
  type TranscriptionResult,
} from "./deepgram";
import { fileCallTranscript, type FileCallResult } from "./file-call";

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
  opts: { encodeMp3?: boolean } = {},
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
  return {
    ok: true,
    durationSecs,
    mp3: mp3Encoder ? mp3Encoder.finish() : null,
    result: {
      utterances: merged,
      dialogueText: buildDialogue(merged, {
        founder: "Founder",
        participant: "Participant",
      }),
      language: language ?? "multi",
      // Silence detection must run over the WHOLE call, not per window.
      suspectFlags: detectSilentChannels(merged, durationSecs),
    },
  };
}

export type FinalizeOutcome =
  | {
      ok: true;
      recordingId: string;
      result: FileCallResult;
      suspectFlags: string[];
      partial: boolean;
    }
  | { ok: false; status: number; error: string; missing?: number[] };

export async function finalizeSession(opts: {
  session: CaptureSessionRow;
  founderLabel: string;
  endedAt: Date;
  durationSecs: number | null;
  totalChunks: number | null; // null = salvage mode: use whatever chunks exist
  partial: boolean;
  contactName?: string | null;
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

  let txResult: TranscriptionResult;
  let durationSecs: number | null;
  let audioPath: string | null = null;
  let audioStored = false;
  let audioBytes: number | null = null;

  if (totalBytes > 0 && totalBytes <= STORE_AUDIO_MAX_BYTES) {
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
    });
    if (!tx.ok) return fail(502, tx.error);
    txResult = tx.result;

    // Store the audio best-effort for playback (FR-CALL-ACC-3). If storage
    // rejects it we keep transcript + brief rather than failing the call.
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
  } else {
    // Long call: window the transcription AND encode a compact playback MP3 in
    // the same pass — unless the call is so long the MP3 still wouldn't fit, in
    // which case we keep the transcript and skip audio (graceful).
    const estDurationSecs = totalBytes / (CAPTURE_CHANNELS * 2 * CAPTURE_SAMPLE_RATE);
    const wantMp3 = estimatedMp3Bytes(estDurationSecs) <= STORE_AUDIO_MAX_BYTES;
    const w = await transcribeWindowed(chunks, fmt, { encodeMp3: wantMp3 });
    if (!w.ok) return fail(w.status, w.error);
    txResult = w.result;
    durationSecs = w.durationSecs || opts.durationSecs || null;

    if (w.mp3 && w.mp3.length <= STORE_AUDIO_MAX_BYTES) {
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

  const founderLabel = opts.founderLabel;
  const participantLabel = (opts.contactName ?? "").trim() || "Participant";
  const dialogueText =
    txResult.utterances.length > 0
      ? buildDialogue(txResult.utterances, {
          founder: founderLabel,
          participant: participantLabel,
        })
      : "(no speech detected)";

  // 5. Durable-first recording row (FR-CALL-TRX-5): transcript + audio +
  // attribution persisted BEFORE any LLM filing.
  const retentionDays = await getWorkspaceRetentionDays(workspaceId);
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
    suspectFlags: txResult.suspectFlags.length ? txResult.suspectFlags : null,
    partial: opts.partial,
  });

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
      spendRoute: "capture:finalize:file",
    });
  } catch (e) {
    result = {
      title: "Call",
      brief: "",
      note: "",
      actionItemCount: 0,
      contact: null,
      contactAmbiguous: false,
      meetingId: null,
    };
    // Session still counts as filed (recording exists); error noted.
    await updateCaptureSession({
      id: session.id,
      workspaceId,
      patch: { error: `filing: ${String(e).slice(0, 400)}` },
    });
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
