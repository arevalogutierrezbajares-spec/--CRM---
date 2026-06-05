/**
 * Generate ÑIGO narration clips for the guided demo tour.
 *
 *   pnpm demo-tour:gen            # render missing clips
 *   pnpm demo-tour:gen -- --force # re-render all clips
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_TOUR_STEPS } from "@/lib/demo-tour";

const DEFAULT_VOICE_ID = "wDsJlOXPqcvIUKdLXjDs";
const OUT_DIR = join(process.cwd(), "public", "demo-tour");

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (out[key] === undefined || out[key] === "") out[key] = value;
  }
  return out;
}

async function tts(opts: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
}): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.modelId,
      voice_settings: {
        stability: 0.62,
        similarity_boost: 0.82,
        style: 0.08,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const env = loadEnv();
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY missing. Add it to .env.local and re-run.");
    process.exit(1);
  }

  const voiceId = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const force = process.argv.includes("--force");
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`voice=${voiceId} model=${modelId} force=${force}`);

  let made = 0;
  let skipped = 0;
  for (const step of DEMO_TOUR_STEPS) {
    const file = join(OUT_DIR, `${step.id}.mp3`);
    if (!force && existsSync(file)) {
      skipped++;
      continue;
    }
    process.stdout.write(`  ${step.id} ... `);
    const audio = await tts({
      apiKey,
      voiceId,
      modelId,
      text: step.narration,
    });
    writeFileSync(file, audio);
    console.log(`${(audio.length / 1024).toFixed(0)} KB`);
    made++;
  }

  console.log(`Done. ${made} rendered, ${skipped} skipped -> public/demo-tour/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
