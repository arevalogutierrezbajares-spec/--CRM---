import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { savePublicPitchFeedback } from "@/db/queries/pitch-feedback";

const promptTypeSchema = z.enum([
  "reaction",
  "score",
  "text",
  "intro",
  "objection",
  "final",
]);

const responseSchema = z.object({
  promptKey: z.string().min(1).max(120),
  responseType: promptTypeSchema,
  value: z.record(z.unknown()),
});

const bodySchema = z.object({
  token: z.string().min(12).max(256),
  sessionId: z.string().uuid(),
  sectionKey: z.string().min(1).max(120),
  currentSectionKey: z.string().min(1).max(120),
  progressPercent: z.number().min(0).max(100),
  responses: z.array(responseSchema).max(20).default([]),
  completed: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 });
  }

  const result = await savePublicPitchFeedback(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
