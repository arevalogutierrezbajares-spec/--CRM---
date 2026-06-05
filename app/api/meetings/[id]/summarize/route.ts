import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { isAnthropicConfigured, claudeChat } from "@/lib/anthropic";

const bodySchema = z.object({
  transcript: z.string().max(50_000),
  agenda: z.string().max(8_000).nullable().optional(),
  attendeeNames: z.array(z.string()).optional(),
});

type Params = Promise<{ id: string }>;

type RouteContext = { params: Params };

export async function POST(req: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { transcript, agenda, attendeeNames } = parsed.data;
  const { id: meetingId } = await context.params;

  const systemPrompt = `You are a chief-of-staff assistant. Your job is to turn a raw meeting transcript into clean, structured meeting minutes.

Format the minutes as plain text with these sections:
- Key discussion points (bullet list)
- Decisions made (bullet list, or "None" if empty)
- Action items (lines starting with "[ ] " followed by the item, e.g. "[ ] Follow up with legal team")
- Next steps (bullet list, or "None")

Be concise. Use the agenda context when provided to organize topics. Attribute action items to specific people when clear from the transcript. Output plain text only — no markdown headers, no bold, no HTML.`;

  const userMessage = [
    agenda ? `AGENDA:\n${agenda}` : null,
    attendeeNames?.length ? `ATTENDEES: ${attendeeNames.join(", ")}` : null,
    `TRANSCRIPT:\n${transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await claudeChat({
    model: "claude-haiku-4-5",
    system: systemPrompt,
    prompt: userMessage,
    maxTokens: 2048,
    spend: {
      workspaceId: user.workspaceId,
      userId: user.id,
      direction: "out",
      payload: { route: "meetings:summarize", meetingId },
      trackUsage: true,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ minutes: result.text });
}
