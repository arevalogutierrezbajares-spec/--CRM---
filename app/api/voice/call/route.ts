import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { claudeWithTools, claudeChat, type ClaudeToolDef } from "@/lib/anthropic";

const { actionItems, touches, contacts } = schema;
const PRIORITIES = ["now", "next", "later", "backlog"] as const;

const FILE_CALL_TOOL: ClaudeToolDef = {
  name: "file_call",
  description:
    "File a recorded phone call: produce a brief, a CRM note, and the action items it created.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "3–8 word title for the call." },
      brief_markdown: {
        type: "string",
        description:
          "Adaptive Markdown brief. Start with '**TL;DR:**' then ONLY include sections that have real content (Key points, Decisions, etc.). Match length to the call — short call, short brief. Write in the transcript's primary language.",
      },
      note: {
        type: "string",
        description:
          "1–3 sentence plain-text note summarizing the call for the contact's CRM timeline.",
      },
      action_items: {
        type: "array",
        description:
          "Concrete tasks the call implies. Empty array if none — do not invent tasks.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative task, max 200 chars." },
            description: { type: "string", description: "Optional detail, max 1000 chars." },
            due_date: {
              type: "string",
              description: "YYYY-MM-DD only if an absolute date is clearly stated; omit otherwise.",
            },
            priority: { type: "string", enum: [...PRIORITIES] },
          },
          required: ["title"],
        },
      },
    },
    required: ["title", "brief_markdown", "note", "action_items"],
  },
};

const SYSTEM =
  "You file recorded phone calls for a busy operator. From a raw transcript you produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks. Be faithful: preserve names, numbers, dates exactly; never invent a task or detail. Adaptive length — a short call gets a one-line brief. Write in the transcript's primary language. You MUST call the file_call tool exactly once.";

type CallItem = {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  priority?: unknown;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as {
    transcript?: string;
    durationSecs?: number;
    contactName?: string;
  } | null;

  const transcript = (payload?.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  // 1. Extract brief + structured items.
  let title = "Call";
  let brief = "";
  let note = transcript.slice(0, 280);
  let items: CallItem[] = [];

  const res = await claudeWithTools({
    model: "claude-haiku-4-5",
    system: SYSTEM,
    tools: [FILE_CALL_TOOL],
    maxTokens: 1500,
    spend: {
      workspaceId: user.workspaceId,
      userId: user.id,
      direction: "out",
      payload: { route: "voice:call:file", transcriptChars: transcript.length },
      trackUsage: true,
    },
    messages: [
      {
        role: "user",
        content: `DURATION: ${payload?.durationSecs ?? "unknown"}s\n\nTRANSCRIPT:\n${transcript.slice(0, 24000)}`,
      },
    ],
  });

  const toolUse =
    res.ok && res.content.find((b) => b.type === "tool_use" && b.name === "file_call");
  if (toolUse && toolUse.type === "tool_use") {
    const inp = toolUse.input as {
      title?: string;
      brief_markdown?: string;
      note?: string;
      action_items?: CallItem[];
    };
    title = (inp.title || title).slice(0, 120);
    brief = inp.brief_markdown || "";
    note = inp.note || note;
    items = Array.isArray(inp.action_items) ? inp.action_items : [];
  } else {
    // Graceful fallback: plain brief, no structured tasks.
    const chat = await claudeChat({
      model: "claude-haiku-4-5",
      system:
        "Summarize this call transcript as a short Markdown brief starting with '**TL;DR:**'. Only include sections with real content. Same language as the transcript.",
      prompt: transcript.slice(0, 24000),
      maxTokens: 800,
      spend: {
        workspaceId: user.workspaceId,
        userId: user.id,
        direction: "out",
        payload: { route: "voice:call:fallback", transcriptChars: transcript.length },
        trackUsage: true,
      },
    });
    if (chat.ok) brief = chat.text;
  }

  // 2. Create action items (link-free; surface on the Home dashboard).
  const createdItemIds: string[] = [];
  for (const it of items) {
    const t = String(it.title ?? "").slice(0, 200).trim();
    if (!t) continue;
    const rawDue = String(it.due_date ?? "");
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
    const rawPr = String(it.priority ?? "");
    const priority = (PRIORITIES as readonly string[]).includes(rawPr)
      ? (rawPr as (typeof PRIORITIES)[number])
      : null;
    const description = it.description
      ? String(it.description).slice(0, 1000)
      : null;
    const [row] = await db
      .insert(actionItems)
      .values({
        workspaceId: user.workspaceId,
        title: t,
        description,
        dueDate,
        priority,
        createdBy: user.id,
      })
      .returning({ id: actionItems.id });
    createdItemIds.push(row.id);
  }

  // 3. If a contact name was given and uniquely matches, log the call as a touch.
  let attached: { id: string; name: string } | null = null;
  const contactName = (payload?.contactName ?? "").trim();
  if (contactName) {
    const matches = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, user.workspaceId),
          ilike(contacts.name, `%${contactName}%`),
        ),
      )
      .limit(2);
    if (matches.length === 1) {
      await db.insert(touches).values({
        contactId: matches[0].id,
        channel: "call",
        body: note,
        transcript,
        workspaceId: user.workspaceId,
        createdBy: user.id,
      });
      await db
        .update(contacts)
        .set({ lastTouchAt: new Date() })
        .where(eq(contacts.id, matches[0].id));
      attached = matches[0];
    }
  }

  return NextResponse.json({
    ok: true,
    title,
    brief,
    actionItemCount: createdItemIds.length,
    contact: attached,
    contactQueryMatched: attached !== null,
  });
}
