/**
 * Pick the best audio MIME the current browser can record.
 * Chrome/Firefox prefer webm/opus; Safari ≤17 only does mp4 (or wav as a
 * fallback for old engines). Returns an empty string if MediaRecorder is
 * available but no MIME negotiates — the caller should treat that as
 * "Recording isn't supported on this device."
 */
export function pickRecorderMime(): string {
  // Browser-only: short-circuit when MediaRecorder isn't available. We don't
  // gate on `typeof window` so that test environments can polyfill just the
  // MediaRecorder global.
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/wav",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // some browsers throw on isTypeSupported for unknown types
    }
  }
  return "";
}

/**
 * Filename extension to use when sending the Blob to OpenAI Whisper.
 * Whisper expects a hint about the container; matching the MIME prevents
 * "Invalid file format" errors.
 */
export function recorderFilename(mime: string): string {
  if (mime.startsWith("audio/webm")) return "memo.webm";
  if (mime.startsWith("audio/mp4")) return "memo.mp4";
  if (mime.startsWith("audio/ogg")) return "memo.ogg";
  if (mime.startsWith("audio/wav")) return "memo.wav";
  return "memo.webm";
}
