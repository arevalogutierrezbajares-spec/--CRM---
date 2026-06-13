import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { captureSessions, callRecordings, workspaces } = schema;

export type CaptureSessionRow = typeof captureSessions.$inferSelect;

export async function createCaptureSession(input: {
  workspaceId: string;
  createdBy: string;
  startedAt: Date;
  sourceApp?: string | null;
  sampleRate?: number;
  channels?: number;
  helperVersion?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(captureSessions)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      startedAt: input.startedAt,
      sourceApp: input.sourceApp ?? null,
      sampleRate: input.sampleRate ?? 16000,
      channels: input.channels ?? 2,
      helperVersion: input.helperVersion ?? null,
    })
    .returning({ id: captureSessions.id });
  return row.id;
}

export async function getCaptureSession(opts: {
  id: string;
  workspaceId: string;
}): Promise<CaptureSessionRow | null> {
  const [row] = await db
    .select()
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Chunk heartbeat: highest seq seen + arrival time (crash-sweep signal). */
export async function recordChunkHeartbeat(opts: {
  id: string;
  workspaceId: string;
  seq: number;
}): Promise<void> {
  await db
    .update(captureSessions)
    .set({
      lastChunkSeq: sql`GREATEST(COALESCE(${captureSessions.lastChunkSeq}, -1), ${opts.seq})`,
      lastChunkAt: new Date(),
    })
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
      ),
    );
}

export async function updateCaptureSession(opts: {
  id: string;
  workspaceId: string;
  patch: Partial<
    Pick<
      CaptureSessionRow,
      | "status"
      | "endedAt"
      | "durationSecs"
      | "totalChunks"
      | "partial"
      | "recordingId"
      | "error"
      | "sourceApp"
    >
  >;
}): Promise<void> {
  await db
    .update(captureSessions)
    .set(opts.patch)
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
      ),
    );
}

/**
 * Atomically claim a session for finalization: only one caller wins the
 * recording→finalizing transition (idempotent-finalize + sweep race safety).
 */
export async function claimSessionForFinalize(opts: {
  id: string;
  workspaceId: string;
}): Promise<boolean> {
  const rows = await db
    .update(captureSessions)
    // Stamp the lease so a crash that wedges this in `finalizing` is recoverable.
    .set({ status: "finalizing", finalizeStartedAt: new Date() })
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
        eq(captureSessions.status, "recording"),
      ),
    )
    .returning({ id: captureSessions.id });
  return rows.length === 1;
}

/**
 * Atomically abandon a session (FR-CALL-TRG-7). Only transitions from
 * `recording`/`failed` — a session that has already been claimed for finalize
 * (`finalizing`) or filed cannot be abandoned, which closes the race where an
 * in-flight finalize would otherwise resurrect off-the-record audio. Returns
 * false when no abandonable session matched (caller responds 409).
 */
export async function abandonSession(opts: {
  id: string;
  workspaceId: string;
  error?: string | null;
}): Promise<boolean> {
  const rows = await db
    .update(captureSessions)
    .set({ status: "abandoned", error: opts.error ?? null })
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
        inArray(captureSessions.status, ["recording", "failed"]),
      ),
    )
    .returning({ id: captureSessions.id });
  return rows.length === 1;
}

/** Re-claim a failed session for a retry of finalize. */
export async function reclaimFailedSession(opts: {
  id: string;
  workspaceId: string;
}): Promise<boolean> {
  const rows = await db
    .update(captureSessions)
    .set({ status: "finalizing", error: null, finalizeStartedAt: new Date() })
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
        eq(captureSessions.status, "failed"),
      ),
    )
    .returning({ id: captureSessions.id });
  return rows.length === 1;
}

/**
 * Re-claim a session whose `finalizing` LEASE has expired — i.e. a finalize
 * that crashed (OOM / timeout / process kill) after claiming and never
 * released the claim. Atomic: only the caller that wins the stale→fresh lease
 * transition proceeds, so a helper retry and the cron sweep can't double-run
 * finalize. A NULL `finalizeStartedAt` (claimed before this column existed)
 * counts as expired. Re-stamps the lease so this caller now owns it.
 */
export async function reclaimStaleFinalizingSession(opts: {
  id: string;
  workspaceId: string;
  leaseCutoff: Date;
}): Promise<boolean> {
  const rows = await db
    .update(captureSessions)
    .set({ finalizeStartedAt: new Date(), error: null })
    .where(
      and(
        eq(captureSessions.id, opts.id),
        eq(captureSessions.workspaceId, opts.workspaceId),
        eq(captureSessions.status, "finalizing"),
        sql`(${captureSessions.finalizeStartedAt} IS NULL OR ${captureSessions.finalizeStartedAt} < ${opts.leaseCutoff.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ id: captureSessions.id });
  return rows.length === 1;
}

/**
 * Sessions wedged in `finalizing` past the lease (crashed mid-finalize) →
 * crash salvage. Mirrors the stale-recording sweep; without it a finalize that
 * OOM'd is never retried by anything.
 */
export async function listStaleFinalizingSessions(opts: {
  olderThan: Date;
}): Promise<CaptureSessionRow[]> {
  return db
    .select()
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.status, "finalizing"),
        isNull(captureSessions.recordingId),
        sql`(${captureSessions.finalizeStartedAt} IS NULL OR ${captureSessions.finalizeStartedAt} < ${opts.olderThan.toISOString()}::timestamptz)`,
      ),
    )
    .limit(20);
}

/** Sessions stuck in `recording` with a stale heartbeat → crash salvage. */
export async function listStaleRecordingSessions(opts: {
  olderThan: Date;
}): Promise<CaptureSessionRow[]> {
  return db
    .select()
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.status, "recording"),
        sql`COALESCE(${captureSessions.lastChunkAt}, ${captureSessions.createdAt}) < ${opts.olderThan.toISOString()}::timestamptz`,
      ),
    )
    .limit(20);
}

/**
 * `failed` sessions that never produced a recording AND are stale — a dead
 * helper can't retry its own finalize, so the daily sweep must (one retry per
 * run; chunks are retained until a finalize succeeds).
 */
export async function listStaleFailedSessions(opts: {
  olderThan: Date;
}): Promise<CaptureSessionRow[]> {
  return db
    .select()
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.status, "failed"),
        isNull(captureSessions.recordingId),
        sql`COALESCE(${captureSessions.lastChunkAt}, ${captureSessions.createdAt}) < ${opts.olderThan.toISOString()}::timestamptz`,
      ),
    )
    .limit(20);
}

/** Recordings whose audio is past its purge date and not yet purged. */
export async function listPurgeableRecordings(opts: {
  now: Date;
  limit?: number;
}): Promise<
  { id: string; workspaceId: string; audioPath: string }[]
> {
  const rows = await db
    .select({
      id: callRecordings.id,
      workspaceId: callRecordings.workspaceId,
      audioPath: callRecordings.audioPath,
    })
    .from(callRecordings)
    .where(
      and(
        isNull(callRecordings.audioPurgedAt),
        lt(callRecordings.audioPurgeAt, opts.now),
      ),
    )
    // Oldest-due first + stable order so batched catch-up runs are
    // deterministic and a row whose delete failed can't mask newer due rows.
    .orderBy(asc(callRecordings.audioPurgeAt), asc(callRecordings.id))
    .limit(opts.limit ?? 200);
  return rows.filter((r): r is typeof r & { audioPath: string } =>
    Boolean(r.audioPath),
  );
}

export async function markAudioPurged(opts: {
  id: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .update(callRecordings)
    .set({ audioPurgedAt: new Date(), audioPath: null })
    .where(
      and(
        eq(callRecordings.id, opts.id),
        eq(callRecordings.workspaceId, opts.workspaceId),
      ),
    );
}

export async function getWorkspaceRetentionDays(
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ days: workspaces.callAudioRetentionDays })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.days ?? 30;
}

/** Capture audio settings: retention window + whether to store audio at all. */
export async function getWorkspaceCaptureSettings(
  workspaceId: string,
): Promise<{ retentionDays: number; storeCallAudio: boolean }> {
  const [row] = await db
    .select({
      days: workspaces.callAudioRetentionDays,
      store: workspaces.storeCallAudio,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return {
    retentionDays: row?.days ?? 30,
    storeCallAudio: row?.store ?? true,
  };
}
