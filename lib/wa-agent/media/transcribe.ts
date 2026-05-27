import OpenAI from "openai";
import { Readable } from "stream";

export type TranscribeResult =
  | { ok: true; text: string; language: string; durationSecs: number }
  | { ok: false; error: string };

/**
 * Transcribe a voice note buffer using OpenAI Whisper.
 * Handles ogg/opus (WhatsApp's native format) natively.
 * Cost: ~$0.006/minute.
 */
export async function transcribeVoice(
  audioBuffer: Buffer,
  filename = "voice.ogg",
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY not configured" };

  try {
    const openai = new OpenAI({ apiKey });

    // openai SDK accepts a File-like object with a stream
    const stream = Readable.from(audioBuffer);
    const file = Object.assign(stream, { name: filename });

    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: file as unknown as File,
      response_format: "verbose_json",
    });

    const verbose = response as unknown as {
      text: string;
      language: string;
      duration: number;
    };

    return {
      ok: true,
      text: verbose.text ?? "",
      language: verbose.language ?? "unknown",
      durationSecs: verbose.duration ?? 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
