import OpenAI from "openai";
import { Readable } from "stream";

export type TranscribeResult =
  | { ok: true; text: string; language: string; durationSecs: number }
  | { ok: false; error: string };

/**
 * Transcribe a voice note buffer.
 *
 * Prefers Groq (whisper-large-v3-turbo): ~6× cheaper and noticeably faster than
 * OpenAI Whisper, same Whisper model family, and it handles WhatsApp's native
 * ogg/opus directly. Falls back to OpenAI Whisper (whisper-1) when GROQ_API_KEY
 * is absent but OPENAI_API_KEY is set. The result shape is identical either way,
 * so callers (the webhook → voice_notes → agent) don't change.
 */
export async function transcribeVoice(
  audioBuffer: Buffer,
  filename = "voice.ogg",
): Promise<TranscribeResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) return viaGroq(audioBuffer, filename, groqKey);

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return viaOpenAI(audioBuffer, filename, openaiKey);

  return {
    ok: false,
    error: "No transcription key configured (set GROQ_API_KEY or OPENAI_API_KEY)",
  };
}

/** Groq — OpenAI-compatible transcription endpoint. */
async function viaGroq(
  audioBuffer: Buffer,
  filename: string,
  apiKey: string,
): Promise<TranscribeResult> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
    form.append(
      "model",
      process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo",
    );
    form.append("response_format", "verbose_json");

    const resp = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
    if (!resp.ok) {
      return {
        ok: false,
        error: `Groq transcription failed (${resp.status}): ${await resp.text()}`,
      };
    }
    const json = (await resp.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };
    return {
      ok: true,
      text: json.text ?? "",
      language: json.language ?? "unknown",
      durationSecs: json.duration ?? 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** OpenAI Whisper — fallback when GROQ_API_KEY is not set. */
async function viaOpenAI(
  audioBuffer: Buffer,
  filename: string,
  apiKey: string,
): Promise<TranscribeResult> {
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
