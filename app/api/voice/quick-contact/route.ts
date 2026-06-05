import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";

const { contacts, touches } = schema;

/**
 * AGB-302 — 30-sec contact-on-the-fly.
 *
 * Browser captures audio, posts here. We Whisper-transcribe, then ask Claude
 * to extract { name, organization, relationship, notes }. If extraction
 * succeeds we create a Contact + first Touch in one shot. If Claude is
 * unavailable we still create a contact from the raw transcript using the
 * first sentence as the name (caller can edit on the detail page).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const openai = process.env.OPENAI_API_KEY;
  if (!openai) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set" },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  // 1. Transcribe.
  const upstream = new FormData();
  upstream.append("file", audio, "memo.webm");
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "json");
  const whisp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openai}` },
    body: upstream,
  });
  if (!whisp.ok) {
    return NextResponse.json(
      { error: "transcription failed", detail: await whisp.text() },
      { status: 502 },
    );
  }
  const transcript = ((await whisp.json()) as { text?: string }).text ?? "";

  // 2. Extract structured fields.
  let extracted = {
    name: "",
    organization: "" as string | null,
    relationship: "prospect" as
      | "friend"
      | "lead"
      | "partner"
      | "prospect",
    notes: transcript,
  };
  if (isAnthropicConfigured() && transcript.trim().length > 0) {
    const claude = await claudeChat({
      // Deterministic fact extraction → Haiku (~15× cheaper than Opus).
      model: "claude-haiku-4-5",
      system:
        [
          "You extract contact facts from a voice memo.",
          "Output strict JSON only matching:",
          `{"name":string,"organization":string|null,"relationship":"friend"|"lead"|"partner"|"prospect","notes":string}`,
          "Pick the name a human would write on a business card.",
          "If unsure of org, leave it null. Default relationship is 'prospect'.",
        ].join("\n"),
      prompt: transcript.slice(0, 2000),
      maxTokens: 300,
      spend: {
        workspaceId: user.workspaceId,
        userId: user.id,
        direction: "out",
        trackUsage: true,
        payload: { route: "voice:quick-contact" },
      },
    });
    if (claude.ok) {
      try {
        const cleaned = claude.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
          extracted = {
            name: parsed.name.trim(),
            organization: parsed.organization ?? null,
            relationship: parsed.relationship ?? "prospect",
            notes: parsed.notes ?? transcript,
          };
        }
      } catch {
        // Fall through to first-sentence fallback.
      }
    }
  }

  if (!extracted.name) {
    // Fallback: use the first sentence (truncated) as the name; user edits later.
    const firstSentence = transcript.split(/[.!?]/)[0].trim();
    extracted.name = firstSentence.slice(0, 80) || "Voice memo contact";
  }

  // 3. Create the contact + first touch.
  const [contact] = await db
    .insert(contacts)
    .values({
      name: extracted.name,
      type: "person",
      relationshipType: extracted.relationship,
      organization: extracted.organization ?? null,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({ id: contacts.id });

  await db.insert(touches).values({
    contactId: contact.id,
    channel: "voice_memo",
    body: extracted.notes,
    transcript,
    workspaceId: user.workspaceId,
    createdBy: user.id,
  });

  await db
    .update(contacts)
    .set({ lastTouchAt: new Date() })
    .where(eq(contacts.id, contact.id));

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    extracted,
  });
}
