/**
 * Shared call-filing core (FR-CALL-DST-1..4): transcript → title + adaptive
 * brief + CRM note + action items + contact attachment. Extracted from
 * app/api/voice/call so both the live mic recorder and the Helper capture
 * pipeline file calls identically. The recording row must already exist
 * (durable-first, FR-CALL-TRX-5) — this only enriches it.
 */
import "server-only";
import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { claudeWithTools, claudeChat, type ClaudeToolDef } from "@/lib/anthropic";
import { updateCallRecording } from "@/db/queries/call-recordings";

const { actionItems, touches, contacts } = schema;
const PRIORITIES = ["now", "next", "later", "backlog"] as const;

export const FILE_CALL_TOOL: ClaudeToolDef = {
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

const SYSTEM_PLAIN =
  "You file recorded phone calls for a busy operator. From a raw transcript you produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks. Be faithful: preserve names, numbers, dates exactly; never invent a task or detail. Adaptive length — a short call gets a one-line brief. Write in the transcript's primary language. You MUST call the file_call tool exactly once.";

// FR-CALL-DST-2/3: the dialogue variant knows who said what and writes each
// action item in the language of the person who must act on it.
const SYSTEM_DIALOGUE =
  "You file recorded phone calls for a busy operator. The transcript is a speaker-attributed dialogue: each line is '[mm:ss] Name: words'. The operator is the first-listed speaker label given in the message. Produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks. CRITICAL: attribute commitments to the correct speaker — distinguish what the operator promised from what the other party promised; in the brief, name who owes what. Action items are ONLY the operator's own tasks (including following up on the other party's promises). Write each action item in the language that the person who must act on it was speaking. Be faithful: preserve names, numbers, dates exactly; never invent a task or detail. Adaptive length. You MUST call the file_call tool exactly once.";

type CallItem = {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  priority?: unknown;
};

export type FileCallResult = {
  title: string;
  brief: string;
  note: string;
  actionItemCount: number;
  contact: { id: string; name: string } | null;
  contactAmbiguous: boolean;
};

export async function fileCallTranscript(opts: {
  workspaceId: string;
  userId: string;
  recordingId: string;
  transcript: string;
  durationSecs?: number | null;
  contactName?: string | null;
  /** Dialogue mode: transcript lines are speaker-attributed (capture pipeline). */
  attributed?: boolean;
  /** Operator label used in the dialogue (e.g. "Founder" or display name). */
  founderLabel?: string;
  spendRoute?: string;
}): Promise<FileCallResult> {
  const transcript = opts.transcript;

  let title = "Call";
  let brief = "";
  let note = transcript.slice(0, 280);
  let items: CallItem[] = [];

  const preamble = opts.attributed
    ? `OPERATOR SPEAKER LABEL: ${opts.founderLabel ?? "Founder"}\nDURATION: ${opts.durationSecs ?? "unknown"}s\n\nDIALOGUE TRANSCRIPT:\n`
    : `DURATION: ${opts.durationSecs ?? "unknown"}s\n\nTRANSCRIPT:\n`;

  const res = await claudeWithTools({
    model: "claude-haiku-4-5",
    system: opts.attributed ? SYSTEM_DIALOGUE : SYSTEM_PLAIN,
    tools: [FILE_CALL_TOOL],
    maxTokens: 1500,
    spend: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      direction: "out",
      payload: {
        route: opts.spendRoute ?? "voice:call:file",
        transcriptChars: transcript.length,
      },
      trackUsage: true,
    },
    messages: [
      { role: "user", content: `${preamble}${transcript.slice(0, 24000)}` },
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
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        direction: "out",
        payload: {
          route: `${opts.spendRoute ?? "voice:call"}:fallback`,
          transcriptChars: transcript.length,
        },
        trackUsage: true,
      },
    });
    if (chat.ok) brief = chat.text;
  }

  // Create action items (linked back to the recording for provenance). One
  // batched insert rather than N round-trips.
  const itemRows = items
    .map((it) => {
      const t = String(it.title ?? "").slice(0, 200).trim();
      if (!t) return null;
      const rawDue = String(it.due_date ?? "");
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
      const rawPr = String(it.priority ?? "");
      const priority = (PRIORITIES as readonly string[]).includes(rawPr)
        ? (rawPr as (typeof PRIORITIES)[number])
        : null;
      const description = it.description
        ? String(it.description).slice(0, 1000)
        : null;
      return {
        workspaceId: opts.workspaceId,
        title: t,
        description,
        dueDate,
        priority,
        callRecordingId: opts.recordingId,
        createdBy: opts.userId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const createdItemIds =
    itemRows.length > 0
      ? (
          await db.insert(actionItems).values(itemRows).returning({ id: actionItems.id })
        ).map((r) => r.id)
      : [];

  // Contact match: unique match → touch + attach; ambiguous → flag, never guess
  // (FR-CALL-DST-4). Matching never gates persistence — the row already exists.
  let attached: { id: string; name: string } | null = null;
  let ambiguous = false;
  const contactName = (opts.contactName ?? "").trim();
  if (contactName) {
    const matches = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, opts.workspaceId),
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
        workspaceId: opts.workspaceId,
        createdBy: opts.userId,
      });
      await db
        .update(contacts)
        .set({ lastTouchAt: new Date() })
        .where(eq(contacts.id, matches[0].id));
      attached = matches[0];
    } else if (matches.length > 1) {
      ambiguous = true;
    }
  }

  await updateCallRecording({
    id: opts.recordingId,
    workspaceId: opts.workspaceId,
    title,
    brief: brief || null,
    contactId: attached?.id ?? null,
    actionItemCount: createdItemIds.length,
    contactAmbiguous: ambiguous,
  });

  return {
    title,
    brief,
    note,
    actionItemCount: createdItemIds.length,
    contact: attached,
    contactAmbiguous: ambiguous,
  };
}
