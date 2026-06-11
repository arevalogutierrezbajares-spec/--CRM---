# AGB CRM - Call Capture Module V1 Requirements

**Version:** v1.0, 2026-06-10
**Status:** GigaRico requirements contract for a new AGB CRM module + macOS companion
**Scope:** Full-call capture (both sides, headphones included) from the founder's MacBook for WhatsApp desktop, Zoom/Meet, and cellular calls taken via Continuity; dual-channel transcription, speaker-attributed transcripts, AI filing (brief + note + action items) into the CRM, time-boxed audio retention.
**Source:** Founder request, 2026-06-10: "capture entire calls in my CRM from my laptop, transcribe calls when I am wearing headphones, capture both my voice and the participants' voices — record, transcript, summarize, action items." Brainstorm: `~/_bmad-output/brainstorming/brainstorming-session-2026-06-10-1923-call-capture-crm.md` (17 ideas, constraint map, morphological grid).
**Decisions locked (2026-06-10):** D1 = native menu-bar helper is the v1 capture layer. D2 = cellular calls in scope via Continuity (answer on Mac). D3 = trigger is auto-detect call start + confirm prompt. D4 = raw audio retained N days then purged (transcript permanent).
**Requirement count:** 46 FRs, 16 NFRs, 10 launch gates.
**ID prefix:** `FR-CALL-`, `NFR-CALL-`, `TASK-AGB-CALL-`.

> Reader contract: this document defines WHAT the capture system must do. The one binding architectural fact (from the constraint map): a web page cannot hear macOS system audio, so capture is owned by a native macOS companion ("the Helper"), while everything downstream — transcription, filing, storage, review — is owned by the existing AGB CRM web app and API. The Helper is an ear; the CRM stays the brain.

---

## 1. Product Boundary

| Layer | V1 Owner | Responsibility |
|---|---|---|
| Audio capture | macOS Helper (menu-bar companion) | Tap system audio output + microphone as two separate channels, regardless of output device (headphones, AirPods, speakers); detect call start/stop; local buffering |
| Call apps | WhatsApp desktop, Zoom, Meet (any browser), FaceTime, Continuity cellular | No per-app integration — all are system audio from the Helper's perspective |
| Cellular relay | iPhone Continuity ("Calls on Mac") | Founder answers cellular calls on the Mac; caller audio becomes system audio |
| Transcription | AGB CRM API + speech provider | Dual-channel speech-to-text with ES/EN code-switching |
| Filing | AGB CRM API + Claude (existing `file_call` flow) | Title, adaptive brief, CRM note, action items, contact matching |
| Storage & retention | AGB CRM (Postgres + object storage) | Transcript permanent on `call_recordings`; audio retained N days then purged |
| Review | AGB CRM web app (`/record` area) | Recordings list, transcript view, playback within retention window, re-file |
| Out of scope authority | — | Helper never writes to the CRM database directly; all writes go through authenticated CRM API |

## 2. Actors

| Actor | Definition |
|---|---|
| Founder | Tomas — the Mac's user, party to every captured call |
| Participant | The remote person(s) on the call; never authenticates; appears only as the far-side channel |
| Helper | The macOS menu-bar companion process |
| CRM | The AGB CRM web app + API (existing) |
| Filing Agent | The AI step that turns a transcript into brief/note/action items (existing `file_call`) |
| Purge Worker | Background process enforcing audio retention |

## 3. Strong V1 Scope

| Area | Included in V1 | Deferred (v1.1+ candidates) |
|---|---|---|
| Capture | System audio + mic, dual channel, all Mac call apps, Continuity cellular | iPhone-only capture away from Mac (Twilio number — Architecture #8), meeting bots (#9) |
| Trigger | Auto-detect call start + confirm prompt; manual start/stop fallback | Calendar pre-arm with attendee tagging (Trigger #12) |
| Transcription | Post-call batch, dual-channel, ES/EN code-switch | Live in-call streaming transcript from Helper |
| Attribution | Founder channel vs Participant channel (2 speakers) | Multi-participant diarization within the far-side channel; voice-prints |
| Filing | Existing brief/note/action-items flow, contact match, LoB/Project tagging | Commitment ledger both-directions (Distill #14), pre-call briefing popup (Ingest #15) |
| Privacy | Visible recording state, decline, off-the-record delete, N-day purge | Auto consent announcement, local-only transcription mode (Sovereign #10) |

---

## 4. Functional Requirements

### Capability Area CAP — Call Capture

Purpose: get both sides of any call on the Mac into a recording, with headphones on or off. Source: brainstorm Capture #1–#3, Architecture #6; decision D1, D2.

- FR-CALL-CAP-1 (MUST): Helper can record the audio the founder hears (system output) and the audio the founder speaks (microphone) for the duration of a call. Acceptance: a recorded WhatsApp desktop call contains both voices, intelligible end to end.
- FR-CALL-CAP-2 (MUST): Helper captures the founder-heard audio regardless of the active output device — wired headphones, AirPods, or speakers — with no per-device setup. Acceptance: same call recorded once on AirPods and once on speakers yields both voices both times.
- FR-CALL-CAP-3 (MUST): Helper keeps the founder's audio and participants' audio as two separate, time-aligned channels from capture through transcription. Acceptance: stored audio has two channels; either channel solo'd contains only that side's voice (echo bleed excepted).
- FR-CALL-CAP-4 (MUST): Helper captures calls from any application without app-specific configuration — WhatsApp desktop, Zoom, Meet in any browser, FaceTime, and Continuity cellular calls answered on the Mac. Acceptance: one call from each listed source captured with no settings changed between them.
- FR-CALL-CAP-5 (MUST): Helper continues a capture across mid-call output-device switches (e.g., AirPods battery dies → built-in speakers). Acceptance: device switch mid-call produces one continuous recording with at most 2s gap.
- FR-CALL-CAP-6 (MUST): Founder can stop a capture at any moment; stopping finalizes the recording and begins the filing flow. Acceptance: stop control ends capture within 1s.
- FR-CALL-CAP-7 (SHOULD): Founder can pause and resume capture mid-call (e.g., during an unrelated interruption). Paused intervals are absent from the recording and transcript. Acceptance: paused speech does not appear in transcript.
- FR-CALL-CAP-8 (SHOULD): Founder can discard the trailing portion of an in-progress capture ("off the record" — last N minutes, N selectable) without ending the recording. Source: Edge #16. Acceptance: discarded interval absent from stored audio and transcript.
- FR-CALL-CAP-9 (MUST): Helper supports calls of at least 3 hours without degradation or data loss. Acceptance: 3h test capture transcribes completely.

### Capability Area TRG — Call Detection & Trigger

Purpose: never forget to record; never record without an explicit yes. Source: Trigger #11; decision D3.

- FR-CALL-TRG-1 (MUST): Helper detects that a call has likely started (an application began using the microphone) and prompts the founder: record this call, yes or no. Acceptance: starting a WhatsApp call with the Helper running produces the prompt within 5s.
- FR-CALL-TRG-2 (MUST): Capture begins only after the founder affirms the prompt or starts manually; the prompt times out to NOT recording. Acceptance: ignoring the prompt for 60s results in no recording.
- FR-CALL-TRG-3 (MUST): Audio heard between call start and the founder's affirmation is included in the recording (pre-roll), so saying yes 20 seconds in loses nothing. Pre-roll of declined or timed-out prompts is discarded unrecoverably. Acceptance: affirm at t+20s → transcript includes t0 greeting; decline → no audio persisted.
- FR-CALL-TRG-4 (MUST): Founder can start a capture manually (menu-bar control and global hotkey) at any time, independent of detection. Acceptance: hotkey starts capture with no call detected.
- FR-CALL-TRG-5 (MUST): Helper detects call end (microphone released) and automatically finalizes the capture without founder action. Acceptance: hanging up finalizes and files the call hands-free.
- FR-CALL-TRG-6 (SHOULD): Founder can mark specific applications as never-prompt (e.g., dictation tools) and always-ask. Acceptance: excluded app triggers no prompt.
- FR-CALL-TRG-7 (MUST): The founder's decline of a detection prompt leaves zero persisted artifacts — no audio, no transcript, no CRM row. Acceptance: declined call absent from storage and database.

### Capability Area TRX — Upload & Transcription

Purpose: transcript is durable and faithful; bilingual reality respected. Source: Capture #4, Distill #13; existing Deepgram/Groq pipeline.

- FR-CALL-TRX-1 (MUST): Helper uploads captured audio to the CRM incrementally during the call, so a crash, sleep, or power loss forfeits at most the last 60 seconds. Acceptance: kill Helper mid-call → recording recoverable up to ≤60s before the kill.
- FR-CALL-TRX-2 (MUST): When offline or the CRM is unreachable, Helper queues captures locally and uploads automatically on reconnect, preserving order. Acceptance: capture on disabled Wi-Fi appears in CRM after reconnect, unprompted.
- FR-CALL-TRX-3 (MUST): CRM transcribes both channels of an uploaded call and produces a single time-ordered transcript. A 60-minute call transcribes within 10 minutes of upload completion. Acceptance: timestamped dialogue transcript exists within SLA.
- FR-CALL-TRX-4 (MUST): Transcription handles Spanish, English, and mid-sentence code-switching without language pre-selection. Acceptance: mixed ES/EN test call transcribes both languages correctly in one pass.
- FR-CALL-TRX-5 (MUST): The raw transcript is persisted durably before any AI filing step runs, and survives filing failures (existing durable-first pattern on `call_recordings`). Acceptance: filing-step outage still yields a stored transcript.
- FR-CALL-TRX-6 (SHOULD): Founder can trigger re-transcription of a call while its audio is within the retention window. Acceptance: re-transcribe replaces transcript, preserves recording identity.

### Capability Area ATT — Speaker Attribution

Purpose: who-said-what for free, from the two-channel design. Source: Capture #3.

- FR-CALL-ATT-1 (MUST): Every transcript utterance is attributed to either the Founder or the Participant side, derived from its channel — no AI speaker guessing for the two-party case. Acceptance: 20-utterance sample shows ≥95% correct side attribution.
- FR-CALL-ATT-2 (MUST): Transcripts render as a dialogue with speaker labels and timestamps, not as an unattributed text block. Acceptance: transcript view shows alternating labeled turns.
- FR-CALL-ATT-3 (SHOULD): When the call is matched to a CRM contact, the participant side is labeled with the contact's name in transcript and brief. Acceptance: matched call shows "Carlos:" not "Participant:".
- FR-CALL-ATT-4 (MAY): When multiple remote participants share the far-side channel, the system distinguishes them within that channel. Deferred-by-default; v1 labels the far side as one participant.

### Capability Area DST — Filing & Distillation

Purpose: "summarize" means "file the call." Source: Workflow #5, Distill #13; reuses existing `file_call` flow end-to-end.

- FR-CALL-DST-1 (MUST): After transcription, the system files the call automatically: a 3–8 word title, an adaptive-length brief, a 1–3 sentence CRM note, and zero or more action items — never inventing content absent from the transcript (existing `file_call` contract). Acceptance: filed call shows all four artifacts consistent with transcript.
- FR-CALL-DST-2 (MUST): The Filing Agent receives the speaker-attributed dialogue (not flattened text) so briefs can distinguish what the founder committed to vs what the participant committed to. Acceptance: brief correctly assigns "Tomas will send X" vs "Carlos will send Y" on a test call.
- FR-CALL-DST-3 (MUST): Action items are written in the language of the person who must act on them. Source: Distill #13. Acceptance: mixed-language call yields founder items in founder's working language.
- FR-CALL-DST-4 (MUST): Filed calls are matched to a CRM contact when the transcript or founder input identifies one; ambiguous matches are flagged for founder resolution rather than guessed (existing behavior). Acceptance: ambiguous name produces an unresolved-contact flag.
- FR-CALL-DST-5 (SHOULD): Founder can assign a filed call to a Line of Business or Project at review time, with a default suggested from the matched contact's history. Source: Edge #17. Acceptance: one-action assignment from the recording view.
- FR-CALL-DST-6 (SHOULD): Founder can edit the brief, note, contact link, and action items of a filed call after filing. Acceptance: edits persist and propagate to the contact timeline.
- FR-CALL-DST-7 (MAY): Filing extracts dated promises in both directions (founder-owed and participant-owed) as a structured commitment list. Source: Distill #14. Deferred-by-default to v1.1.

### Capability Area ACC — Review & Access

Purpose: captured calls are findable and usable inside the CRM.

- FR-CALL-ACC-1 (MUST): Founder can see all captured calls in a list with title, contact, date, duration, language, and action-item count (extends existing recordings list). Acceptance: new capture appears in list ≤1 min after filing.
- FR-CALL-ACC-2 (MUST): Founder can open a call to read the full attributed transcript and brief. Acceptance: transcript view reachable from list and from contact timeline.
- FR-CALL-ACC-3 (MUST): Founder can play back call audio while it remains within the retention window; after purge, the view states audio expired and shows transcript only. Acceptance: playback works day 1, absent with explanatory state day N+1.
- FR-CALL-ACC-4 (MUST): Filed calls appear on the matched contact's timeline as touches, alongside existing voice notes (existing pattern). Acceptance: contact page shows the call touch.
- FR-CALL-ACC-5 (SHOULD): Founder can search transcripts by text across all captured calls. Acceptance: searching a phrase spoken in one call returns that call.
- FR-CALL-ACC-6 (MUST): Founder can permanently delete a captured call — audio, transcript, and derived artifacts — in one action, with confirmation. Acceptance: deleted call leaves no audio, transcript, brief, or touch.

### Capability Area RET — Retention & Privacy

Purpose: time-boxed audio, permanent transcript, founder always in control. Source: decision D4; constraint map (consent).

- FR-CALL-RET-1 (MUST): Raw call audio is automatically purged N days after capture (default 30; founder-configurable workspace setting), while transcript and filing artifacts persist. Acceptance: day-N+1 job run leaves no audio object for the call; transcript intact.
- FR-CALL-RET-2 (MUST): The purge is verifiable: each recording shows its purge date while audio exists and its purged status after. Acceptance: recording view displays retention state.
- FR-CALL-RET-3 (MUST): While capture is active, a continuously visible indicator shows recording state on the Mac (menu-bar state at minimum). Acceptance: indicator visibly differs between recording / paused / idle.
- FR-CALL-RET-4 (MUST): Call audio and transcripts are accessible only to authenticated workspace members under existing CRM access rules; capture uploads require founder-scoped authentication. Acceptance: unauthenticated upload and cross-workspace read both rejected.
- FR-CALL-RET-5 (SHOULD): The recording view carries a consent posture note field (e.g., "participant informed verbally") the founder can set per call or default per call type. Acceptance: field persists and displays on the recording.

### Capability Area OPS — Helper Reliability & Operations

Purpose: an ear that never silently fails.

- FR-CALL-OPS-1 (MUST): Helper launches at login and runs continuously without founder attention; its menu-bar presence shows current state (idle / call detected / recording / uploading / error). Acceptance: reboot → Helper present and detecting without manual start.
- FR-CALL-OPS-2 (MUST): When the Helper lacks a required OS permission (screen/system-audio capture, microphone, notifications), it tells the founder exactly which permission is missing and how to grant it, rather than failing silently. Acceptance: each permission revoked in isolation produces a specific actionable alert.
- FR-CALL-OPS-3 (MUST): If capture fails mid-call (permission revoked, audio engine error), the Helper alerts the founder within 10 seconds so the call isn't assumed captured. Acceptance: induced mid-call failure raises a visible alert in SLA.
- FR-CALL-OPS-4 (MUST): A capture that produced near-silence on either channel (likely mis-routing) is flagged as suspect at filing time. Acceptance: call recorded with muted mic flags founder-channel-silent warning.
- FR-CALL-OPS-5 (MUST): Helper recovers from its own crash by resuming detection on relaunch and salvaging any incrementally-uploaded partial capture per FR-CALL-TRX-1. Acceptance: crash mid-call → partial recording filed with partial flag.
- FR-CALL-OPS-6 (SHOULD): Helper exposes a one-click diagnostic bundle (recent logs, permission states, last upload results) for troubleshooting. Acceptance: bundle generated and shareable.
- FR-CALL-OPS-7 (SHOULD): Helper checks for and applies its own updates with founder consent. Acceptance: outdated Helper surfaces update prompt.

---

## 5. Non-Functional Requirements

| ID | Requirement | Category | Priority |
|---|---|---|---|
| NFR-CALL-PERF-1 | Capture start (affirm → audio flowing to buffer) completes in <1s | Performance | Must |
| NFR-CALL-PERF-2 | Helper steady-state overhead <10% of one CPU core and <300MB RAM during capture | Performance | Must |
| NFR-CALL-PERF-3 | Call-detected prompt appears within 5s of an app opening the microphone | Performance | Must |
| NFR-CALL-PERF-4 | End-to-end (hang up → filed in CRM) within 15 min for a 60-min call | Performance | Must |
| NFR-CALL-REL-1 | Zero-loss durability: at most the final 60s of audio may be lost in any single failure (crash, power, network) | Reliability | Must |
| NFR-CALL-REL-2 | Detection works for ≥99% of calls from the four v1 sources over a 2-week live trial | Reliability | Must |
| NFR-CALL-REL-3 | Offline queue survives Helper restart and Mac reboot | Reliability | Must |
| NFR-CALL-SEC-1 | Audio encrypted in transit (TLS) and at rest; local Helper buffers stored in founder-only-readable locations and deleted after confirmed upload | Security | Must |
| NFR-CALL-SEC-2 | Helper authenticates to CRM with a revocable, founder-scoped credential; no long-lived static API keys in plaintext config | Security | Must |
| NFR-CALL-SEC-3 | Speech/AI providers used in modes that do not retain audio for training | Security/Privacy | Must |
| NFR-CALL-PRIV-1 | Purge job runs at least daily; a missed run catches up on next run (no audio outlives N+2 days) | Privacy | Must |
| NFR-CALL-PRIV-2 | Declined/timed-out call prompts persist no audio bytes beyond the in-memory pre-roll buffer | Privacy | Must |
| NFR-CALL-COST-1 | Variable cost ≤ $0.10 per captured hour (transcription + filing) at v1 volumes | Cost | Should |
| NFR-CALL-COMP-1 | Helper supports the founder's current macOS major version and one prior | Compatibility | Must |
| NFR-CALL-OBS-1 | Every capture has a traceable lifecycle record (detected → affirmed → uploaded → transcribed → filed/failed) queryable in the CRM | Observability | Must |
| NFR-CALL-STOR-1 | Stored audio ≤ ~60MB per call hour (compressed, dual-channel speech quality) | Storage | Should |

---

## 6. Launch Gates

Real-call verification, not synthetic-only. All gates pass before the module is declared shipped.

| Gate | Verification |
|---|---|
| G1 | WhatsApp desktop call wearing AirPods → both voices in transcript, correctly attributed, filed with brief + action items |
| G2 | Cellular call answered on Mac via Continuity → same end-to-end result |
| G3 | Zoom app call AND Meet-in-browser call → both captured with zero settings changes between them |
| G4 | Mixed Spanish/English call → faithful transcript, action items in actor's language |
| G5 | Mid-call AirPods → speakers switch → continuous recording, ≤2s gap |
| G6 | Wi-Fi disabled mid-call → call fully recovered and filed after reconnect |
| G7 | Helper killed mid-call → partial recording filed, ≤60s lost, partial flag visible |
| G8 | Decline prompt → forensically nothing persisted (storage + DB checked) |
| G9 | Retention: day-N+1 purge removes audio, transcript intact, UI shows purged state |
| G10 | 2-week live trial: ≥99% of real calls detected, zero silent failures |

---

## 7. Open Decisions (pre-filled — confirm or override)

| ID | Question | Recommendation |
|---|---|---|
| OD-1 | Consent practice for two-party-consent jurisdictions (FL): rely on verbal disclosure habit + FR-CALL-RET-5 posture note, or build an audible announcement? | Verbal habit + posture note for v1; revisit if client mix changes |
| OD-2 | Retention default N | 30 days |
| OD-3 | Helper distribution: local dev build vs notarized signed app | Local build for v1 (single user); notarize when anyone else installs it |
| OD-4 | Live in-call transcript streaming from Helper | Defer to v1.1; post-call batch is simpler and loses nothing the founder needs |
| OD-5 | Calendar pre-arm + attendee auto-tagging (Trigger #12) | Defer to v1.1 |
| OD-6 | Pre-call briefing popup (Ingest #15) | Defer; depends on detection maturity from v1 telemetry |
| OD-7 | Commitment ledger (FR-CALL-DST-7) | Defer to v1.1; revisit after 2 weeks of real briefs |

## 8. Code Reuse Map

| Bucket | Asset | Use |
|---|---|---|
| Lift | `db/queries/call-recordings.ts`, `call_recordings` schema | Extend with: audio object ref, channel metadata, source app, purge_at, lifecycle status |
| Lift | `/api/voice/call` `file_call` Claude tool + durable-first save | Filing stage as-is; prompt extended for attributed dialogue (FR-CALL-DST-2/3) |
| Lift | Recordings list + transcript UI (`components/voice/`) | Extend for dialogue rendering + playback + retention state |
| Adapt | `/api/voice/transcribe` batch route | Swap to dual-channel multichannel transcription provider call |
| Adapt | `/api/voice/live-token` short-lived-credential pattern | Template for Helper credential minting (NFR-CALL-SEC-2) |
| Net-new | macOS Helper app (capture, detection, prompt, buffer, incremental upload) | The only genuinely new surface |
| Net-new | Chunked upload endpoint + assembly; purge worker; lifecycle/observability records | CRM-side additions |

## 9. Traceability

| Source | FRs |
|---|---|
| Brainstorm Capture #1–#4 / Architecture #6 | CAP-1..9, TRX-1..5, boundary §1 |
| Brainstorm Trigger #11 / D3 | TRG-1..7 |
| Brainstorm Capture #3 (channel split) | ATT-1..3, DST-2 |
| Brainstorm Workflow #5 / existing `file_call` | DST-1..6, ACC-4 |
| Brainstorm Distill #13 | TRX-4, DST-3 |
| Brainstorm Edge #16, #17 | CAP-8, DST-5 |
| Decision D4 | RET-1..2, ACC-3, NFR-CALL-PRIV-1 |
| Constraint map (consent) | TRG-2/7, RET-3/5, OD-1 |
| Founder request (verbatim) | CAP-1/2/3, DST-1 |

## 10. Implementation Status (2026-06-10)

Built end-to-end in one session. CRM-side `33fbbc1` + Helper `906ce69` +
review-hardening `b53da8a` (local on `main`, **not yet pushed**).

**Verification done:**
- Unit 365 green (capture: wav codec, attribution, silent-channel, validators).
- Integration: capture token/session/lifecycle/abandon-race/retention all green
  (2 unrelated wa-agent intent tests pre-existing-fail).
- E2E (`scripts/e2e/capture-e2e.ts`) 40/40 against **real Deepgram + Claude** on
  a synthesized bilingual stereo call: attribution, filing, contact attach,
  idempotent finalize, missing-chunk resume, abandon zero-artifacts, crash
  salvage, retention purge, delete.
- Helper `swift test` 59/59; live `--simulate` filed 3 real calls end-to-end and
  resumed a crashed spool with zero loss.
- Production `next build` clean at `b53da8a` (isolated worktree).
- 6-dimension review army (45 agents) run + all CRITICAL/HIGH + key MEDIUM
  findings fixed in `b53da8a`.

**Launch-gate status (vs §6):**

| Gate | Status |
|---|---|
| G1 WhatsApp + AirPods, both voices attributed, filed | Server path proven via Helper simulate; **needs one real call with TCC grants** |
| G2 Continuity cellular | Needs real call |
| G3 Zoom app + Meet-in-browser, zero settings | Needs real calls |
| G4 Mixed ES/EN faithful + per-actor language | ✅ proven (E2E) |
| G5 mid-call device switch | Helper-designed; needs real call |
| G6 Wi-Fi drop mid-call → recovered | ✅ server half (E2E); Helper queue verified via simulate |
| G7 Helper killed mid-call → partial filed ≤60s lost | ✅ (Helper crash-resume + server salvage) |
| G8 decline → zero artifacts | ✅ (E2E) |
| G9 retention purge, transcript intact | ✅ (E2E) |
| G10 2-week live trial ≥99% detection | Pending real-world use |

Remaining gates need real calls with macOS TCC permissions granted to the Helper
app — they can only be exercised on the founder's machine, not in CI.

## 11. Production Cutover Runbook (operator)

The new code SELECTs new `call_recordings` columns, so the migration MUST land
on prod **before** the deploy or the live `/record` page breaks. Order:

1. **Apply migration 0020 to prod Supabase** (additive only — `ADD COLUMN IF NOT
   EXISTS`, `CREATE TABLE/INDEX/TYPE IF NOT EXISTS`; safe defaults backfill):
   `DATABASE_URL=<prod> npx drizzle-kit push` (or run `db/migrations/0020_call_capture.sql`).
2. **Create the private storage bucket** `agb-call-audio` (the code auto-creates
   it on first use via the service-role client, but pre-creating is cleaner).
3. **Push** `main` → Vercel auto-deploys.
4. **Mint a Helper token** in Settings → Call capture; configure + grant the
   Helper Microphone + Screen Recording (TCC binds to the `.app` bundle — install
   via `macos-helper/make-app.sh --install-login`).
5. **Run real-call launch gates** G1–G3, G5, G10.

Env already present in prod: `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Confirm the Deepgram account has the Model
Improvement Program disabled (NFR-CALL-SEC-3).
