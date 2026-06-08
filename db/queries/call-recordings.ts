import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { callRecordings, contacts } = schema;

export type CallRecordingRow = typeof callRecordings.$inferSelect;

export type CallRecordingListItem = {
  id: string;
  title: string;
  brief: string | null;
  language: string | null;
  durationSecs: number | null;
  actionItemCount: number;
  contactId: string | null;
  contactName: string | null;
  createdAt: Date;
  transcriptChars: number;
};

/**
 * Create the recording row. Called FIRST in the save flow — before LLM
 * extraction or contact matching — so the transcript is durable no matter what
 * happens downstream. Returns the new id.
 */
export async function createCallRecording(input: {
  workspaceId: string;
  createdBy: string;
  transcript: string;
  durationSecs?: number | null;
  language?: string | null;
  title?: string;
}): Promise<string> {
  const [row] = await db
    .insert(callRecordings)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      transcript: input.transcript,
      durationSecs: input.durationSecs ?? null,
      language: input.language ?? null,
      title: input.title ?? "Call",
    })
    .returning({ id: callRecordings.id });
  return row.id;
}

/** Patch the recording with extracted title/brief/contact/item-count. */
export async function updateCallRecording(input: {
  id: string;
  workspaceId: string;
  title?: string;
  brief?: string | null;
  contactId?: string | null;
  actionItemCount?: number;
}): Promise<void> {
  const patch: Partial<CallRecordingRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.brief !== undefined) patch.brief = input.brief;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
  if (input.actionItemCount !== undefined)
    patch.actionItemCount = input.actionItemCount;
  if (Object.keys(patch).length === 0) return;
  await db
    .update(callRecordings)
    .set(patch)
    .where(
      and(
        eq(callRecordings.id, input.id),
        eq(callRecordings.workspaceId, input.workspaceId),
      ),
    );
}

/** Recent recordings for the workspace, newest first. */
export async function listCallRecordings(opts: {
  workspaceId: string;
  limit?: number;
}): Promise<CallRecordingListItem[]> {
  const rows = await db
    .select({
      id: callRecordings.id,
      title: callRecordings.title,
      brief: callRecordings.brief,
      language: callRecordings.language,
      durationSecs: callRecordings.durationSecs,
      actionItemCount: callRecordings.actionItemCount,
      contactId: callRecordings.contactId,
      contactName: contacts.name,
      createdAt: callRecordings.createdAt,
      transcript: callRecordings.transcript,
    })
    .from(callRecordings)
    .leftJoin(contacts, eq(contacts.id, callRecordings.contactId))
    .where(eq(callRecordings.workspaceId, opts.workspaceId))
    .orderBy(desc(callRecordings.createdAt))
    .limit(opts.limit ?? 25);
  return rows.map(({ transcript, ...r }) => ({
    ...r,
    transcriptChars: transcript.length,
  }));
}

/** Full recording including transcript (for the detail/expand view). */
export async function getCallRecording(opts: {
  id: string;
  workspaceId: string;
}): Promise<CallRecordingRow | null> {
  const [row] = await db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.id, opts.id),
        eq(callRecordings.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}
