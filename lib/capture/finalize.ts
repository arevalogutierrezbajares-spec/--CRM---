/**
 * Finalize pipeline core: chunks → assembled WAV → dual-channel transcription
 * → attributed dialogue → durable recording row → AI filing → chunk cleanup.
 * Shared by the finalize route (helper-driven) and the cron crash-salvage
 * sweep (FR-CALL-OPS-5) so a crashed call files exactly like a clean one.
 */
import "server-only";
import {
  getCaptureSession,
  updateCaptureSession,
  getWorkspaceRetentionDays,
  type CaptureSessionRow,
} from "@/db/queries/capture-sessions";
import { createCallRecording } from "@/db/queries/call-recordings";
import {
  listSessionChunkPaths,
  downloadObject,
  putObject,
  removeObjects,
  createSignedAudioUrl,
} from "./storage";
import { concatWavChunks, parseWavHeader, wavDurationSecs } from "./wav";
import {
  assembledObjectPath,
  chunkObjectPath,
  CAPTURE_SAMPLE_RATE,
  CAPTURE_CHANNELS,
} from "./constants";
import { transcribeDualChannel, buildDialogue } from "./deepgram";
import { fileCallTranscript, type FileCallResult } from "./file-call";

export type FinalizeOutcome =
  | {
      ok: true;
      recordingId: string;
      result: FileCallResult;
      suspectFlags: string[];
      partial: boolean;
    }
  | { ok: false; status: number; error: string; missing?: number[] };

export async function finalizeSession(opts: {
  session: CaptureSessionRow;
  founderLabel: string;
  endedAt: Date;
  durationSecs: number | null;
  totalChunks: number | null; // null = salvage mode: use whatever chunks exist
  partial: boolean;
  contactName?: string | null;
}): Promise<FinalizeOutcome> {
  const { session } = opts;
  const workspaceId = session.workspaceId;

  const fail = async (status: number, error: string): Promise<FinalizeOutcome> => {
    await updateCaptureSession({
      id: session.id,
      workspaceId,
      patch: { status: "failed", error: error.slice(0, 500) },
    });
    return { ok: false, status, error };
  };

  // 1. Inventory chunks. Object names sort by seq (zero-padded).
  const chunkPaths = await listSessionChunkPaths(workspaceId, session.id);
  if (chunkPaths.length === 0) {
    return fail(409, "No chunks uploaded for this session");
  }
  if (opts.totalChunks !== null) {
    const have = new Set(chunkPaths);
    const missing: number[] = [];
    for (let seq = 0; seq < opts.totalChunks; seq++) {
      if (!have.has(chunkObjectPath(workspaceId, session.id, seq))) {
        missing.push(seq);
      }
    }
    if (missing.length > 0) {
      // Not a failure — helper re-uploads the gaps and retries finalize.
      await updateCaptureSession({
        id: session.id,
        workspaceId,
        patch: { status: "recording" },
      });
      return { ok: false, status: 409, error: "Missing chunks", missing };
    }
  }

  // 2. Assemble. Sequential downloads; chunk order = name order = seq order.
  const buffers: Uint8Array[] = [];
  for (const path of chunkPaths) {
    const dl = await downloadObject(path);
    if (!dl.ok) return fail(502, `Chunk download failed: ${dl.error}`);
    buffers.push(dl.bytes);
  }
  const assembled = concatWavChunks(buffers, {
    sampleRate: CAPTURE_SAMPLE_RATE,
    channels: CAPTURE_CHANNELS,
  });
  if (!assembled) return fail(400, "Chunk format mismatch during assembly");

  const info = parseWavHeader(assembled);
  const audioDuration = info ? Math.round(wavDurationSecs(info)) : null;
  const durationSecs = audioDuration ?? opts.durationSecs ?? null;

  // 3. Store the assembled call under a recording-scoped path. We need the
  // recording id for the path, but the row needs the transcript… so the
  // assembled object is keyed by session id instead — stable + unique.
  // Transient storage hiccups ("fetch failed") get a couple of retries —
  // failing a whole call over one blip is the wrong trade.
  const audioPath = assembledObjectPath(workspaceId, session.id);
  let stored = await putObject(audioPath, assembled);
  for (const delayMs of [1000, 3000]) {
    if (stored.ok) break;
    await new Promise((r) => setTimeout(r, delayMs));
    stored = await putObject(audioPath, assembled);
  }
  if (!stored.ok) return fail(502, `Assembled upload failed: ${stored.error}`);

  // 4. Transcribe (Deepgram fetches via signed URL — audio stays out of RAM).
  const signed = await createSignedAudioUrl(audioPath, 60 * 30);
  if (!signed.ok) return fail(502, `Sign failed: ${signed.error}`);
  const tx = await transcribeDualChannel({
    audioUrl: signed.url,
    durationSecs: durationSecs ?? 0,
  });
  if (!tx.ok) return fail(502, tx.error);

  const founderLabel = opts.founderLabel;
  const participantLabel = (opts.contactName ?? "").trim() || "Participant";
  const dialogueText =
    tx.result.utterances.length > 0
      ? buildDialogue(tx.result.utterances, {
          founder: founderLabel,
          participant: participantLabel,
        })
      : "(no speech detected)";

  // 5. Durable-first recording row (FR-CALL-TRX-5): transcript + audio +
  // attribution persisted BEFORE any LLM filing.
  const retentionDays = await getWorkspaceRetentionDays(workspaceId);
  const recordingId = await createCallRecording({
    workspaceId,
    createdBy: session.createdBy,
    transcript: dialogueText,
    durationSecs,
    language: tx.result.language,
    audioPath,
    audioBytes: assembled.length,
    audioPurgeAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
    channels: CAPTURE_CHANNELS,
    sourceApp: session.sourceApp,
    utterances: tx.result.utterances,
    suspectFlags: tx.result.suspectFlags.length ? tx.result.suspectFlags : null,
    partial: opts.partial,
  });

  // 6. AI filing (brief/note/action items/contact). A filing failure never
  // loses the call — the row above already exists.
  let result: FileCallResult;
  try {
    result = await fileCallTranscript({
      workspaceId,
      userId: session.createdBy,
      recordingId,
      transcript: dialogueText,
      durationSecs,
      contactName: opts.contactName ?? null,
      attributed: true,
      founderLabel,
      spendRoute: "capture:finalize:file",
    });
  } catch (e) {
    result = {
      title: "Call",
      brief: "",
      note: "",
      actionItemCount: 0,
      contact: null,
      contactAmbiguous: false,
    };
    // Session still counts as filed (recording exists); error noted.
    await updateCaptureSession({
      id: session.id,
      workspaceId,
      patch: { error: `filing: ${String(e).slice(0, 400)}` },
    });
  }

  // 7. Mark filed + clean up chunk objects (assembled file is the artifact).
  await updateCaptureSession({
    id: session.id,
    workspaceId,
    patch: {
      status: "filed",
      endedAt: opts.endedAt,
      durationSecs,
      totalChunks: opts.totalChunks ?? chunkPaths.length,
      partial: opts.partial,
      recordingId,
    },
  });
  await removeObjects(chunkPaths);

  return {
    ok: true,
    recordingId,
    result,
    suspectFlags: tx.result.suspectFlags,
    partial: opts.partial,
  };
}

/** Re-read a filed session's result for idempotent finalize retries. */
export async function existingFinalizeResponse(opts: {
  sessionId: string;
  workspaceId: string;
}): Promise<{ recordingId: string } | null> {
  const session = await getCaptureSession({
    id: opts.sessionId,
    workspaceId: opts.workspaceId,
  });
  if (session?.status === "filed" && session.recordingId) {
    return { recordingId: session.recordingId };
  }
  return null;
}
