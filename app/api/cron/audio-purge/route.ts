import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  listPurgeableRecordings,
  markAudioPurged,
  listStaleRecordingSessions,
  listStaleFailedSessions,
  listStaleFinalizingSessions,
  claimSessionForFinalize,
  reclaimFailedSession,
  reclaimStaleFinalizingSession,
} from "@/db/queries/capture-sessions";
import { listSessionChunkPaths, removeObjects } from "@/lib/capture/storage";
import { finalizeSession } from "@/lib/capture/finalize";
import {
  SESSION_STALE_MINUTES,
  FINALIZE_LEASE_MINUTES,
} from "@/lib/capture/constants";

export const maxDuration = 300;

const { users } = schema;

/**
 * Daily audio retention cron (FR-CALL-RET-1, NFR-CALL-PRIV-1) + crash-salvage
 * sweep (FR-CALL-OPS-5). Catch-up semantics: every run processes EVERYTHING
 * past due, so a missed day is healed on the next run.
 */
export async function GET(req: NextRequest) {
  // Auth posture matches the project's other cron routes: when CRON_SECRET is
  // set, Vercel Cron sends it as a Bearer token and we verify it (constant
  // time); when it's unset, the route runs open — the established convention
  // for this single-founder tool. Setting CRON_SECRET hardens ALL cron routes
  // at once and is the recommended production posture. (This route is low-risk
  // even when open: it only purges audio already past its retention date and
  // salvages stale sessions — both idempotent scheduled maintenance.)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  // 1. Purge expired audio. Storage delete FIRST, then the DB stamp — if the
  // delete fails we try again tomorrow; audio never outlives the stamp.
  let purged = 0;
  const failedIds = new Set<string>();
  for (;;) {
    const batch = await listPurgeableRecordings({ now, limit: 200 });
    // Failures stay un-stamped and would re-list forever — skip them this run.
    const pending = batch.filter((r) => !failedIds.has(r.id));
    if (pending.length === 0) break;
    for (const rec of pending) {
      const { failed } = await removeObjects([rec.audioPath]);
      if (failed.length === 0) {
        await markAudioPurged({ id: rec.id, workspaceId: rec.workspaceId });
        purged++;
      } else {
        failedIds.add(rec.id);
      }
    }
    if (batch.length < 200) break;
  }
  const purgeFailures = [...failedIds];

  // 2. Crash salvage: sessions still `recording` with a stale heartbeat get
  // finalized as partial so the founder never silently loses a captured call.
  const staleCutoff = new Date(now.getTime() - SESSION_STALE_MINUTES * 60 * 1000);
  const finalizingCutoff = new Date(
    now.getTime() - FINALIZE_LEASE_MINUTES * 60 * 1000,
  );
  // Includes:
  // - failed-without-recording sessions: a dead helper can't retry its own
  //   finalize, so the sweep re-attempts those once per run.
  // - finalizing sessions past their lease: a finalize that crashed mid-run
  //   (OOM/timeout) is wedged in `finalizing`; without this it's never retried.
  const stale = [
    ...(await listStaleRecordingSessions({ olderThan: staleCutoff })),
    ...(await listStaleFailedSessions({ olderThan: staleCutoff })),
    ...(await listStaleFinalizingSessions({ olderThan: finalizingCutoff })),
  ];
  let salvaged = 0;
  const salvageErrors: string[] = [];
  for (const session of stale) {
    let claimed: boolean;
    if (session.status === "recording") {
      claimed = await claimSessionForFinalize({
        id: session.id,
        workspaceId: session.workspaceId,
      });
    } else if (session.status === "failed") {
      claimed = await reclaimFailedSession({
        id: session.id,
        workspaceId: session.workspaceId,
      });
    } else {
      // status === "finalizing" — only win if the lease is genuinely expired.
      claimed = await reclaimStaleFinalizingSession({
        id: session.id,
        workspaceId: session.workspaceId,
        leaseCutoff: finalizingCutoff,
      });
    }
    if (!claimed) continue;
    const [creator] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, session.createdBy))
      .limit(1);
    const outcome = await finalizeSession({
      session,
      founderLabel: creator?.displayName?.split(/\s+/)[0] ?? "Founder",
      endedAt: session.lastChunkAt ?? now,
      durationSecs: null,
      totalChunks: null, // salvage mode: use whatever chunks exist
      partial: true,
    });
    if (outcome.ok) salvaged++;
    else salvageErrors.push(`${session.id}: ${outcome.error}`);
  }

  // 3. Reap chunk objects orphaned by abandons whose storage delete failed.
  const { captureSessions } = schema;
  const orphanCandidates = await db
    .select({ id: captureSessions.id, workspaceId: captureSessions.workspaceId })
    .from(captureSessions)
    .where(eq(captureSessions.status, "abandoned"))
    .limit(50);
  let reaped = 0;
  for (const s of orphanCandidates) {
    const paths = await listSessionChunkPaths(s.workspaceId, s.id);
    if (paths.length > 0) {
      const { failed } = await removeObjects(paths);
      reaped += paths.length - failed.length;
    }
  }

  return NextResponse.json({
    ok: true,
    purged,
    purgeFailures,
    salvaged,
    salvageErrors,
    orphanChunksReaped: reaped,
  });
}
