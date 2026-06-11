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
