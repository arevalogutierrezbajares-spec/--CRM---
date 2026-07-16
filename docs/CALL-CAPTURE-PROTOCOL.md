# Call Capture Protocol v1 — Helper ↔ CRM wire contract

Binding contract between the macOS Capture Helper (`macos-helper/`) and the AGB CRM
capture API (`app/api/capture/*`). Implements CALL-CAPTURE-MODULE-V1 (§8 net-new).
Versioned: breaking changes bump `X-Capture-Protocol` (current: `1`).

## Audio format (fixed for v1)

- PCM16 little-endian WAV, **16 000 Hz, 2 channels, interleaved**.
- **Channel 0 (L) = founder microphone. Channel 1 (R) = system audio (participants).**
- Chunks: each chunk is a **standalone, valid WAV file** of up to 30 s of audio
  (~1.92 MB — safely under request body limits). The server strips the 44-byte
  canonical header and byte-concatenates PCM data in `seq` order on assembly.
  Helper MUST write canonical 44-byte headers (PCM fmt chunk, no extra chunks).
- Sequence numbers start at 0, contiguous. Re-uploading a `seq` overwrites it
  (idempotent retry).

## Authentication

Every request: `Authorization: Bearer agbcap_<64 hex>`.
Token is minted in CRM Settings (shown once); server stores only its SHA-256.
401 = invalid/revoked token (helper must surface "reconnect" state, FR-CALL-OPS-2).

## Endpoints

### `GET /api/capture/ping`
Token health + config check.
→ `200 { ok: true, workspaceId, userId, retentionDays }` | `401`.

### `POST /api/capture/sessions`
Start a capture session (called when the founder affirms the record prompt or
starts manually — i.e. once per recorded call, pre-roll already buffered locally).
Body:
```json
{ "startedAt": "ISO-8601", "sourceApp": "WhatsApp" | null,
  "sampleRate": 16000, "channels": 2, "format": "wav-pcm16",
  "helperVersion": "1.0.0" }
```
→ `201 { sessionId }`. Session lifecycle starts as `recording`.

### `PUT /api/capture/sessions/{id}/chunks/{seq}`
Raw body = the chunk's WAV bytes (`Content-Type: audio/wav`). ≤ 4 MB.
→ `200 { ok: true, bytes }` | `404` unknown/closed session | `413` too large.
Server updates `last_chunk_seq` / `last_chunk_at` (crash-sweep heartbeat).

### `POST /api/capture/sessions/{id}/finalize`
Call ended. Body:
```json
{ "endedAt": "ISO-8601", "durationSecs": 1234, "totalChunks": 42,
  "partial": false, "contactName": "Carlos" | null,
  "precomputedTranscript": {
    "language": "en",
    "engine": "whisperx",
    "utterances": [
      { "speaker": "SPEAKER_00", "diarizationId": "SPEAKER_00",
        "channel": 0, "start": 1.2, "end": 3.4, "text": "…" }
    ]
  } | null }
```
`contactName` (optional): founder-labeled far-side person name. When set, the
server labels dialogue turns as that name (not `"Participant"`) and attempts a
unique CRM contact match (FR-CALL-ATT-3 / FR-CALL-DST-4). The Mac Helper
persists this on the spool manifest mid-call so crash salvage still sends it.
Omit or null when unlabeled.

`precomputedTranscript` (optional, additive): local free STT+diarization from
the Mac Helper (WhisperX / Vibe / whisper.cpp). When present with ≥1 utterance,
the server **skips Deepgram** and files from these utterances. Used primarily
for **in-person meetings** (`sourceApp: "In-Person Meeting"`).

Server: verifies chunks 0..totalChunks-1 present (missing → `409 { missing: [seqs] }`,
helper re-uploads then retries finalize) → assembles single WAV → dual-channel
transcription (or precomputed) → speaker-attributed dialogue → AI filing → CRM rows.
Synchronous; may take ~1–10 min for long calls. Helper calls it from its queue
worker with a long timeout and retries on network failure (idempotent: a second
finalize of a `filed` session returns the existing result).
→ `200 { ok: true, recordingId, title, brief, actionItemCount,
        contact: {id,name} | null, suspectFlags: string[] }`

### `DELETE /api/capture/sessions/{id}`
Abandon (decline-after-start / full off-the-record). Deletes all uploaded chunks
and marks the session `abandoned`. Zero artifacts persist (FR-CALL-TRG-7).
→ `200 { ok: true }`.

## Helper-side obligations (not server-enforced)

- Pre-roll: ring-buffer ≥ 60 s before affirmation; declined prompt → buffer
  dropped in memory, no session ever created (NFR-CALL-PRIV-2).
- Chunks spooled to disk before upload attempt; spool survives restart
  (NFR-CALL-REL-3). Upload loop retries with backoff; offline queue preserves
  order (FR-CALL-TRX-2).
- Pause (FR-CALL-CAP-7): stop feeding audio; do not pad silence.
- Off-the-record last-N (FR-CALL-CAP-8): drop tail from local buffer/spool;
  re-upload affected seqs if already sent (overwrite semantics make this safe)
  — v1 helper only drops un-uploaded tail.
- Recording state always visible in menu bar (FR-CALL-RET-3).

## Server-side sweeps

- Sessions in `recording` with `last_chunk_at` > 30 min old → auto-finalize as
  `partial: true` (crash salvage, FR-CALL-OPS-5).
- `failed` sessions with no recording and a stale heartbeat → re-finalized once
  per run (a dead helper can't retry its own finalize).
- Abandoned/orphan chunk objects → removed by the daily purge cron.

## Data handling (NFR-CALL-SEC-3 / RET)

- **Audio in transit**: TLS to the CRM; TLS to Deepgram (which fetches the
  assembled call via a short-lived signed URL — the bytes never sit in a public
  object).
- **Audio at rest**: private Supabase bucket `agb-call-audio`, service-role
  access only; auto-purged after the workspace retention window (default 30 d,
  FR-CALL-RET-1). Transcripts are permanent.
- **Deepgram**: no-training is account-level (Model Improvement Program is
  opt-in and must stay disabled); we also pass `mip_opt_out=true` per request.
- **Anthropic**: the Messages API does not train on inputs under the commercial
  terms; filing requests are short-lived and not retained for training. Enable
  Zero-Data-Retention on the account if contractually required.
- **Declined calls**: a declined detection prompt creates no session and no
  bytes (helper-side, NFR-CALL-PRIV-2). A `DELETE` abandon removes all chunk
  objects and leaves only a content-free `capture_sessions` audit row
  (status `abandoned`) — no audio, transcript, or recording (FR-CALL-TRG-7).
- **Abandon vs finalize**: abandon is an atomic status transition that only
  succeeds from `recording`/`failed`; a session already claimed for finalize
  (`finalizing`) returns 409, closing the race where off-the-record audio could
  be resurrected into a filed recording.
