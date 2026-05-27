/**
 * Voice note transcription via OpenAI Whisper.
 *
 * WhatsApp voice notes arrive as audio/ogg;codecs=opus — Whisper handles
 * this natively. We auto-detect language (returns 'en' or 'es' etc.) and
 * expose the detected language so the loop can inject a bilingual hint.
 *
 * Requires: OPENAI_API_KEY env var.
 */

import OpenAI from "openai";
import { Readable } from "stream";
import { toFile } from "openai";

export type TranscribeResult =
  | { ok: true; text: string; language: string; durationSecs: number }
  | { ok: false; error: string };

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_client) _client = new OpenAI({ apiKey: key });
  return _client;
}

export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeVoice(
  audioBuffer: Buffer,
  filename = "voice.ogg",
): Promise<TranscribeResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "OPENAI_API_KEY not configured" };

  try {
    const file = await toFile(audioBuffer, filename, { type: "audio/ogg" });

    const start = Date.now();
    const response = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
    });

    const elapsed = (Date.now() - start) / 1000;
    const text = response.text?.trim() ?? "";
    const language = (response as { language?: string }).language ?? "unknown";
    const durationSecs =
      (response as { duration?: number }).duration ?? elapsed;

    if (!text) return { ok: false, error: "Transcription returned empty text" };

    return { ok: true, text, language, durationSecs };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
