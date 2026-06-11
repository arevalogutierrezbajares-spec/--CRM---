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
  // Capture-module surface (FR-CALL-ACC-1/3, RET-2): audio + provenance state.
  hasAudio: boolean;
  audioPurgeAt: Date | null;
  audioPurgedAt: Date | null;
  channels: number;
  sourceApp: string | null;
  partial: boolean;
  suspectFlags: string[];
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
  // Capture-module fields (CALL-CAPTURE-MODULE-V1) — absent for live-mic rows.
  audioPath?: string | null;
  audioBytes?: number | null;
  audioPurgeAt?: Date | null;
  channels?: number;
  sourceApp?: string | null;
  utterances?:
    | { speaker: string; channel: number; start: number; end: number; text: string }[]
    | null;
  suspectFlags?: string[] | null;
  partial?: boolean;
}): Promise<string> {
  const [row] = await db
    .insert(callRecordings)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      transcript: input.transcript,
      audioPath: input.audioPath ?? null,
      audioBytes: input.audioBytes ?? null,
      audioPurgeAt: input.audioPurgeAt ?? null,
      channels: input.channels ?? 1,
      sourceApp: input.sourceApp ?? null,
      utterances: input.utterances ?? null,
      suspectFlags: input.suspectFlags ?? null,
      partial: input.partial ?? false,
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
  consentNote?: string | null;
}): Promise<void> {
  const patch: Partial<CallRecordingRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.brief !== undefined) patch.brief = input.brief;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
  if (input.actionItemCount !== undefined)
    patch.actionItemCount = input.actionItemCount;
  if (input.consentNote !== undefined) patch.consentNote = input.consentNote;
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
      audioPath: callRecordings.audioPath,
      audioPurgeAt: callRecordings.audioPurgeAt,
      audioPurgedAt: callRecordings.audioPurgedAt,
      channels: callRecordings.channels,
      sourceApp: callRecordings.sourceApp,
      partial: callRecordings.partial,
      suspectFlags: callRecordings.suspectFlags,
    })
    .from(callRecordings)
    .leftJoin(contacts, eq(contacts.id, callRecordings.contactId))
    .where(eq(callRecordings.workspaceId, opts.workspaceId))
    .orderBy(desc(callRecordings.createdAt))
    .limit(opts.limit ?? 25);
  return rows.map(({ transcript, audioPath, suspectFlags, ...r }) => ({
    ...r,
    transcriptChars: transcript.length,
    hasAudio: Boolean(audioPath),
    suspectFlags: suspectFlags ?? [],
  }));
}

/**
 * FR-CALL-ACC-6: hard-delete a recording row. Returns the audio path (if any)
 * so the caller can remove the storage object too. Action items keep existing
 * (their callRecordingId FK nulls via ON DELETE SET NULL); the touch row, if
 * any, also remains — deleting tasks the founder may have acted on would be
 * surprising. "No artifacts" for capture-born rows means: transcript, brief,
 * utterances, audio all gone with the row.
 */
export async function deleteCallRecording(opts: {
  id: string;
  workspaceId: string;
}): Promise<{ deleted: boolean; audioPath: string | null }> {
  const rows = await db
    .delete(callRecordings)
    .where(
      and(
        eq(callRecordings.id, opts.id),
        eq(callRecordings.workspaceId, opts.workspaceId),
      ),
    )
    .returning({ audioPath: callRecordings.audioPath });
  return {
    deleted: rows.length === 1,
    audioPath: rows[0]?.audioPath ?? null,
  };
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
