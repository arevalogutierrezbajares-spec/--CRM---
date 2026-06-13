/**
 * CALL-CAPTURE-MODULE-V1 — shared constants for the capture pipeline.
 * Wire contract: docs/CALL-CAPTURE-PROTOCOL.md (protocol v1).
 */

export const CALL_AUDIO_BUCKET = "agb-call-audio";

/** Fixed v1 audio format (see protocol §Audio format). */
export const CAPTURE_SAMPLE_RATE = 16000;
export const CAPTURE_CHANNELS = 2;
/** Canonical PCM16 WAV header length the helper must emit per chunk. */
export const WAV_HEADER_BYTES = 44;
/** Hard cap per uploaded chunk (30 s ≈ 1.92 MB; cap leaves retry headroom). */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
/** Founder = interleaved channel 0 (left); participants = channel 1 (right). */
export const FOUNDER_CHANNEL = 0;
export const PARTICIPANT_CHANNEL = 1;

/** Sessions still `recording` with no chunk for this long get crash-salvaged. */
export const SESSION_STALE_MINUTES = 30;

/**
 * A `finalizing` claim is a LEASE, not a permanent lock. If a finalize crashes
 * (OOM / timeout / process kill) after claiming, the session would otherwise be
 * wedged in `finalizing` forever — invisible to retries and the crash sweep.
 * After this many minutes a `finalizing` claim is considered dead and may be
 * re-claimed by a helper retry or the cron sweep. Must exceed the finalize
 * route's maxDuration (800 s ≈ 13.3 min) so a genuinely in-flight finalize is
 * never stolen mid-run.
 */
export const FINALIZE_LEASE_MINUTES = 20;

/**
 * Max raw bytes assembled into RAM at once during transcription. The finalize
 * pipeline transcribes long calls in windows of ≤ this size instead of
 * buffering the whole call — peak RAM is one window, not the entire call, so
 * finalize can never OOM regardless of call length (a 77-min call is ~295 MB;
 * one window is ~32 MB). Chunks are 30 s ≈ 1.9 MB, so a window holds ~16
 * chunks ≈ 8 min.
 */
export const TRANSCRIBE_WINDOW_BYTES = 32 * 1024 * 1024;

/**
 * Best-effort audio playback is stored only when the whole assembled WAV fits
 * under this size (well below Supabase's object-size limit). Longer calls keep
 * transcript + brief but no stored audio — and crucially are NEVER assembled
 * into one buffer, so they don't pressure memory. (Long-call playback via
 * chunked/resumable storage is a tracked follow-up.)
 *
 * 45 MB ≈ 11.7 min of stereo 16 kHz PCM — just under Supabase's 50 MB object
 * limit, so it preserves audio playback for every call that previously got it
 * while staying ~6× below the memory pressure that OOM'd long calls.
 */
export const STORE_AUDIO_MAX_BYTES = 45 * 1024 * 1024;

/** Suspect flags (FR-CALL-OPS-4). */
export const FLAG_FOUNDER_SILENT = "founder_channel_silent";
export const FLAG_PARTICIPANT_SILENT = "participant_channel_silent";

export function chunkObjectPath(
  workspaceId: string,
  sessionId: string,
  seq: number,
): string {
  return `${workspaceId}/sessions/${sessionId}/chunk-${String(seq).padStart(6, "0")}.wav`;
}

export function sessionPrefix(workspaceId: string, sessionId: string): string {
  return `${workspaceId}/sessions/${sessionId}`;
}

export function assembledObjectPath(
  workspaceId: string,
  recordingId: string,
): string {
  return `${workspaceId}/calls/${recordingId}.wav`;
}

/** Compact MP3 playback object for long calls (the WAV is too big to store). */
export function assembledMp3ObjectPath(
  workspaceId: string,
  recordingId: string,
): string {
  return `${workspaceId}/calls/${recordingId}.mp3`;
}
