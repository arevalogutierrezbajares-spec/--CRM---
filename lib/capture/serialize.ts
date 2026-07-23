import type { PostView } from "@/db/queries/town-hall";
import type {
  CallRecordingListItem,
  CallRecordingRow,
} from "@/db/queries/call-recordings";

/** PostView → the helper's wire shape. Shared by /api/capture/posts + /notes. */
export function serializePost(p: PostView) {
  return {
    id: p.id,
    author: p.authorName,
    body: p.body,
    kind: p.kind,
    createdAt: p.createdAt.toISOString(),
    references: p.refs.map((r) => ({ kind: r.refType, id: r.refId, label: r.label })),
    mentions: p.mentions.map((m) => ({ id: m.userId, name: m.displayName })),
    reactions: p.reactions.map((r) => ({ emoji: r.emoji, count: r.count, reactedByMe: r.mine })),
  };
}

/** Labels that mean "the founder side" — not participants worth listing. */
const GENERIC_SPEAKERS = new Set(["you", "founder"]);

const MAX_PARTICIPANTS = 6;

/**
 * Named participants for a recording: speakerMap display names plus distinct
 * utterance speaker labels resolved through speakerMap (SPEAKER_00 → "Carlos";
 * `founder:SPEAKER_00`-style keys resolve on their cluster suffix). Generic
 * "You"/"Founder" labels are dropped; deduped case-insensitively, capped at 6.
 */
export function deriveParticipants(
  speakerMap: Record<string, string> | null | undefined,
  utteranceSpeakers: readonly string[] | null | undefined,
): string[] {
  const map = speakerMap ?? {};
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed || GENERIC_SPEAKERS.has(trimmed.toLowerCase())) return;
    if (seen.has(trimmed.toLowerCase()) || out.length >= MAX_PARTICIPANTS) return;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  };
  for (const name of Object.values(map)) push(name);
  for (const label of utteranceSpeakers ?? []) {
    push(map[label] ?? (label.includes(":") ? map[label.split(":").pop()!] : undefined));
  }
  return out;
}

/** CallRecordingListItem → the helper's recordings-list wire shape. */
export function serializeRecordingSummary(r: CallRecordingListItem) {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    durationSecs: r.durationSecs,
    sourceApp: r.sourceApp,
    contactId: r.contactId,
    contactName: r.contactName,
    actionItemCount: r.actionItemCount,
    hasBrief: Boolean(r.brief),
    participants: deriveParticipants(r.speakerMap, r.utteranceSpeakers),
    partial: r.partial,
    suspectFlags: r.suspectFlags,
  };
}

/** Full recording row → the helper's detail wire shape (utterances as stored). */
export function serializeRecordingDetail(
  row: CallRecordingRow,
  contactName: string | null,
) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    durationSecs: row.durationSecs,
    sourceApp: row.sourceApp,
    contactId: row.contactId,
    contactName,
    brief: row.brief,
    transcript: row.transcript,
    utterances: row.utterances ?? [],
    speakerMap: row.speakerMap ?? null,
    transcriptEngine: row.transcriptEngine,
    suspectFlags: row.suspectFlags ?? [],
    partial: row.partial,
    language: row.language,
    actionItemCount: row.actionItemCount,
    meetingId: row.meetingId,
    // El Cuaderno: themed document + agenda (null for legacy recordings).
    themedDoc: row.themedDoc ?? null,
    agenda: row.agenda ?? null,
  };
}
