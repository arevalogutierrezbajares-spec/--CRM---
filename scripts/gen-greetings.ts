/**
 * Generate the ÑIGO login-greeting clips and approved spoken-line clips with
 * ElevenLabs TTS.
 *
 *   pnpm greetings:gen                         # render missing approved clips
 *   pnpm greetings:gen -- --force              # re-render approved clips
 *   pnpm greetings:gen -- --include-pending    # preview pending approval lines
 *
 * Renders GREETING_IDENTITIES × GREETING_PERIODS into public/greetings/ and
 * approved voice lines into public/jarvis/. Reads the key + voice from
 * .env.local:
 *
 *   ELEVENLABS_API_KEY=sk_...                  (required)
 *   ELEVENLABS_VOICE_ID=wDsJlOXPqcvIUKdLXjDs   (optional ÑIGO voice)
 *   ELEVENLABS_MODEL_ID=eleven_multilingual_v2 (optional)
 *
 * Swap ELEVENLABS_VOICE_ID only after product sign-off.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GREETING_IDENTITIES, GREETING_PERIODS, greetingLine } from "@/lib/greeting";
import {
  JARVIS_VOICE_LINES,
  approvedJarvisVoiceLines,
  demonMessageLine,
  pendingJarvisVoiceLines,
} from "@/lib/jarvis-voice";

// The ÑIGO voice: dedicated British-butler register. This is the canonical
// voice for the login greeting; do not change without product sign-off.
const DEFAULT_VOICE_ID = "wDsJlOXPqcvIUKdLXjDs";
const GREETINGS_DIR = join(process.cwd(), "public", "greetings");
const JARVIS_DIR = join(process.cwd(), "public", "jarvis");

/** Minimal .env.local loader so the script runs without next/dotenv. */
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (out[k] === undefined || out[k] === "") out[k] = v;
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
      // ÑIGO register: crisp and composed, measured, controlled, butler-like.
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.1,
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
    console.error("✗ ELEVENLABS_API_KEY missing. Add it to .env.local and re-run.");
    process.exit(1);
  }
  const voiceId = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const force = process.argv.includes("--force");
  const includePending = process.argv.includes("--include-pending");

  mkdirSync(GREETINGS_DIR, { recursive: true });
  mkdirSync(JARVIS_DIR, { recursive: true });
  console.log(`→ voice=${voiceId} model=${modelId} force=${force} includePending=${includePending}`);

  let made = 0;
  let skipped = 0;
  for (const identity of GREETING_IDENTITIES) {
    for (const period of GREETING_PERIODS) {
      const file = join(GREETINGS_DIR, `${identity.slug}-${period}.mp3`);
      if (!force && existsSync(file)) {
        skipped++;
        continue;
      }
      const text = greetingLine(identity.spokenTitle, period);
      process.stdout.write(`  ${identity.slug}-${period}  "${text}" … `);
      const audio = await tts({ apiKey, voiceId, modelId, text });
      writeFileSync(file, audio);
      console.log(`${(audio.length / 1024).toFixed(0)} KB ✓`);
      made++;
    }
  }

  const lines = includePending ? JARVIS_VOICE_LINES : approvedJarvisVoiceLines();
  for (const line of lines) {
    const file = join(JARVIS_DIR, `${line.slug}.mp3`);
    if (!force && existsSync(file)) {
      skipped++;
      continue;
    }
    process.stdout.write(`  jarvis/${line.slug}  "${line.text}" … `);
    const audio = await tts({ apiKey, voiceId, modelId, text: line.text });
    writeFileSync(file, audio);
    console.log(`${(audio.length / 1024).toFixed(0)} KB ✓`);
    made++;
  }

  for (const identity of GREETING_IDENTITIES) {
    const file = join(JARVIS_DIR, `demon-message-${identity.slug}.mp3`);
    if (!force && existsSync(file)) {
      skipped++;
      continue;
    }
    const text = demonMessageLine(identity.spokenTitle);
    process.stdout.write(`  jarvis/demon-message-${identity.slug}  "${text}" … `);
    const audio = await tts({ apiKey, voiceId, modelId, text });
    writeFileSync(file, audio);
    console.log(`${(audio.length / 1024).toFixed(0)} KB ✓`);
    made++;
  }

  const pending = pendingJarvisVoiceLines();
  if (!includePending && pending.length > 0) {
    console.log(`↷ ${pending.length} pending ÑIGO line(s) skipped. Use --include-pending for local approval previews.`);
  }

  console.log(`\n✓ Done. ${made} rendered, ${skipped} skipped → public/greetings/, public/jarvis/`);
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
