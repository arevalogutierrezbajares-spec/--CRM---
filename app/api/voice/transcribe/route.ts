import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";

const { touches, contacts } = schema;

// Server-side: take an audio blob, send to OpenAI Whisper, create a Touch with
// transcript. Activates when OPENAI_API_KEY is present; otherwise returns 503.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY not set. Add it to .env.local to enable voice memo capture.",
      },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const audio = form.get("audio");
  const contactId = form.get("contactId");
  const projectId = form.get("projectId");

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }
  if (typeof contactId !== "string") {
    return NextResponse.json({ error: "contactId required" }, { status: 400 });
  }

  // Call Whisper API.
  const upstream = new FormData();
  upstream.append("file", audio, "memo.webm");
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "verbose_json");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!resp.ok) {
    const text = await resp.text();
    return NextResponse.json(
      { error: "transcription failed", detail: text },
      { status: 502 },
    );
  }

  const result = (await resp.json()) as {
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
  };

  // Confidence proxy: convert OpenAI's avg_logprob to a 0..1 score.
  const segs = result.segments ?? [];
  const avgLogprob =
    segs.length === 0
      ? -0.1
      : segs.reduce((s, x) => s + (x.avg_logprob ?? -0.1), 0) / segs.length;
  // logprob is negative; normalize roughly: -0.5 → 0.6, 0 → 1
  const confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
  const isLowConf = confidence < 0.7;

  // Tag low-confidence transcripts inline so the UI can flag them (AGB-306).
  const body = isLowConf
    ? `[LOW-CONFIDENCE • ${confidence.toFixed(2)}] ${result.text}`
    : result.text;

  const [row] = await db
    .insert(touches)
    .values({
      contactId,
      projectId: typeof projectId === "string" && projectId ? projectId : null,
      channel: "voice_memo",
      body,
      transcript: result.text,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({ id: touches.id });

  await db
    .update(contacts)
    .set({ lastTouchAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  return NextResponse.json({
    ok: true,
    touchId: row.id,
    confidence,
    lowConfidence: isLowConf,
  });
}
