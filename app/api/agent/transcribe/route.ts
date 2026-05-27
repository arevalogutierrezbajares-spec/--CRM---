import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { transcribeVoice } from "@/lib/wa-agent/media/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth check — only logged-in workspace members can hit Whisper.
  // requireUser() throws → 401 if unauthenticated.
  await requireUser();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "expected multipart form-data" },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "audio blob missing" },
      { status: 400 },
    );
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "audio too large (max 25MB)" },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await audio.arrayBuffer());
  const ext = audio.type.includes("webm") ? "webm" : "ogg";
  const result = await transcribeVoice(buffer, `voice.${ext}`);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    language: result.language,
    durationSecs: result.durationSecs,
  });
}
