import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "chunk.webm");
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "verbose_json");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!whisperRes.ok) {
    const err = await whisperRes.text();
    return NextResponse.json({ error: `Whisper error: ${err}` }, { status: 502 });
  }

  const result: { text: string; avg_logprob?: number } = await whisperRes.json();
  return NextResponse.json({ text: result.text.trim() });
}
