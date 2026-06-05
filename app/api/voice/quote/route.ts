import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

const DEFAULT_VOICE_ID = "wDsJlOXPqcvIUKdLXjDs";
const DEFAULT_MODEL = "eleven_multilingual_v2";
const MAX_TEXT_LENGTH = 900;
const MAX_REF_LENGTH = 220;

type QuoteSpeechRequest = {
  text?: unknown;
  ref?: unknown;
};

type InFlight = Promise<ArrayBuffer>;

const cache = new Map<string, ArrayBuffer>();
const inflight = new Map<string, InFlight>();

function readSafeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

function cacheKey(voiceId: string, text: string, ref: string): string {
  return `${voiceId}|${text}|${ref}`;
}

function spokenText(text: string, ref: string): string {
  const safeRef = ref.length > 0 ? ` — ${ref}` : "";
  return `"${text}"${safeRef}`;
}

async function elevenLabsSpeech(text: string, ref: string): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not set.");
  }

  const key = cacheKey(voiceId, text, ref);
  const hit = cache.get(key);
  if (hit) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task: InFlight = (async () => {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: spokenText(text, ref),
          model_id: modelId,
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.1,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ElevenLabs ${response.status} ${response.statusText}: ${body.slice(0, 240)}`);
    }

    const audio = await response.arrayBuffer();
    cache.set(key, audio);
    return audio;
  })();

  inflight.set(key, task);
  try {
    const audio = await task;
    return audio;
  } finally {
    inflight.delete(key);
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: QuoteSpeechRequest;
  try {
    body = (await req.json()) as QuoteSpeechRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = readSafeText(body.text);
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  const ref = readSafeText(body.ref)?.slice(0, MAX_REF_LENGTH) ?? "";

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not set. Add it to .env.local to enable JARVIS voice." },
      { status: 503 },
    );
  }

  try {
    const audio = await elevenLabsSpeech(text, ref);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate speech.", detail: error instanceof Error ? error.message : "unknown" },
      { status: 502 },
    );
  }
}
